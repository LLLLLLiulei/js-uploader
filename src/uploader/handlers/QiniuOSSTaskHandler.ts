import {
  UploadTask,
  UploaderOptions,
  FileChunk,
  UploadFile,
  Protocol,
  Obj,
  OSSProvider,
  RequestMethod,
} from '../../interface'
import { Observable, from, of } from 'rxjs'
import { ajax, AjaxResponse } from 'rxjs/ajax'
import { CommonsTaskHandler } from './CommonsTaskHandler'
import { urlSafeBase64Decode, urlSafeBase64Encode } from '../../shared/base64'
import { concatMap, tap } from 'rxjs/operators'
import { Logger } from '../../shared'

interface PutPolicy {
  ak: string
  scope: string
}

interface UpHosts {
  up: {
    acc: {
      main: string[]
    }
  }
}

interface FileExtraInfo {
  host?: string
  uptoken?: string
  key?: string
}

export class QiniuOSSTaskHandler extends CommonsTaskHandler {
  private chunkSize: number = 4 * 1024 ** 2
  private static HOST_MAP: Map<string, UpHosts> = new Map<string, UpHosts>()
  private static _overwrite: boolean = false

  constructor(task: UploadTask, uploaderOptions: UploaderOptions) {
    super(task, uploaderOptions)
    !QiniuOSSTaskHandler._overwrite && this.processUploaderOptions()
  }

  private enable(task: UploadTask) {
    const { ossOptions } = this.uploaderOptions
    return ossOptions?.enable(task) && ossOptions.provider === OSSProvider.Qiniu
  }

  private processUploaderOptions() {
    Logger.warn('QiniuOSSTaskHandler -> processUploaderOptions -> processUploaderOptions', this)
    const { uploaderOptions } = this
    const { ossOptions, beforeFileUploadComplete, beforeFileUploadStart } = uploaderOptions

    if (!ossOptions?.enable || ossOptions?.provider !== OSSProvider.Qiniu) {
      throw new Error('ossOptions配置错误！')
    }

    let { requestOptions, requestBodyProcessFn } = uploaderOptions
    let { headers, url, method } = requestOptions

    uploaderOptions.chunkSize = this.chunkSize
    uploaderOptions.requestOptions.url = (task: UploadTask, upfile: UploadFile, chunk: FileChunk) => {
      if (this.enable(task)) {
        return this.getUploadBlockUrl(this.getFileExtraInfo(upfile).host || '', chunk.size)
      } else {
        return this.createObserverble(url, task, upfile, chunk).toPromise()
      }
    }
    uploaderOptions.requestOptions.headers = (task: UploadTask, upfile: UploadFile, chunk: FileChunk) => {
      if (this.enable(task)) {
        return {
          'Content-Type': 'application/octet-stream',
          Authorization: `UpToken ${this.getFileExtraInfo(upfile).uptoken || ''}`,
        }
      } else {
        return this.createObserverble(headers, task, upfile, chunk).toPromise()
      }
    }
    uploaderOptions.requestOptions.method = (task: UploadTask, upfile: UploadFile, chunk: FileChunk) => {
      if (this.enable(task)) {
        return 'POST'
      } else {
        return typeof method === 'function' ? method(task, upfile, chunk) : (method as RequestMethod)
      }
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
    QiniuOSSTaskHandler._overwrite = true
  }

  private getOverwriteFns() {
    const { uploaderOptions } = this
    const { beforeFileUploadComplete, beforeFileUploadStart } = uploaderOptions
    return {
      overwriteBeforeFileUploadStart: (task: UploadTask, upFile: UploadFile) => {
        const extraInfo: FileExtraInfo = this.getFileExtraInfo(upFile)

        const beforeUpload = () => {
          return beforeFileUploadStart?.(task, upFile) || Promise.resolve()
        }

        if (!this.enable(task)) {
          return beforeUpload()
        }

        const getUpToken = () => {
          const uptoken = uploaderOptions.ossOptions?.uptokenGenerator?.(upFile, task) || Promise.resolve('')
          return this.toObserverble(uptoken).pipe(
            tap((token) => {
              extraInfo.uptoken = token
            }),
          )
        }

        const getObjectKey = () => {
          const objectKey = uploaderOptions.ossOptions?.keyGenerator?.(upFile, task) || Promise.resolve('')
          return this.toObserverble(objectKey).pipe(
            tap((key) => {
              extraInfo.key = key
            }),
          )
        }

        const getUploadUrlFn = (token: string) =>
          from(this.getUploadUrl(token)).pipe(
            tap((host) => {
              extraInfo.host = host
            }),
          )

        return of(null)
          .pipe(
            concatMap(getUpToken),
            concatMap((token) => getUploadUrlFn(token)),
            concatMap(getObjectKey),
            concatMap(beforeUpload),
          )
          .toPromise()
      },
      overwriteBeforeFileUploadComplete: (task: UploadTask, file: UploadFile) => {
        const beforeFileComplete = () => beforeFileUploadComplete?.(task, file) || Promise.resolve()

        if (!this.enable(task)) {
          return beforeFileComplete()
        }

        const mergeFileRequest = (): Observable<AjaxResponse> => {
          const extraInfo: FileExtraInfo = this.getFileExtraInfo(file)
          const url = this.getMakeFileUrl(extraInfo.host || '', file.size, file.extraInfo?.key)
          const headers = {
            'Content-Type': 'text/plain',
            Authorization: `UpToken ${extraInfo.uptoken || ''}`,
          }
          const body = file.chunkList
            ?.map((ck: FileChunk) => {
              let response = typeof ck.response === 'string' ? JSON.parse(ck.response) : ck.response
              return response?.ctx
            })
            .join()
          return ajax.post(url, body, headers).pipe(
            tap((res: AjaxResponse) => {
              file.response = res.response
            }),
          )
        }
        return of(null).pipe(concatMap(mergeFileRequest), concatMap(beforeFileComplete)).toPromise()
      },
    }
  }

  private getFileExtraInfo(file: UploadFile): FileExtraInfo {
    file.extraInfo = file.extraInfo || {}
    return file.extraInfo as FileExtraInfo
  }

  private async getUploadUrl(token: string): Promise<string> {
    let reg = /^https?:/
    let protocol: Protocol = location.protocol as Protocol
    if (!reg.test(protocol)) {
      let res = reg.exec(location.origin)
      protocol = (res?.length ? res[0] : 'http:') as Protocol
    }

    const data = await this.getUpHosts(token, protocol)
    const hosts = data.up.acc.main
    return `${protocol}//${hosts[0]}`
  }

  private getMakeFileUrl(host: string, fileSize: number, key: string): string {
    if (key) {
      return `${host}/mkfile/${fileSize}/key/${urlSafeBase64Encode(key)}`
    } else {
      return `${host}/mkfile/${fileSize}`
    }
  }

  private getUploadBlockUrl(host: string, blockSize: number): string {
    return `${host}/mkblk/${blockSize}`
  }

  private async getUpHosts(token: string, protocol: Protocol): Promise<UpHosts> {
    const putPolicy = this.getPutPolicy(token)
    const k = `${putPolicy.ak}--${putPolicy.bucket}`
    let hosts = QiniuOSSTaskHandler.HOST_MAP.get(k)
    if (!hosts) {
      const url = `${protocol}//api.qiniu.com/v2/query?ak=${putPolicy.ak}&bucket=${putPolicy.bucket}`
      const ob$: Observable<UpHosts> = ajax.getJSON(url)
      hosts = await ob$.toPromise()
      QiniuOSSTaskHandler.HOST_MAP.set(k, hosts)
    }
    return hosts
  }

  private getPutPolicy(token: string) {
    const segments = token.split(':')
    // token 构造的差异参考：https://github.com/qbox/product/blob/master/kodo/auths/UpToken.md#admin-uptoken-authorization
    const ak = segments.length > 3 ? segments[1] : segments[0]
    const putPolicy: PutPolicy = JSON.parse(urlSafeBase64Decode(segments[segments.length - 1]))
    return {
      ak,
      bucket: putPolicy.scope.split(':')[0],
    }
  }
}
