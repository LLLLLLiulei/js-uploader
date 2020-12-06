import { UploadTask } from '../modules/UploadTask'
import TaskHandler from './TaskHandler'
import { ID, StringKeyObject, EventType, StatusCode } from '../../types'
import { forkJoin, from, Observable, Subscriber, of, Subject, Subscription, throwError, BehaviorSubject } from 'rxjs'
import { tap, map, concatMap, filter, catchError, mergeMap, mapTo, switchMap, combineAll, reduce } from 'rxjs/operators'
import { ajax, AjaxResponse } from 'rxjs/ajax'
import { retryWithDelay } from '../../operators'
import { UploadFile, FileChunk } from '../modules'
import { assert } from '../../utils'

export class CommonsTaskHandler extends TaskHandler {
  private readonly progressSubject: Subject<ProgressPayload> = new Subject()
  private readonly actionSubject: BehaviorSubject<{ type: string }> = new BehaviorSubject({ type: 'resume' })
  private readonly resume$ = this.actionSubject.pipe(filter(({ type }) => type === 'resume'))
  private readonly pause$ = this.actionSubject.pipe(filter(({ type }) => type === 'pause'))
  private readonly retry$ = this.actionSubject.pipe(filter(({ type }) => type === 'retry'))

  private upload$: Observable<any> | null = null
  private uploadSubscription: Subscription | null = null

  pause (): void {
    this.uploadSubscription = this.uploadSubscription?.unsubscribe() || null
    const { task } = this
    console.log('CommonTaskHandler -> pause -> task', task)
    task.fileList?.forEach((file) => {
      // file.chunkList?.forEach((chunk) => {
      //   this.changeFileChunkStatus(
      //     chunk,
      //     chunk.status === StatusCode.Uploading ? StatusCode.Pause : chunk.status || StatusCode.Pause,
      //   )
      // })
      let status = file.status === StatusCode.Uploading ? StatusCode.Pause : file.status || StatusCode.Pause
      this.changeUploadFileStatus(file, status)
    })
    task.status = task.status === StatusCode.Uploading ? StatusCode.Pause : task.status
    this.presistTaskOnly(this.task)

    this.emit(EventType.TaskPaused, this.task)
  }

  resume (): void {
    this.handle()
    this.emit(EventType.TaskResume, this.task)
  }

  retry (): void {
    this.handle()
    this.emit(EventType.TaskRetry, this.task)
  }

  abort (): void {
    this.upload$ = this.uploadSubscription = this.uploadSubscription?.unsubscribe() || null
    this.emit(EventType.TaskCanceled, this.task)
  }

  handle () {
    console.log('CommonTaskHandler -> handle -> task', this.task)

    if (!this.upload$) {
      const job = (task: UploadTask) =>
        from(task.fileIDList).pipe(
          concatMap((fileID) => {
            // 根据ID获取文件
            return this.getUploadFileByID(fileID).pipe(
              map((uploadFile: UploadFile | null) => {
                console.log('🚀 ~ 根据ID获取到文件', uploadFile)
                assert(!!uploadFile, 'file not found! ID：' + fileID)

                let file = uploadFile as UploadFile
                this.putToTaskFileList(file)
                return file
              }),
            )
          }),
          filter((uploadFile: UploadFile) => {
            // 过滤完成的文件
            const isComplete = uploadFile.status === StatusCode.Complete
            if (isComplete) {
              console.warn('跳过成功的文件', uploadFile.name, uploadFile)
            }
            return !isComplete
          }),
          filter((uploadFile: UploadFile) => {
            // 根据配置 跳过出错的文件
            const skip: boolean =
              uploadFile.status === StatusCode.Error && !!this.uploaderOptions.skipFileWhenUploadError
            if (skip) {
              console.warn('跳过错误的文件', uploadFile)
            }
            return !skip
          }),
          concatMap((uploadFile: UploadFile) => this.uploadFile(uploadFile)),
        )

      this.upload$ = of(this.task).pipe(
        tap((task: UploadTask) => {
          console.log('🚀 ~ 开始上传', task)
          this.changeUplotaTaskStatus(task, StatusCode.Uploading)
          this.emit(EventType.TaskUploadStart, task)
        }),
        switchMap((task: UploadTask) => job(task)),
      )
    }

    this.uploadSubscription = this.uploadSubscription?.unsubscribe() || null
    this.uploadSubscription = this.upload$
      .subscribe({
        next: (...args) => {
          console.log('🚀 ~  上传任务 next ', ...args)
        },
        error: (err: Error) => {
          console.log('🚀 ~ 上传任务出错', err)
          this.changeUplotaTaskStatus(this.task, StatusCode.Error)
          this.emit(EventType.TaskError, err)
        },
        complete: () => {
          console.log('🚀 ~ 上传任务完成', this.task)
          this.changeUplotaTaskStatus(this.task, StatusCode.Complete)
          this.emit(EventType.TaskComplete)
        },
      })
      .add(this.handleProgress().subscribe())
  }

  private uploadFile (uploadFile: UploadFile): Observable<{ uploadFile: UploadFile; chunkResponses: ChunkResponse[] }> {
    const { task, uploaderOptions } = this
    return of(uploadFile).pipe(
      switchMap((uploadFile: UploadFile) => {
        // 计算hash
        this.changeUploadFileStatus(uploadFile, StatusCode.Uploading)
        this.emit(EventType.FileUploadStart, this.task, uploadFile)

        const should = !!uploaderOptions.computeFileHash && !uploadFile.hash
        if (!should) {
          return of(uploadFile)
        }

        //  hash计算前后hook
        const { beforeFileHashCompute, fileHashComputed } = this.uploaderOptions
        const beforeCompute = beforeFileHashCompute?.(uploadFile, task) || Promise.resolve()
        const afterCompute = fileHashComputed?.(uploadFile, task) || Promise.resolve()
        return from(beforeCompute).pipe(
          concatMap(() => {
            return this.computeFileHash(uploadFile.raw).pipe(map((hash) => Object.assign(uploadFile, { hash })))
          }),
          concatMap((uploadFile) => from(afterCompute).pipe(mapTo(uploadFile))),
        )
      }),
      concatMap((uploadFile: UploadFile) => {
        // 计算分片
        const { chunkIDList, chunkList } = uploadFile
        const should = !chunkList?.length || chunkList.length !== chunkIDList?.length
        if (!should) {
          return of(uploadFile)
        }
        const chunked: boolean = !!uploaderOptions.chunked
        const chunkSize: number = chunked ? uploaderOptions.chunkSize || 1024 ** 2 * 4 : Number.MAX_SAFE_INTEGER
        return this.generateFileChunks(chunkSize, uploadFile).pipe(
          concatMap((chunkList: FileChunk[]) => {
            const chunkIDList: ID[] = chunkList.map((ck) => ck.id)
            Object.assign(uploadFile, { chunkList, chunkIDList })
            return forkJoin([from(this.presistChunkOnly(...chunkList)), from(this.presistFileOnly(uploadFile))])
          }),
          mapTo(uploadFile),
        )
      }),
      concatMap((uploadFile: UploadFile) => {
        // 上传所有分片，控制并发
        const concurrency: number = uploaderOptions.chunkConcurrency || 1
        return this.uploadChunks(uploadFile, concurrency).pipe(
          map((chunkResponses: ChunkResponse[]) => ({ uploadFile, chunkResponses })),
        )
      }),
      catchError((e: Error) => {
        console.log('🚀 ~ file:  文件上传错误', uploadFile, e)
        this.changeUploadFileStatus(uploadFile, StatusCode.Error)
        this.emit(EventType.FileError, uploadFile, e)

        // 错误处理
        if (!uploaderOptions.skipFileWhenUploadError) {
          return throwError(e)
        } else {
          // 忽略错误
          return of({ uploadFile, chunkResponses: [] })
        }
      }),
      tap(({ uploadFile, chunkResponses }) => {
        console.log('🚀 ~ file: 上传完成', uploadFile, chunkResponses)
        this.changeUploadFileStatus(uploadFile, StatusCode.Complete)
        this.emit(EventType.FileComplete, uploadFile, chunkResponses)
      }),
    )
  }

  private uploadChunks (uploadFile: UploadFile, concurrency: number = 1): Observable<ChunkResponse[]> {
    const chunkList: FileChunk[] = uploadFile.chunkList || []
    const baseParams: UploadFormData = {
      fileID: uploadFile.id,
      fileHash: uploadFile.hash || '',
      fileName: uploadFile.name,
      fileSize: uploadFile.size,
      relativePath: uploadFile.relativePath,
      chunkSize: this.uploaderOptions.chunkSize as number,
      chunkCount: chunkList.length,
      chunkIndex: 0,
      currentChunkSize: 0,
    }

    return from(chunkList).pipe(
      filter((chunk) => {
        const isComplete = chunk.status === StatusCode.Complete
        if (isComplete) {
          console.log(uploadFile.name, '跳过已完成的文件分片', chunk)
        }
        return !isComplete
      }),
      tap((chunk: FileChunk) => {
        this.changeFileChunkStatus(chunk, StatusCode.Waiting)
      }),
      mergeMap((chunk: FileChunk) => {
        this.changeFileChunkStatus(chunk, StatusCode.Uploading)

        // 上传分片，控制并发
        const uploadParams = Object.assign({}, baseParams, { chunkIndex: chunk.index })
        return this.postChunk(uploadParams, uploadFile, chunk).pipe(
          map((response: AjaxResponse) => ({ chunk, response } as ChunkResponse)),
        )
      }, concurrency),
      tap((chunkResponse: ChunkResponse) => {
        console.log('🚀 ~ file:  chunkResponse', chunkResponse)
        this.changeFileChunkStatus(chunkResponse.chunk, StatusCode.Complete)
      }),
      reduce((acc: ChunkResponse[], v: ChunkResponse) => (acc.push(v) ? acc : acc), []),
    )
  }

  private postChunk (params: UploadFormData, upFile: UploadFile, chunk: FileChunk): Observable<AjaxResponse> {
    // 获取http请求相关配置
    const requestOptions$: Observable<RequestOpts> = forkJoin([
      this.getServerURL(upFile, chunk),
      this.getRequestHeaders(upFile),
      this.getRequestBody(upFile, params, chunk),
    ]).pipe(map(([url = 0, headers = 1, body = 2]) => ({ url, headers, body } as RequestOpts)))

    return requestOptions$.pipe(
      concatMap((res: RequestOpts) => {
        const progressSubscriber = new ProgressSubscriber(this.progressSubject, this.task, upFile, chunk)
        // 请求发送前后hook
        const { beforeUploadRequestSend, uploadRequestSent } = this.uploaderOptions
        const beforeSend = beforeUploadRequestSend?.(res, upFile, this.task) || Promise.resolve()
        const afterSend = (v: any) => uploadRequestSent?.(v, upFile, this.task) || Promise.resolve()
        return from(beforeSend).pipe(
          concatMap(() => this.sendRequest(res, progressSubscriber)),
          concatMap((response: AjaxResponse) => from(afterSend(response)).pipe(mapTo(response))),
        )
      }),
      map((response: AjaxResponse) => {
        console.log('🚀 ~ file: CommonsTaskHandler.ts ~ line 257 ~ CommonsTaskHandler ~ map ~ response', response)
        //  TODO 请求响应参数校验
        assert(response.status === 200, JSON.stringify(response.response))
        return response
      }),
      retryWithDelay(this.uploaderOptions.maxRetryTimes, this.uploaderOptions.retryInterval), // 根据配置进行重试
      catchError((err: Error) => {
        this.changeFileChunkStatus(chunk, StatusCode.Error)
        return throwError(err)
      }),
    )
  }

  private sendRequest (res: RequestOpts, progressSubscriber?: ProgressSubscriber): Observable<AjaxResponse> {
    const { retryInterval, maxRetryTimes, requestOptions, requestBodyProcessFn } = this.uploaderOptions
    const { url, headers, body } = res
    const processRequestBody$ = this.toObserverble(requestBodyProcessFn?.(body) || this.toFormData(body))
    return processRequestBody$.pipe(
      concatMap((body) =>
        ajax({
          url,
          headers,
          body,
          method: requestOptions.method,
          progressSubscriber,
          withCredentials: !!requestOptions.withCredentials,
          timeout: requestOptions.timeout || 30000,
        }).pipe(retryWithDelay(maxRetryTimes, retryInterval)),
      ),
    )
  }

  private generateFileChunks (chunkSize: number, file: UploadFile): Observable<FileChunk[]> {
    return new Observable((ob: Subscriber<FileChunk[]>) => {
      try {
        let start = 0
        let end = 0
        const chunkList: FileChunk[] = []
        const chunkCount: number = Math.max(1, Math.ceil(file.size / chunkSize))
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

  private getRequestBody (
    uploadFile: UploadFile,
    uploadParams: UploadFormData,
    chunk: FileChunk,
  ): Observable<UploadFormData> {
    return new Observable((ob: Subscriber<UploadFormData>) => {
      const { beforeFileRead, fileReaded } = this.uploaderOptions
      // 文件读取前后hook
      const beforeRead = beforeFileRead?.(chunk, uploadFile, this.task) || Promise.resolve()
      const afterRead = fileReaded?.(chunk, uploadFile, this.task) || Promise.resolve()
      const shouldComputeChunkHash: boolean = !!this.uploaderOptions.computeChunkHash
      const sub = from(beforeRead)
        .pipe(
          concatMap(() => this.readFile(uploadFile, chunk)),
          concatMap((data: Blob) => from(afterRead).pipe(mapTo(data))),
          concatMap((data: Blob) => {
            let hash$ = shouldComputeChunkHash ? this.computeFileHash(data, 'md5') : of(chunk.hash || '')
            return hash$.pipe(map((hash: string) => Object.assign(chunk, { hash, data })))
          }),
          concatMap((chunk: FileChunk) => {
            return this.prepareRequestParamsForChunk(uploadFile, uploadParams, chunk)
          }),
        )
        .subscribe(ob)
      return () => sub.unsubscribe()
    })
  }

  private prepareRequestParamsForChunk (
    uploadFile: UploadFile,
    baseParams: UploadFormData,
    chunk: FileChunk,
  ): Observable<UploadFormData> {
    return this.getRequestParams(uploadFile, baseParams).pipe(
      map((userParams: StringKeyObject | undefined) => {
        const params: UploadFormData = Object.assign(baseParams, userParams || {}, {
          currentChunkSize: chunk.data?.size || chunk.size,
          chunkHash: chunk.hash,
          file: chunk.data,
          chunkNumber: baseParams.chunkIndex + 1,
        })
        return params
      }),
    )
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
        // chunk.status = StatusCode.Uploading

        let fileUploaded: number = chunkList.map(({ uploaded }) => uploaded || 0).reduce(reduceFn)
        let fileProgress: number = Math.round((fileUploaded / file.size) * 100)
        fileProgress = Math.max(Math.min(fileProgress, 100), file.progress || 0)
        file.uploaded = fileUploaded
        file.progress = fileProgress
        // file.status = StatusCode.Uploading

        let taskLastProgress = this.task.progress
        if (this.task.fileIDList?.length === 1) {
          this.task.progress = Math.max(file.progress, this.task.progress || 0)
        } else {
          let progressTotal = this.task.fileList?.map(({ progress }) => progress).reduce(reduceFn) || 0
          let taskProgress = Math.round(progressTotal / this.task.fileIDList!.length)
          this.task.progress = Math.max(taskProgress, this.task.progress || 0)
        }
        // this.task.status = StatusCode.Uploading

        if (this.task.progress > taskLastProgress) {
          console.log('presistTaskOnly....')
          this.presistTaskOnly(this.task)
        }
        this.emit(EventType.TaskProgress, this.task.progress, this.task, file)
        console.log(' progress', chunk.progress, file.progress, this.task.progress)
      }),
    )
  }

  private putToTaskFileList (uploadFile: UploadFile): void {
    if (!!uploadFile) {
      this.task.fileList = this.task.fileList || []
      let index = this.task.fileList.findIndex((f) => f.id === uploadFile.id)
      index !== -1 && this.task.fileList.splice(index, 1, uploadFile)
    }
  }

  private changeUploadFileStatus (uploadFile: UploadFile, status: StatusCode): void {
    uploadFile.status = status
  }

  private changeFileChunkStatus (chunk: FileChunk, status: StatusCode): void {
    chunk.status = status
  }

  private changeUplotaTaskStatus (task: UploadTask, status: StatusCode): void {
    task.status = status
  }
}

type RequestOpts = {
  url: string
  headers: StringKeyObject
  body: UploadFormData
}

interface ChunkResponse {
  chunk: FileChunk
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
