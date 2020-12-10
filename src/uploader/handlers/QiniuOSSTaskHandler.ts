import { Observable, forkJoin, from, of } from 'rxjs'
import { ajax, AjaxResponse } from 'rxjs/ajax'
import { CommonsTaskHandler } from './CommonsTaskHandler'
import { urlSafeBase64Decode, urlSafeBase64Encode } from '../../shared/base64'
import { concatMap, mergeMap, switchMap, tap } from 'rxjs/operators'
import { Protocol, StringKeyObject, UploaderOptions, UploadFile, UploadTask } from '../../types'

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

  constructor (task: UploadTask, uploaderOptions: UploaderOptions) {
    super(task, uploaderOptions)
    // this.processUploaderOptions()
  }

  // private processUploaderOptions () {
  //   console.warn('QiniuOSSTaskHandler -> processUploaderOptions -> processUploaderOptions')
  //   const { task, uploaderOptions } = this
  //   const { ossConfig, beforeFileUploadComplete, beforeFileUploadStart } = uploaderOptions

  //   if (!ossConfig || !ossConfig.enable || !ossConfig.provider) {
  //     throw new Error('ossConfig配置错误！')
  //   }

  //   uploaderOptions.chunkSize = this.chunkSize
  //   uploaderOptions.serverURL = (task: UploadTask, upfile: UploadFile, chunk: FileChunk) => {
  //     return this.getUploadBlockUrl(this.getFileExtraInfo(upfile).host || '', chunk.size || this.chunkSize)
  //   }
  //   uploaderOptions.requestHeaders = (task: UploadTask, upfile: UploadFile) => {
  //     return {
  //       'Content-Type': 'application/octet-stream',
  //       Authorization: `UpToken ${this.getFileExtraInfo(upfile).uptoken || ''}`,
  //     }
  //   }
  //   uploaderOptions.requestBodyProcessFn = (params: StringKeyObject) => {
  //     return params[uploaderOptions.fileParameterName || 'file']
  //   }
  //   uploaderOptions.beforeFileUploadComplete = (file: UploadFile, task: UploadTask) => {
  //     const beforeFileComplete = () => beforeFileUploadComplete?.(file, task) || Promise.resolve()
  //     const mergeFileRequest = (): Observable<AjaxResponse> => {
  //       const extraInfo: FileExtraInfo = this.getFileExtraInfo(file)
  //       const url = this.getMakeFileUrl(extraInfo.host || '', file.size, file.extraInfo?.key)
  //       const headers = {
  //         'Content-Type': 'text/plain',
  //         Authorization: `UpToken ${extraInfo.uptoken || ''}`,
  //       }
  //       const body = file.chunkList?.map((ck) => ck.response?.response.ctx).join()
  //       return ajax.post(url, body, headers)
  //     }
  //     return forkJoin(mergeFileRequest(), this.toObserverble(beforeFileComplete())).toPromise()
  //   }
  //   uploaderOptions.beforeFileUploadStart = (upFile: UploadFile) => {
  //     const extraInfo: FileExtraInfo = this.getFileExtraInfo(upFile)

  //     const beforeUpload = () => {
  //       return beforeFileUploadStart?.(upFile, task) || Promise.resolve()
  //     }

  //     const getUpToken = () => {
  //       console.log('QiniuOSSTaskHandler -> getUpToken -> getUpToken')
  //       const uptoken = uploaderOptions.ossConfig?.uptokenGenerator(upFile, task) || Promise.resolve('')
  //       return this.toObserverble(uptoken).pipe(
  //         tap((token) => {
  //           extraInfo.uptoken = token
  //         }),
  //       )
  //     }

  //     const getObjectKey = () => {
  //       console.log('QiniuOSSTaskHandler -> getObjectKey -> getObjectKey')
  //       const objectKey = uploaderOptions.ossConfig?.objectKeyGenerator(upFile, task) || Promise.resolve('')
  //       return this.toObserverble(objectKey).pipe(
  //         tap((key) => {
  //           extraInfo.key = key
  //         }),
  //       )
  //     }

  //     const getUploadUrlFn = (token: string) => {
  //       console.log('QiniuOSSTaskHandler -> processUploaderOptions -> getUploadUrlFn')
  //       return from(this.getUploadUrl(token)).pipe(
  //         tap((host) => {
  //           extraInfo.host = host
  //         }),
  //       )
  //     }

  //     return of(null)
  //       .pipe(
  //         concatMap(getUpToken),
  //         concatMap((token) => getUploadUrlFn(token)),
  //         concatMap(getObjectKey),
  //         concatMap(beforeUpload),
  //       )
  //       .toPromise()
  //   }
  // }

  private getFileExtraInfo (file: UploadFile): FileExtraInfo {
    file.extraInfo = file.extraInfo || {}
    return file.extraInfo as FileExtraInfo
  }

  private async getUploadUrl (token: string): Promise<string> {
    const protocol: Protocol = window.location.protocol as Protocol
    const data = await this.getUpHosts(token, protocol)
    const hosts = data.up.acc.main
    return `${protocol}//${hosts[0]}`
  }

  private getMakeFileUrl (host: string, fileSize: number, key: string): string {
    if (key) {
      return `${host}/mkfile/${fileSize}/key/${urlSafeBase64Encode(key)}`
    } else {
      return `${host}/mkfile/${fileSize}`
    }
  }

  private getUploadBlockUrl (host: string, blockSize: number): string {
    return `${host}/mkblk/${blockSize}`
  }

  private getUpHosts (token: string, protocol: Protocol): Promise<UpHosts> {
    const putPolicy = this.getPutPolicy(token)
    const url = `${protocol}//api.qiniu.com/v2/query?ak=${putPolicy.ak}&bucket=${putPolicy.bucket}`
    const ob$: Observable<UpHosts> = ajax.getJSON(url)
    return ob$.toPromise()
  }

  private getPutPolicy (token: string) {
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
