import { UploadTask } from '../modules/UploadTask'
import TaskHandler from './TaskHandler'
import { ID, StringKeyObject, EventType, StatusCode } from '../../types'
import {
  forkJoin,
  from,
  Observable,
  Subscriber,
  of,
  Subject,
  Subscription,
  throwError,
  BehaviorSubject,
  empty,
} from 'rxjs'
import {
  tap,
  map,
  concatMap,
  filter,
  catchError,
  takeUntil,
  repeatWhen,
  mergeMap,
  delayWhen,
  mapTo,
  switchMap,
} from 'rxjs/operators'
import { ajax, AjaxResponse } from 'rxjs/ajax'
import { retryWithDelay } from '../../operators'
import { UploadFile, FileChunk } from '../modules'

export class CommonsTaskHandler extends TaskHandler {
  private readonly progressSubject: Subject<ProgressPayload> = new Subject()
  private readonly actionSubject: BehaviorSubject<{ type: string }> = new BehaviorSubject({ type: 'resume' })
  private readonly resume$ = this.actionSubject.pipe(filter(({ type }) => type === 'resume'))
  private readonly pause$ = this.actionSubject.pipe(filter(({ type }) => type === 'pause'))
  private readonly retry$ = this.actionSubject.pipe(filter(({ type }) => type === 'retry'))

  private upload$: Observable<any> | null = null
  private uploadSubscription: Subscription | null = null

  private aborted: boolean = false

  private testError = false

  pause (): void {
    this.actionSubject.next({ type: 'pause' })
    const { task } = this
    console.log('CommonTaskHandler -> pause -> task', task)
    task.fileList?.forEach((file) => {
      file.chunkList?.forEach((chunk) => {
        chunk.status = chunk.status === StatusCode.Uploading ? StatusCode.Pause : chunk.status
      })
      file.status = file.status === StatusCode.Uploading ? StatusCode.Pause : file.status
    })
    task.status = task.status === StatusCode.Uploading ? StatusCode.Pause : task.status
    this.presistTaskOnly(this.task)
    this.emit(EventType.TaskPaused, this.task)
  }

  resume (): void {
    console.log('CommonsTaskHandler -> resume -> resume------------------------------------------', this.task)
    this.actionSubject.next({ type: 'resume' })
    this.task.status = StatusCode.Uploading
    this.emit(EventType.TaskResume, this.task)
  }

  retry (): void {
    // TODO
    this.testError = false
    if (this.aborted) {
      this.handle()
    } else {
      this.actionSubject.next({ type: 'retry' })
    }
    this.resume()
    this.emit(EventType.TaskRetry, this.task)
  }

  abort (): void {
    this.aborted = true
    this.pause()
    this.uploadSubscription?.unsubscribe()
    this.uploadSubscription = null
    this.upload$ = null
    this.emit(EventType.TaskCanceled, this.task)
  }

  handle () {
    console.log('CommonTaskHandler -> handle -> task', this.task)
    this.aborted = false
    const { task, uploaderOptions } = this
    const fileIDList: ID[] = task.fileIDList || []
    const skipFileWhenError: boolean = !!uploaderOptions.skipFileWhenUploadError
    if (this.uploadSubscription) {
      this.uploadSubscription.unsubscribe()
      this.uploadSubscription = null
      this.upload$ = null
    }

    const job$ = from(fileIDList).pipe(
      tap((id) => {
        console.log('before mergeMap', id)
      }),
      concatMap((fileID) => {
        const takeNotification = new Subject()
        return of(fileID).pipe(
          tap((v) => {
            console.warn('==================', v)
          }),
          delayWhen(() => this.resume$),
          concatMap(() => this.getUploadJob(fileID)),
          catchError((e: Error) => {
            console.log('CommonTaskHandler -> handle -> e', e)
            if (skipFileWhenError) {
              takeNotification.next(e)
              console.warn('跳过出错的文件', e)
            } else {
              this.task.status = StatusCode.Error
            }
            takeNotification.complete()
            console.log('CommonTaskHandler -> handle -> takeNotification', takeNotification)
            return throwError(e)
          }),
          takeUntil(takeNotification),
        )
      }),
      tap((res) => {
        console.log('after mergeMap', res)
      }),
      repeatWhen((notification$) => {
        console.log('repeatWhen------------------', task.status, notification$)
        const subject = notification$ as Subject<any>
        this.retry$.subscribe(subject)
        const ob = notification$.pipe(
          tap(() => {
            const status = this.updateTaskStatus(task)
            console.log('update  CommonTaskHandler -> handle -> task.status', task.status)
            if (status === StatusCode.Success) {
              console.log('CommonTaskHandler -> handle -> task.status11111111111111', task.status)
              subject.complete()
            }
            if (status === StatusCode.Error) {
              subject.error(new Error('unkown error!'))
            }
          }),
          filter((v) => v?.type === 'retry'),
        )
        console.log('CommonTaskHandler -> handle -> ob', ob)
        return ob
      }),
      tap((v) => {
        console.log('CommonTaskHandler -> v', v)
      }),
      concatMap((v) => {
        const beforeFileUploadComplete = uploaderOptions.beforeFileUploadComplete?.(v.file, task) || Promise.resolve(v)
        return this.toObserverble(beforeFileUploadComplete).pipe(mapTo(v))
      }),
    )

    // TODO
    const beforeTaskStart = this.uploaderOptions.beforeTaskStart?.(this.task) || Promise.resolve()
    this.upload$ = from(beforeTaskStart).pipe(concatMap(() => job$))
    this.uploadSubscription = this.upload$.subscribe({
      next: (v) => {
        console.log('CommonTaskHandler -> next ', v)
      },
      error: (error: Error) => {
        console.log('CommonTaskHandler -> error -> error 出错了 出错了', error)
        this.aborted = true
        this.pause()
        this.presistTaskOnly(this.task)
        this.emit(EventType.TaskError, error, this.task)
        // sub.error(error)
      },
      complete: () => {
        console.log('complete 0000000000000')
        // this.presistTaskOnly(this.task)
        this.aborted = true
        if (uploaderOptions.unpresistTaskWhenSuccess) {
          setTimeout(() => {
            this.removeTaskFromStroage(this.task)
          })
        } else {
          setTimeout(() => {
            this.presistTaskOnly(this.task)
            this.removeFileFromStroage(...this.task.fileIDList)
          })
        }
        this.emit(EventType.TaskComplete, this.task)
      },
    })
    this.uploadSubscription.add(this.handleProgress().subscribe())
    task.status = StatusCode.Uploading
    this.uploaderOptions.taskStarted?.(this.task)
    this.emit(EventType.TaskUploadStart, this.task)
  }

  private updateTaskStatus (task: UploadTask): StatusCode {
    console.log('CommonTaskHandler -> updateTaskStatus -> task', task)
    const { fileList, fileIDList } = task
    if (fileList?.some((file) => file.status === StatusCode.Error)) {
      return (task.status = StatusCode.Error)
    }
    if (fileList?.some((file) => file.status === StatusCode.Uploading)) {
      return (task.status = StatusCode.Uploading)
    }
    const allSuccess: boolean = !!fileList?.every((file) => file.status === StatusCode.Success)
    if (allSuccess && fileList?.length === fileIDList.length) {
      return (task.status = StatusCode.Success)
    }
    return task.status as StatusCode
  }

  private triggerFileError (ufile: UploadFile | null, e: Error): Observable<never> {
    if (ufile) {
      ufile.status = StatusCode.Error
      this.emit(EventType.FileError, e, ufile)
      console.log('triggerFileError', ufile.status)
      if (this.uploaderOptions.resumable) {
        this.presistFileOnly(ufile)
      }
    }
    return throwError(e)
  }

  private getUploadJob (fileID: ID): Observable<{ file: UploadFile; responses: ChunkResponse[] }> {
    const { task, uploaderOptions } = this
    const computeFileHashFlag: boolean = !!uploaderOptions.computeFileHash
    const chunkConcurrency: number = uploaderOptions.chunkConcurrency as number
    const chunked: boolean = !!uploaderOptions.chunked
    const chunkSize: number = chunked ? (uploaderOptions.chunkSize as number) : Number.MAX_SAFE_INTEGER

    return of(fileID).pipe(
      tap(() => {
        task.status = StatusCode.Uploading
      }),
      switchMap((fileID) => this.getUploadFileByID(fileID)),
      tap((uploadFile) => {
        console.log('after getUploadFileByID', uploadFile)
        if (uploadFile) {
          task.fileList = task.fileList || []
          if (!task.fileList.some((f) => f.id === uploadFile?.id)) {
            task.fileList.push(uploadFile as UploadFile)
          }
        }
      }),
      filter((uploadFile: UploadFile | null) => {
        const hasFile: boolean = !!uploadFile
        if (!hasFile) {
          console.warn('没有UploadFile', uploadFile)
          return hasFile
        }
        const isSuccess = uploadFile?.status === StatusCode.Success
        isSuccess && console.warn('跳过成功的文件', uploadFile)
        return !isSuccess
      }),
      delayWhen(() => this.resume$),
      concatMap((ufile: UploadFile | null) => {
        const { beforeFileUploadStart } = this.uploaderOptions
        const beforeUpload = beforeFileUploadStart?.(ufile as UploadFile, task) || Promise.resolve()
        return from(beforeUpload).pipe(
          mapTo(ufile),
          catchError((e) => this.triggerFileError(ufile, e)),
        )
      }),
      concatMap((ufile: UploadFile | null) => {
        ufile!.status = StatusCode.Uploading
        this.emit(EventType.FileUploadStart, this.task, ufile)
        const hash$ = this.computeHashWhen(ufile?.raw, 'md5', computeFileHashFlag && !ufile?.hash).pipe(
          map((hash: string) => Object.assign(ufile, { hash: hash })),
        )
        const { beforeFileHashCompute, fileHashComputed } = this.uploaderOptions
        const beforeCompute = beforeFileHashCompute?.(ufile as UploadFile, task) || Promise.resolve()
        const afterCompute = fileHashComputed?.(ufile as UploadFile, task) || Promise.resolve()
        return from(beforeCompute).pipe(
          concatMap(() => hash$),
          concatMap((v) => from(afterCompute).pipe(mapTo(v))),
          catchError((e) => this.triggerFileError(ufile, e)),
        )
      }),
      tap((uploadFile) => {
        console.log('after computeHashWhen', uploadFile)
      }),
      delayWhen(() => this.resume$),
      concatMap((ufile: UploadFile) => {
        let { chunkIDList, chunkList } = ufile
        const should = !chunkList || !chunkList.length || chunkList.length !== chunkIDList?.length
        if (should) {
          return this.generateFileChunks(chunkSize, ufile).pipe(
            concatMap((chunkList) => {
              const chunkIDList = chunkList.map((ck) => ck.id)
              Object.assign(ufile, { chunkList, chunkIDList })
              return forkJoin(from(this.presistChunkOnly(...chunkList)), from(this.presistFileOnly(ufile)))
            }),
            mapTo(ufile),
          )
        }
        return of(ufile)
      }),
      tap((uploadFile) => {
        console.log('after generateFileChunks', uploadFile)
      }),
      delayWhen(() => this.resume$),
      concatMap((ufile: UploadFile) => {
        return this.uploadChunks(ufile, chunkConcurrency).pipe(
          tap((responses: ChunkResponse[]) => {
            ufile.status = StatusCode.Success
            if (responses && responses.length) {
              let index = responses[responses.length - 1].chunkIndex
              let chunk = ufile.chunkList?.[index]
              ufile.response = chunk?.response
            }
            this.emit(EventType.FileComplete, ufile)
            this.presistFileOnly(ufile)
          }),
          map((responses: ChunkResponse[]) => {
            return { file: ufile, responses }
          }),
          catchError((e) => this.triggerFileError(ufile, e)),
        )
      }),
      tap((uploadFile) => {
        console.log('after uploadChunks', uploadFile)
      }),
    ) as Observable<{ file: UploadFile; responses: ChunkResponse[] }>
  }

  private uploadChunks (uploadFile: UploadFile, concurrency: number): Observable<ChunkResponse[]> {
    const chunkList: FileChunk[] = uploadFile.chunkList || []
    const fileHash: string = uploadFile.hash ?? ''
    const fileID: ID = uploadFile.id
    const fileName = uploadFile.name
    const fileSize = uploadFile.size
    const relativePath = uploadFile.relativePath
    const baseParams: UploadFormData = {
      fileID,
      fileHash,
      fileName,
      fileSize,
      relativePath,
      chunkIndex: 0,
      currentChunkSize: 0,
      chunkSize: this.uploaderOptions.chunkSize as number,
      chunkCount: chunkList.length,
    }
    const uploadChunkJob = (chunk: FileChunk) => {
      const uploadParams = Object.assign({}, baseParams, { chunkIndex: chunk.index })
      return this.postChunk(uploadParams, uploadFile, chunk).pipe(
        concatMap((ajaxResponse: AjaxResponse) => {
          const { beforeUploadResponseProcess } = this.uploaderOptions
          const beforeProcess =
            beforeUploadResponseProcess?.(ajaxResponse, chunk, uploadFile, this.task) || Promise.resolve()
          return from(beforeProcess).pipe(mapTo(ajaxResponse))
        }),
        tap((ajaxResponse: AjaxResponse) => {
          const { status, response } = ajaxResponse
          chunk.response = { status, response }
          const isSuccess = this.responseIsSuccess(ajaxResponse)
          chunk.status = isSuccess ? StatusCode.Success : StatusCode.Error
          this.presistChunkOnly(chunk)
          if (!isSuccess) {
            throw new Error('上传错误:' + ajaxResponse.responseText)
          }
        }),
        concatMap((ajaxResponse: AjaxResponse) => {
          const { uploadResponseProcessed } = this.uploaderOptions
          const afterProcess =
            uploadResponseProcessed?.(ajaxResponse, chunk, uploadFile, this.task) || Promise.resolve()
          return from(afterProcess).pipe(mapTo(ajaxResponse))
        }),
        map((response: AjaxResponse) => ({ chunkIndex: chunk.index, response })),
        // tap(console.warn),
        catchError((e) => {
          console.log('CommonTaskHandler -> uploadChunkJob -> e', e)
          chunk.status = StatusCode.Error
          return throwError(e)
        }),
      )
    }
    const uploadChunks$ = from(chunkList).pipe(
      delayWhen(() => this.resume$),
      filter((chunk) => {
        const isSuccess = chunk.status === StatusCode.Success
        isSuccess && console.log('跳过已完成的文件分片', chunk)
        return !isSuccess
      }),
      tap((v) => {
        // console.log('uploadChunks$', v)
      }),
      mergeMap((chunk: FileChunk) => {
        return of(chunk).pipe(
          delayWhen(() => this.resume$),
          concatMap(() => {
            chunk.status = StatusCode.Uploading
            return uploadChunkJob(chunk)
          }),
        )
      }, concurrency),
    )
    return forkJoin(uploadChunks$).pipe(
      tap((v) => {
        console.log('uploadChunks$ ,forkJoinforkJoinforkJoinforkJoinforkJoinforkJoin', v)
        const allSuccess: boolean = !!uploadFile.chunkList?.every((ck) => ck.status === StatusCode.Success)
        uploadFile.status = allSuccess ? StatusCode.Success : StatusCode.Error
      }),
    )
  }

  private postChunk (params: UploadFormData, upFile: UploadFile, chunk: FileChunk): Observable<AjaxResponse> {
    const { maxRetryTimes, retryInterval } = this.uploaderOptions
    const requestConfig$: Observable<RequestOpts> = forkJoin(
      this.getServerURL(upFile, chunk),
      this.getRequestHeaders(upFile),
      this.getRequestBody(upFile, params, chunk),
    ).pipe(
      map(([url = 0, headers = 1, params = 2]) => ({ url, headers, params } as RequestOpts)),
      retryWithDelay(maxRetryTimes, retryInterval),
    )

    const waitForResume = new Subject()
    this.resume$.subscribe(waitForResume)

    const job = (res: RequestOpts) => {
      // TODO
      // this.throwErrorWhen(upFile.name.startsWith('.') && this.testError, 'before sendRequest')

      let ajaxResponse: AjaxResponse
      const progressSubscriber = new ProgressSubscriber(this.progressSubject, this.task, upFile, chunk)
      const takeUtilNotifier = this.pause$.pipe(
        tap(() => {
          let status = chunk.status === StatusCode.Uploading ? StatusCode.Pause : chunk.status
          console.log('CommonTaskHandler -> status', status)
          chunk.status = status
          upFile.status = StatusCode.Pause
        }),
      )
      const repeatWhenProject = () => {
        // console.log('ajaxResponse----', ajaxResponse)
        const notification$ = ajaxResponse
          ? empty()
          : waitForResume.pipe(
              tap(() => {
                chunk.status = StatusCode.Uploading
                upFile.status = StatusCode.Uploading
              }),
            )
        // console.log('notification$', notification$)
        return notification$
      }

      const { beforeUploadRequestSend, uploadRequestSent } = this.uploaderOptions
      const beforeSend = beforeUploadRequestSend?.(res, upFile, this.task) || Promise.resolve()
      const afterSend = (v: any) => uploadRequestSent?.(v, upFile, this.task) || Promise.resolve()
      return from(beforeSend).pipe(
        concatMap(() =>
          this.sendRequest(res, progressSubscriber).pipe(
            tap((v: AjaxResponse) => {
              ajaxResponse = v
              waitForResume.complete()
            }),
            takeUntil(takeUtilNotifier),
            repeatWhen(repeatWhenProject),
          ),
        ),
        concatMap((v) => from(afterSend(v)).pipe(mapTo(v))),
      )
    }

    return requestConfig$.pipe(
      delayWhen(() => this.resume$),
      concatMap(job),
    )
  }

  private sendRequest (res: RequestOpts, progressSubscriber?: ProgressSubscriber): Observable<AjaxResponse> {
    const { retryInterval, maxRetryTimes, requestTimeout, withCredentials, requestBodyProcessFn } = this.uploaderOptions
    const { url, headers, params } = res
    const processRequestBody$ = this.toObserverble(requestBodyProcessFn?.(params) || this.toFormData(params))
    return processRequestBody$.pipe(
      concatMap((body) =>
        ajax({
          url,
          method: 'post',
          headers,
          body,
          progressSubscriber,
          withCredentials,
          timeout: requestTimeout,
        }).pipe(retryWithDelay(maxRetryTimes, retryInterval)),
      ),
    )
  }

  private generateFileChunks (chunkSize: number, file: UploadFile): Observable<FileChunk[]> {
    return Observable.create((ob: Subscriber<FileChunk[]>) => {
      const chunkList: FileChunk[] = []
      let start = 0
      let end = 0
      try {
        let chunkCount = Math.max(1, Math.ceil(file.size / chunkSize))
        for (let index = 0; index < chunkCount; index++) {
          start = end
          end = index + 1 === chunkCount ? file.size : end + chunkSize
          chunkList.push(new FileChunk(file.id + '-' + index, index, start, end, end - start, StatusCode.Pause))
        }
        ob.next(chunkList)
        ob.complete()
      } catch (error) {
        ob.error(error)
      }
    })
  }

  private prepareRequestParamsForChunk (
    uploadfile: UploadFile,
    baseParams: UploadFormData,
    chunk: FileChunk,
  ): Observable<UploadFormData> {
    return this.getRequestParams(uploadfile).pipe(
      map((userParams: StringKeyObject | undefined) => {
        const params: UploadFormData = Object.assign(baseParams, userParams || {}, {
          currentChunkSize: chunk.data?.size || chunk.size,
          chunkHash: chunk.hash,
          [this.uploaderOptions.fileParameterName || 'file']: chunk.data,
          chunkNumber: baseParams.chunkIndex + 1,
        })
        return params
      }),
    )
  }

  private getRequestBody (
    uploadfile: UploadFile,
    uploadParams: UploadFormData,
    chunk: FileChunk,
  ): Observable<UploadFormData> {
    return Observable.create((ob: Subscriber<UploadFormData>) => {
      // TODO
      // this.throwErrorWhen(chunk.index > 0, 'getRequestBody')

      const { beforeFileRead, fileReaded } = this.uploaderOptions
      const beforeRead = beforeFileRead?.(chunk, uploadfile, this.task) || Promise.resolve()
      const afterRead = fileReaded?.(chunk, uploadfile, this.task) || Promise.resolve()
      const computeChunkHash: boolean = !!this.uploaderOptions.computeChunkHash

      const sub = from(beforeRead)
        .pipe(
          concatMap(() => this.readFile(uploadfile, chunk)),
          concatMap((v) => from(afterRead).pipe(mapTo(v))),
          concatMap((data: Blob) => {
            return this.computeHashWhen(data, 'md5', computeChunkHash && !chunk.hash).pipe(
              map((hash: string) => Object.assign(chunk, { hash, data })),
            )
          }),
          concatMap((chunk: FileChunk) => {
            return this.prepareRequestParamsForChunk(uploadfile, uploadParams, chunk)
          }),
        )
        .subscribe(ob)
      return () => sub.unsubscribe()
    })
  }

  private handleProgress (): Observable<ProgressPayload> {
    const reduceFn = (res: number = 0, cur: number = 0) => res + cur
    return this.progressSubject.pipe(
      tap(({ chunk, file, event }) => {
        let chunkSize = chunk.data?.size || chunk.size || event.total
        const loaded = Math.min(chunkSize, event.loaded || 0)
        const chunkList: FileChunk[] = file.chunkList || []
        chunkList![chunk.index]!.uploaded = loaded
        chunk.uploaded = loaded
        chunk.progress = Math.max(Math.round((loaded / chunkSize) * 100), chunk.progress || 0)
        chunk.status = StatusCode.Uploading

        let fileUploaded: number = chunkList.map(({ uploaded }) => uploaded || 0).reduce(reduceFn)
        let fileProgress: number = Math.round((fileUploaded / file.size) * 100)
        fileProgress = Math.max(Math.min(fileProgress, 100), file.progress || 0)
        file.uploaded = fileUploaded
        file.progress = fileProgress
        file.status = StatusCode.Uploading

        let taskLastProgress = this.task.progress
        if (this.task.fileIDList?.length === 1) {
          this.task.progress = Math.max(file.progress, this.task.progress || 0)
        } else {
          let progressTotal = this.task.fileList?.map(({ progress }) => progress).reduce(reduceFn) || 0
          let taskProgress = Math.round(progressTotal / this.task.fileIDList!.length)
          this.task.progress = Math.max(taskProgress, this.task.progress || 0)
        }
        this.task.status = StatusCode.Uploading

        if (this.task.progress > taskLastProgress) {
          console.log('presistTaskOnly....')
          this.presistTaskOnly(this.task)
        }
        this.emit(EventType.TaskProgress, this.task.progress, this.task, file)
        // console.log(
        //   'CommonTaskHandler -> computeProgress -> progress',
        //   chunk.progress,
        //   file.progress,
        //   this.task.progress,
        // )
      }),
    )
  }

  private responseIsSuccess (response: AjaxResponse) {
    return response.status === 200
  }

  private checkIsAborted () {
    if (this.aborted) {
      throw new Error('TaskHandler is aborted')
    }
  }
}

type RequestOpts = {
  url: string
  headers: StringKeyObject
  params: UploadFormData
}

interface ChunkResponse {
  chunkIndex: number
  response?: AjaxResponse
}

interface ProgressPayload {
  task: UploadTask
  file: UploadFile
  chunk: FileChunk
  event: ProgressEvent
}
export interface UploadFormData {
  chunkIndex: number
  chunkSize: number
  currentChunkSize: number
  fileID: ID
  fileName: string
  fileSize: number
  relativePath: string
  chunkCount: number
  fileHash?: string
  chunkHash?: string
  [key: string]: any
}
class ProgressSubscriber extends Subscriber<ProgressEvent> {
  constructor (
    private subject: Subject<ProgressPayload>,
    private task: UploadTask,
    private file: UploadFile,
    private chunk: FileChunk,
  ) {
    super()
  }
  next (data: ProgressEvent) {
    this.subject.next({
      task: this.task,
      file: this.file,
      chunk: this.chunk,
      event: data,
    })
  }
  error (e: Error) {
    console.warn('progress error', e)
  }
}
