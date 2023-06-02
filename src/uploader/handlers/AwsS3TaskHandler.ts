import { SignatureV4 } from '@aws-sdk/signature-v4'
import { Sha256 } from '@aws-crypto/sha256-js'
import * as xml2js from 'xml2js'
import { CommonsTaskHandler } from './CommonsTaskHandler'
import {
  UploadTask,
  UploaderOptions,
  OSSProvider,
  S3Config,
  RequestToSign,
  QueryParameterBag,
  CompletedPart,
  FileChunk,
  UploadFile,
  Obj,
  AjaxResponse,
  StatusCode,
  RequestMethod,
  ResponseType,
} from '../../interface'
import { of, from, Observable, Subscriber } from 'rxjs'
import { tap, map, switchMap, catchError, mapTo, concatMap, filter, mergeMap } from 'rxjs/operators'
import { ajax } from 'rxjs/ajax'
import { Logger } from '../../shared'

const SHA256_HEADER = 'x-amz-content-sha256'
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'

interface FileExtraInfo {
  bucket?: string
  key?: string
  uploadId?: string
}

interface CompleteMultipartUploadResult {
  Bucket: string[]
  ETag: string[]
  Key: string[]
}

interface InitiateMultipartUploadResult {
  Bucket: string[]
  Key: string[]
  UploadId: string[]
}

const xml2jsParser = new xml2js.Parser()
const xml2jsBuilder = new xml2js.Builder()

export class AwsS3TaskHandler extends CommonsTaskHandler {
  private static _overwrite: boolean = false
  private requestBaseURL?: string
  private requestSigner?: SignatureV4
  private s3Config?: S3Config

  constructor(task: UploadTask, uploaderOptions: UploaderOptions) {
    super(task, uploaderOptions)
    !AwsS3TaskHandler._overwrite && this.processUploaderOptions()
  }

  private enable(task: UploadTask) {
    const { ossOptions } = this.uploaderOptions
    return ossOptions?.enable(task) && ossOptions.provider === OSSProvider.S3
  }

  abort(): this {
    this.abortTaskFiles()
    super.abort()
    return this
  }

  private abortTaskFiles() {
    let sub = of(...this.task.fileList)
      .pipe(
        filter((file) => {
          let { key, uploadId } = this.getFileExtraInfo(file)
          return !!key && !!uploadId && file.status !== StatusCode.Complete
        }),
        mergeMap((file) => {
          let { key, uploadId } = this.getFileExtraInfo(file)
          return this.abortMultipartUpload(key!, uploadId!)
        }, 10),
      )
      .subscribe({
        complete: () => {
          sub.unsubscribe()
          sub = null as any
        },
      })
  }

  private processUploaderOptions() {
    Logger.info('🚀 ~ file: AwsS3TaskHandler.ts ~ line 42 ~ AwsS3TaskHandler ~ processUploaderOptions', this)
    const { uploaderOptions } = this
    const { ossOptions, beforeFileUploadComplete, beforeFileUploadStart, beforeUploadResponseProcess } = uploaderOptions

    if (!ossOptions?.enable || ossOptions?.provider !== OSSProvider.S3) {
      throw new Error('ossOptions配置错误！')
    }
    let { chunkSize, chunked, requestBodyProcessFn, requestOptions } = uploaderOptions
    let { url, headers, responseType, method } = requestOptions
    uploaderOptions.chunkSize = chunked ? Math.max(chunkSize || 0, 1024 ** 2 * 5) : chunkSize

    uploaderOptions.requestOptions.responseType = (task: UploadTask, upfile: UploadFile, chunk: FileChunk) => {
      if (!this.enable(task)) {
        return typeof responseType === 'function' ? responseType(task, upfile, chunk) : (responseType as ResponseType)
      } else {
        return 'text'
      }
    }
    uploaderOptions.requestOptions.method = (task: UploadTask, upfile: UploadFile, chunk: FileChunk) => {
      if (!this.enable(task)) {
        return typeof method === 'function' ? method(task, upfile, chunk) : (method as RequestMethod)
      } else {
        return 'PUT'
      }
    }
    uploaderOptions.requestOptions.url = (task: UploadTask, upfile: UploadFile, chunk: FileChunk) => {
      if (!this.enable(task)) {
        return this.createObserverble(url, task, upfile, chunk).toPromise()
      }
      return this.getRequestBaseURL()
        .pipe(
          map((baseURL: string) => {
            let { key, uploadId } = this.getFileExtraInfo(upfile)
            return `${baseURL}/${key}?partNumber=${chunk.index + 1}&uploadId=${uploadId}`
          }),
        )
        .toPromise()
    }
    uploaderOptions.requestOptions.headers = (task: UploadTask, upfile: UploadFile, chunk: FileChunk) => {
      if (!this.enable(task)) {
        return this.createObserverble(headers, task, upfile, chunk).toPromise()
      }
      return this.getRequestBaseURL()
        .pipe(
          map((baseURL: string) => {
            let { key, uploadId } = this.getFileExtraInfo(upfile)
            return {
              url: `${baseURL}/${key}`,
              method: uploaderOptions.requestOptions.method!,
              headers: { [SHA256_HEADER]: UNSIGNED_PAYLOAD },
              query: { partNumber: String(chunk.index + 1), uploadId: uploadId! },
            } as RequestToSign
          }),
          switchMap((requestToSign) => this.signRequest(requestToSign)),
          map(({ headers }) => {
            return {
              'Content-Type': 'application/octet-stream; charset=UTF-8',
              ...headers,
            }
          }),
        )
        .toPromise()
    }
    uploaderOptions.requestBodyProcessFn = (task: UploadTask, upfile: UploadFile, chunk: FileChunk, params: Obj) => {
      if (this.enable(task)) {
        return params.file
      } else {
        return requestBodyProcessFn?.(task, upfile, chunk, params)
      }
    }

    const overwriteFns = this.getOverwriteFns()
    if (beforeFileUploadComplete?.name !== overwriteFns.overwriteBeforeFileUploadComplete.name) {
      uploaderOptions.beforeFileUploadComplete = overwriteFns.overwriteBeforeFileUploadComplete
    }
    if (beforeFileUploadStart?.name !== overwriteFns.overwriteBeforeFileUploadStart.name) {
      uploaderOptions.beforeFileUploadStart = overwriteFns.overwriteBeforeFileUploadStart
    }
    if (beforeUploadResponseProcess?.name !== overwriteFns.overwriteBeforeUploadResponseProcess.name) {
      uploaderOptions.beforeUploadResponseProcess = overwriteFns.overwriteBeforeUploadResponseProcess
    }
    AwsS3TaskHandler._overwrite = true
  }

  private getOverwriteFns() {
    const { uploaderOptions } = this
    const { beforeFileUploadComplete, beforeFileUploadStart, beforeUploadResponseProcess } = uploaderOptions
    return {
      overwriteBeforeFileUploadStart: (task: UploadTask, upFile: UploadFile) => {
        const extraInfo: FileExtraInfo = this.getFileExtraInfo(upFile)

        const beforeUpload = () => {
          return beforeFileUploadStart?.(task, upFile) || Promise.resolve()
        }

        if (!this.enable(task)) {
          return beforeUpload()
        }

        const getObjectKey = () => {
          const objectKey = uploaderOptions.ossOptions?.keyGenerator?.(upFile, task) || Promise.resolve('')
          return this.toObserverble(objectKey).pipe(
            map((key) => {
              return (extraInfo.key = key)
            }),
          )
        }

        const createMultipartUpload = () => {
          if (extraInfo.uploadId) {
            return of(extraInfo)
          }

          return getObjectKey().pipe(
            switchMap((key) => this.createMultipartUpload(key)),
            tap(({ uploadId, bucket }) => Object.assign(extraInfo, { uploadId, bucket })),
          )
        }

        return of(null).pipe(concatMap(createMultipartUpload), concatMap(beforeUpload)).toPromise()
      },
      overwriteBeforeFileUploadComplete: (task: UploadTask, file: UploadFile) => {
        const beforeFileComplete = () => beforeFileUploadComplete?.(task, file) || Promise.resolve()

        if (!this.enable(task)) {
          return beforeFileComplete()
        }

        const completeMultipartUpload = () => {
          if (file.response.etag) {
            return of(file.response)
          }
          return new Observable((subscriber: Subscriber<Obj>) => {
            let { key, uploadId } = this.getFileExtraInfo(file)
            let parts: CompletedPart[] = file.chunkList?.map((ck: FileChunk) => ({
              ETag: ck.response.etag,
              PartNumber: ck.index + 1,
            }))
            this.completeMultipartUpload(key!, uploadId!, parts)
              .pipe(
                tap((res: Obj) => {
                  file.response = res
                }),
              )
              .subscribe(subscriber)
          })
        }
        return of(null).pipe(concatMap(completeMultipartUpload), concatMap(beforeFileComplete)).toPromise()
      },
      overwriteBeforeUploadResponseProcess: (
        task: UploadTask,
        file: UploadFile,
        chunk: FileChunk,
        response: AjaxResponse,
      ) => {
        if (!this.enable(task)) {
          return Promise.resolve()
        }

        let etag = response.xhr.getResponseHeader('etag')?.replace(/['"]/g, '') || ''
        response.response = { etag }
        return beforeUploadResponseProcess?.(task, file, chunk, response) || Promise.resolve()
      },
    }
  }

  private createMultipartUpload(key: string) {
    const job = (baseURL: string) => {
      let requestToSign = {
        url: `${baseURL}/${key}?uploads`,
        method: 'POST',
        query: { uploads: '' },
      }
      return from(this.signRequest(requestToSign)).pipe(
        switchMap(({ method, body, headers }) => {
          return ajax({
            url: requestToSign.url,
            method,
            body,
            headers,
            responseType: 'text',
          }).pipe(
            switchMap((res: AjaxResponse) => from(xml2jsParser.parseStringPromise(res.response))),
            map((res: { InitiateMultipartUploadResult: InitiateMultipartUploadResult }) => {
              let { Bucket, Key, UploadId } = res?.InitiateMultipartUploadResult
              return { bucket: Bucket[0], key: Key[0], uploadId: UploadId[0] }
            }),
          )
        }),
      )
    }
    return this.getRequestBaseURL().pipe(switchMap(job))
  }

  protected uploadPart(key: string, partNumber: number, uploadId: string, body: any) {
    const job = (baseURL: string) => {
      let requestToSign = {
        url: `${baseURL}/${key}`,
        method: 'PUT',
        headers: { [SHA256_HEADER]: UNSIGNED_PAYLOAD },
        query: { partNumber: String(partNumber), uploadId },
        body,
      }
      return from(this.signRequest(requestToSign)).pipe(
        switchMap(({ query, method, body, headers }) => {
          let queryString = this.stringifyQuery(query)
          let url = queryString ? requestToSign.url + '?' + queryString : requestToSign.url
          return ajax({
            url,
            method,
            body,
            headers: {
              'Content-Type': 'application/octet-stream; charset=UTF-8',
              ...headers,
            },
            responseType: 'text',
          }).pipe(
            map((res) => {
              let etag = res.xhr.getResponseHeader('etag')?.replace(/['"]/g, '') || ''
              return { uploadId, key, partNumber, etag }
            }),
          )
        }),
      )
    }
    return this.getRequestBaseURL().pipe(switchMap(job))
  }

  private completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]) {
    const job = (baseURL: string) => {
      let requestToSign = {
        url: `${baseURL}/${key}`,
        method: 'POST',
        query: { uploadId },
        headers: { [SHA256_HEADER]: UNSIGNED_PAYLOAD },
        body: xml2jsBuilder.buildObject({
          CompleteMultipartUpload: {
            $: {
              xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/',
            },
            Part: parts.sort((a, b) => a.PartNumber - b.PartNumber),
          },
        }),
      }
      return from(this.signRequest(requestToSign)).pipe(
        switchMap(({ method, body, headers, query }) => {
          let queryString = this.stringifyQuery(query)
          let url = queryString ? requestToSign.url + '?' + queryString : requestToSign.url
          return ajax({
            url,
            method,
            body,
            headers: {
              'Content-Type': 'application/octet-stream; charset=UTF-8',
              ...headers,
            },
            responseType: 'text',
          }).pipe(
            switchMap((res: AjaxResponse) => from(xml2jsParser.parseStringPromise(res.response))),
            map((res: { CompleteMultipartUploadResult: CompleteMultipartUploadResult }) => {
              let { Bucket, ETag, Key } = res.CompleteMultipartUploadResult || {}
              return {
                uploadId,
                bucket: Bucket[0],
                etag: ETag[0],
                key: Key[0],
              }
            }),
          )
        }),
      )
    }
    return this.getRequestBaseURL().pipe(switchMap(job))
  }

  private abortMultipartUpload(key: string, uploadId: string) {
    const job = (baseURL: string) => {
      let requestToSign = {
        url: `${baseURL}/${key}`,
        method: 'DELETE',
        query: { uploadId },
        headers: { [SHA256_HEADER]: UNSIGNED_PAYLOAD },
      }

      return from(this.signRequest(requestToSign)).pipe(
        switchMap(({ method, headers, query }) => {
          let queryString = this.stringifyQuery(query)
          let url = queryString ? requestToSign.url + '?' + queryString : requestToSign.url
          return ajax({
            url,
            method,
            headers,
            responseType: 'text',
          }).pipe(
            mapTo(true),
            catchError(() => of(false)),
          )
        }),
      )
    }
    return this.getRequestBaseURL().pipe(switchMap(job))
  }

  private async signRequest(requestToSign: RequestToSign, signatureV4?: SignatureV4) {
    Logger.info(
      '🚀 ~ file: AwsS3TaskHandler.ts ~ line 324 ~ AwsS3TaskHandler ~ signRequest ~ requestToSign',
      requestToSign,
    )
    let { url, method, query, headers, body } = requestToSign
    let { pathname, hostname, host, protocol, origin } = new URL(url)
    headers = Object.assign(headers || {}, { host })
    url = origin + pathname
    signatureV4 = signatureV4 ?? (await this.getRequestSigner().toPromise())
    let signed = await signatureV4.sign({
      method,
      headers,
      query,
      path: pathname,
      hostname,
      protocol,
      body,
    })
    Logger.info('🚀 ~ file: AwsS3TaskHandler.ts ~ line 79 ~ AwsS3TaskHandler ~ signRequest ~ signed', signed)
    delete signed.headers.host
    return signed
  }

  private stringifyQuery(params: QueryParameterBag = {}) {
    return Object.keys(params)
      .map((k) => `${k}=${params[k]}`)
      .join('&')
  }

  private getS3Config() {
    if (this.s3Config) {
      return of(this.s3Config)
    }
    const { ossOptions } = this.uploaderOptions
    return this.createObserverble(ossOptions!.s3Config).pipe(
      tap((s3config) => {
        this.s3Config = s3config
      }),
    )
  }

  private getRequestBaseURL() {
    if (this.requestBaseURL && /^https?:\/\//.test(this.requestBaseURL)) {
      return of(this.requestBaseURL)
    }
    return this.getS3Config().pipe(
      map((s3Config) => {
        const { endpoint } = s3Config!
        return (this.requestBaseURL = `${endpoint?.protocol}//${endpoint?.hostname}`)
      }),
    )
  }

  private getRequestSigner() {
    if (this.requestSigner) {
      return of(this.requestSigner)
    }
    return this.getS3Config().pipe(
      map((s3Config) => {
        const { region, credentials } = s3Config!
        return (this.requestSigner = new SignatureV4({
          service: 's3',
          credentials,
          region,
          sha256: Sha256,
          uriEscapePath: false,
        }))
      }),
    )
  }

  private getFileExtraInfo(file: UploadFile): FileExtraInfo {
    file.extraInfo = file.extraInfo || {}
    return file.extraInfo as FileExtraInfo
  }
}
