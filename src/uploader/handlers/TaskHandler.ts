import { Observable, Subscriber, of, from, forkJoin, Subscription, PartialObserver } from 'rxjs'
import { ID, Obj, StatusCode, UploaderOptions, UploadFile, UploadTask, FileChunk, TPromise } from '../../interface'
import { fileReader } from '../helpers'
import { tap, concatMap, mapTo, map, switchMap } from 'rxjs/operators'
import { FileStore, RxStorage } from '../modules'
import Base from '../Base'
import { md5WorkerPool } from '../../shared'

export abstract class TaskHandler extends Base {
  public task: UploadTask
  protected uploaderOptions: UploaderOptions

  constructor(task: UploadTask, uploaderOptions: UploaderOptions) {
    super()
    this.task = task
    this.uploaderOptions = uploaderOptions
  }

  abstract handle(): this
  abstract pause(): this
  abstract resume(): this
  abstract retry(): this
  abstract abort(): this
  abstract abortFile(...files: UploadFile[]): this
  abstract pauseFile(...files: UploadFile[]): this

  protected computeFileHash(file: Blob | ArrayBuffer): Observable<string> {
    return new Observable((ob: Subscriber<string>) => {
      const sparkMd5 = new SparkMD5.ArrayBuffer()
      let fileReader: Nullable<FileReader>
      const calc = (data: ArrayBuffer) => {
        sparkMd5.append(data)
        let md5 = sparkMd5.end()
        ob.next(md5)
        ob.complete()
      }
      if (file instanceof ArrayBuffer) {
        calc(file)
      } else {
        fileReader = new FileReader()
        fileReader.readAsArrayBuffer(file)
        fileReader.onload = (e: ProgressEvent<FileReader>) => {
          calc(e?.target?.result as ArrayBuffer)
        }
        fileReader.onerror = (e: ProgressEvent<FileReader>) => {
          ob.error(e)
        }
      }
      return () => {
        fileReader?.abort()
        sparkMd5.destroy()
      }
    })
  }

  protected computeFileMd5ByWorker(uploadFile: UploadFile): Observable<string>
  protected computeFileMd5ByWorker(blob: Blob): Observable<string>
  protected computeFileMd5ByWorker(data: UploadFile | Blob): Observable<string> {
    return new Observable((ob: Subscriber<string>) => {
      let result: any
      let sub: Nullable<Subscription>
      if (data instanceof Blob) {
        sub = from((result = md5WorkerPool.execute(data).promise!)).subscribe(ob as PartialObserver<any>)
      } else {
        sub = this.readFile(data)
          .pipe(switchMap((data: Blob) => from((result = md5WorkerPool.execute(data)).promise!)))
          .subscribe(ob as PartialObserver<any>)
      }
      return () => {
        result?.abort?.()
        sub?.unsubscribe()
        sub = null
      }
    })
  }

  protected toFormData(params: Obj): FormData {
    const formData = new FormData()
    Object.keys(params).forEach((k) => formData.append(k, params[k]))
    return formData
  }

  protected getServerURL(uploadfile: UploadFile, chunk: FileChunk): Observable<string> {
    return this.createObserverble(this.uploaderOptions.requestOptions.url, this.task, uploadfile, chunk)
  }

  protected getRequestMethod(uploadfile: UploadFile, chunk: FileChunk) {
    return this.createObserverble(this.uploaderOptions.requestOptions.method, this.task, uploadfile, chunk)
  }

  protected getResponseType(uploadfile: UploadFile, chunk: FileChunk) {
    return this.createObserverble(this.uploaderOptions.requestOptions.responseType, this.task, uploadfile, chunk)
  }

  protected getRequestHeaders(uploadfile: UploadFile, chunk: FileChunk): Observable<Obj | undefined> {
    return this.createObserverble(this.uploaderOptions.requestOptions.headers, this.task, uploadfile, chunk)
  }

  protected getRequestParams(uploadfile: UploadFile, chunk: FileChunk, baseParams: Obj): Observable<Obj | undefined> {
    return this.createObserverble(this.uploaderOptions.requestOptions.body, this.task, uploadfile, chunk, baseParams)
  }

  protected getUploadFileByID(id: ID): Observable<Nullable<UploadFile>> {
    return new Observable((ob: Subscriber<Nullable<UploadFile>>) => {
      let uploadFile = FileStore.get(id)
      let file$: Observable<Nullable<UploadFile>>
      if (uploadFile) {
        file$ = of(uploadFile)
      } else {
        file$ = RxStorage.UploadFile.getItem(id).pipe(
          concatMap((upfile) => {
            if (!upfile) {
              return of(null)
            }
            const source = []
            const { chunkIDList, chunkList } = upfile
            if (chunkIDList && chunkIDList.length && (!chunkList || chunkList.length !== chunkIDList.length)) {
              source.push(
                RxStorage.FileChunk.getItems(chunkIDList).pipe(
                  map((res) => Object.values(res)),
                  tap((chunkList: FileChunk[]) => {
                    upfile.chunkList = chunkList.filter((ck) => {
                      if (ck) {
                        ck.status = ck.status === StatusCode.Complete ? ck.status : StatusCode.Pause
                      }
                      return !!ck
                    }) as FileChunk[]
                  }),
                ),
              )
            }
            if (!upfile.raw) {
              source.push(
                RxStorage.BinaryLike.getItem(upfile.id).pipe(
                  tap((blob: unknown) => {
                    upfile.raw = blob instanceof Blob ? (blob as Blob) : upfile.raw
                  }),
                ),
              )
            }
            upfile.status = upfile.status === StatusCode.Complete ? upfile.status : StatusCode.Pause
            upfile.progress = upfile.status === StatusCode.Complete ? 100 : upfile.progress
            return source.length ? forkJoin(source).pipe(mapTo(upfile)) : of(upfile)
          }),
          tap((upfile) => {
            upfile && FileStore.add(upfile)
          }),
        )
      }
      const sub = file$.subscribe(ob)
      return () => sub.unsubscribe()
    })
  }

  protected readFile(uploadfile: UploadFile, start?: number, end?: number): Observable<Blob> {
    return new Observable((ob: Subscriber<Blob>) => {
      let reader = this.uploaderOptions.readFileFn
      let res: TPromise<Blob>
      if (typeof reader === 'function') {
        res = reader(this.task, uploadfile, start, end)
      } else {
        res = fileReader(uploadfile, start, end)
      }
      const sub = this.toObserverble(res).subscribe(ob)
      return () => sub.unsubscribe()
    })
  }

  protected isResumable(): Boolean {
    return !!this.uploaderOptions.resumable
  }
}
