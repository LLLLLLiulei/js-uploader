import { TaskHandler } from './TaskHandler'
import {
  ID,
  Obj,
  EventType,
  StatusCode,
  ChunkResponse,
  ProgressPayload,
  RequestOpts,
  UploadFormData,
  UploadFile,
  UploadTask,
  FileChunk,
  BaseParams,
} from '../../interface'
import {
  forkJoin,
  from,
  Observable,
  Subscriber,
  of,
  Subject,
  Subscription,
  throwError,
  scheduled,
  animationFrameScheduler,
} from 'rxjs'
import {
  tap,
  map,
  concatMap,
  filter,
  catchError,
  mergeMap,
  mapTo,
  switchMap,
  reduce,
  distinctUntilChanged,
} from 'rxjs/operators'
import { ajax, AjaxResponse } from 'rxjs/ajax'
import { retryWithDelay } from '../../operators'
import { assert } from '../../utils/assert'
import { chunkFactory } from '../helpers'
import { scheduleWork } from '../../utils'
import { Logger } from '../../shared'

export class CommonsTaskHandler extends TaskHandler {
  private readonly progressSubject: Subject<ProgressPayload> = new Subject()

  private upload$: Nullable<Observable<any>> = null
  private subscription: Nullable<Subscription> = null

  pause(): this {
    this.subscription?.unsubscribe()
    this.subscription = null
    const { task } = this
    task.status = task.status === StatusCode.Complete ? task.status : StatusCode.Pause
    this.isResumable() && this.presistTaskOnly(this.task)

    task.fileList?.forEach((file) => {
      let status = file.status === StatusCode.Complete ? file.status : StatusCode.Pause
      this.changeUploadFileStatus(file, status)
      this.isResumable() && this.presistFileOnly(file)
    })
    this.emit(EventType.TaskPause, this.task)
    return this
  }

  resume(): this {
    this.handle().emit(EventType.TaskResume, this.task)
    return this
  }

  retry(): this {
    this.handle().emit(EventType.TaskRetry, this.task)
    return this
  }

  abort(): this {
    this.upload$ = this.subscription = this.subscription?.unsubscribe() as any
    this.emit(EventType.TaskCancel, this.task)
    return this
  }

  handle(): this {
    Logger.info('CommonTaskHandler -> handle -> task', this.task)

    if (!this.upload$) {
      this.upload$ = of(this.task).pipe(
        switchMap((task: UploadTask) => {
          // 任务开始前hook
          const beforeTaskStart = this.hookWrap(this.uploaderOptions.beforeTaskStart?.(task))
          return from(beforeTaskStart).pipe(mapTo(task))
        }),
        tap((task: UploadTask) => {
          Logger.info('🚀 ~ 开始上传', task)
          this.changeUplotaTaskStatus(task, StatusCode.Uploading)
          this.emit(EventType.TaskUploadStart, task)
        }),
        switchMap((task: UploadTask) => this.createUploadJob(task)),
      )
    }

    this.subscription?.unsubscribe()
    this.subscription = this.upload$.subscribe({
      next: () => {
        Logger.info('🚀 ~  上传任务 next ')
      },
      error: (err: Error) => {
        Logger.info('🚀 ~ 上传任务出错', err)
        this.changeUplotaTaskStatus(this.task, StatusCode.Error)
        this.emit(EventType.TaskError, this.task, err)
      },
      complete: () => {
        Logger.info('🚀 ~ 上传任务完成', this.task)
        this.changeUplotaTaskStatus(this.task, StatusCode.Complete)
        this.emit(EventType.TaskComplete, this.task)
        this.removeTaskFromStroage(this.task)
      },
    })
    this.subscription.add(this.handleProgress().subscribe())
    return this
  }

  private createUploadJob(task: UploadTask): Observable<{ uploadFile: UploadFile; chunkResponses: ChunkResponse[] }> {
    return scheduled(task.fileIDList, animationFrameScheduler).pipe(
      concatMap((fileID) => {
        // 根据ID获取文件
        return this.getUploadFileByID(fileID).pipe(
          map((uploadFile: Nullable<UploadFile>) => {
            assert(!!uploadFile, 'file not found! ID：' + fileID)
            return this.putToTaskFileList(uploadFile as UploadFile)
          }),
        )
      }),
      filter((uploadFile: UploadFile) => {
        // 过滤完成的文件
        const isComplete = uploadFile.status === StatusCode.Complete
        if (isComplete) {
          Logger.warn(`skip file,status:${uploadFile.status}`, uploadFile.name)
        }
        return !isComplete
      }),
      filter((uploadFile: UploadFile) => {
        // 根据配置 跳过出错的文件
        const skip: boolean = uploadFile.status === StatusCode.Error && !!this.uploaderOptions.skipFileWhenUploadError
        if (skip) {
          Logger.warn(`skip file,status:${uploadFile.status}`, uploadFile.name)
        }
        return !skip
      }),
      concatMap((uploadFile: UploadFile) => this.uploadFile(uploadFile)),
    )
  }

  private uploadFile(uploadFile: UploadFile): Observable<{ uploadFile: UploadFile; chunkResponses: ChunkResponse[] }> {
    const { task, uploaderOptions } = this
    return of(uploadFile).pipe(
      switchMap((uploadFile: UploadFile) => {
        this.changeUploadFileStatus(uploadFile, StatusCode.Uploading)
        // 判断是否需要计算hash/md5
        const should = !!uploaderOptions.computeFileHash && !uploadFile.hash
        if (!should) {
          Logger.info('should not compute hash for', uploadFile.name)
          return of(uploadFile)
        }

        //  hash计算前后hook
        const { beforeFileHashCompute, fileHashComputed } = this.uploaderOptions
        const beforeCompute = this.hookWrap(beforeFileHashCompute?.(task, uploadFile))
        return from(beforeCompute).pipe(
          concatMap(() => {
            // 使用线程池计算hash
            return this.computeFileMd5ByWorker(uploadFile).pipe(map((hash) => Object.assign(uploadFile, { hash })))
          }),
          concatMap((uploadFile: UploadFile) => {
            // hash计算后
            const computed = this.hookWrap(fileHashComputed?.(task, uploadFile, uploadFile.hash))
            return from(computed).pipe(mapTo(uploadFile))
          }),
        )
      }),
      concatMap((uploadFile: UploadFile) => {
        // 文件上传开始前hook
        const beforeFileUploadStart = this.hookWrap(uploaderOptions.beforeFileUploadStart?.(task, uploadFile))
        return from(beforeFileUploadStart).pipe(mapTo(uploadFile))
      }),
      filter((uploadFile: UploadFile) => uploadFile.status !== StatusCode.Complete), // 再次过滤成功的文件
      concatMap((uploadFile: UploadFile) => {
        // 判断是否需要计算分片
        const { chunkIDList, chunkList } = uploadFile
        const should = !chunkList?.length || chunkList.length !== chunkIDList?.length
        if (!should) {
          return of(uploadFile)
        }
        // 计算分片，仅计算切片索引不切割文件
        const chunked: boolean = !!uploaderOptions.chunked
        const chunkSize: number = chunked ? uploaderOptions.chunkSize || 1024 ** 2 * 4 : Number.MAX_SAFE_INTEGER
        return this.generateFileChunks(chunkSize, uploadFile).pipe(
          concatMap((chunkList: FileChunk[]) => {
            const chunkIDList: ID[] = chunkList.map((ck) => ck.id)
            Object.assign(uploadFile, { chunkList, chunkIDList })
            // 保存分片和文件信息
            if (this.isResumable()) {
              return forkJoin([from(this.presistChunkOnly(...chunkList)), from(this.presistFileOnly(uploadFile))])
            } else {
              return of('')
            }
          }),
          mapTo(uploadFile),
        )
      }),
      concatMap((uploadFile: UploadFile) => {
        // 文件上传事件
        this.emit(EventType.FileUploadStart, this.task, uploadFile)
        const concurrency: number = uploaderOptions.chunkConcurrency || 1
        // 上传所有分片并控制并发
        return this.uploadChunks(uploadFile, concurrency).pipe(
          map((chunkResponses: ChunkResponse[]) => ({ uploadFile, chunkResponses })),
        )
      }),
      catchError((e: Error) => {
        Logger.info('🚀 ~  upload error', uploadFile, e)
        // 文件上传错误事件
        this.changeUploadFileStatus(uploadFile, StatusCode.Error)
        this.emit(EventType.FileError, this.task, uploadFile, e)

        // 错误处理 判断是否需要过滤该文件
        if (!uploaderOptions.skipFileWhenUploadError) {
          return throwError(e)
        } else {
          return of({ uploadFile, chunkResponses: [] })
        }
      }),
      tap(({ uploadFile, chunkResponses }) => {
        Logger.info('🚀 ~  upload complete', uploadFile, chunkResponses)
        // 文件上传完成事件
        uploadFile.response = chunkResponses?.length
          ? chunkResponses[chunkResponses.length - 1]?.response?.response
          : uploadFile.response
        this.changeUploadFileStatus(uploadFile, StatusCode.Complete)
        this.emit(EventType.FileComplete, this.task, uploadFile, chunkResponses)
      }),
    )
  }

  private uploadChunks(uploadFile: UploadFile, concurrency: number): Observable<ChunkResponse[]> {
    const chunkList: FileChunk[] = uploadFile.chunkList || []
    const baseParams: BaseParams = {
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

    return scheduled(chunkList, animationFrameScheduler).pipe(
      filter((chunk) => {
        // 过滤完成的分片
        const isComplete = chunk.status === StatusCode.Complete
        if (isComplete) {
          Logger.info(`skip chunk，status:${chunk.status}`, uploadFile.name, chunk)
        }
        return !isComplete
      }),
      tap((chunk: FileChunk) => {
        this.changeFileChunkStatus(chunk, StatusCode.Waiting)
      }),
      mergeMap((chunk: FileChunk) => {
        this.changeFileChunkStatus(chunk, StatusCode.Uploading)
        this.emit(EventType.ChunkUploadStart, this.task, uploadFile, chunk)
        // 上传单个分片，控制并发
        const uploadParams: UploadFormData = Object.assign({}, baseParams, { chunkIndex: chunk.index })
        return this.postChunk(uploadParams, uploadFile, chunk).pipe(
          map((response: AjaxResponse) => ({ chunk, response } as ChunkResponse)),
        )
      }, concurrency || 1),
      tap(({ chunk, response }) => {
        Logger.info('🚀 ~ chunk upload complete', uploadFile.name, chunk, response)
        this.changeFileChunkStatus(chunk, StatusCode.Complete)
        chunk.response = response?.response
        this.emit(EventType.ChunkComplete, this.task, uploadFile, chunk, response)
      }),
      concatMap((res: ChunkResponse) => {
        if (this.isResumable()) {
          return from(this.presistChunkOnly(res.chunk)).pipe(mapTo(res))
        } else {
          return of(res)
        }
      }),
      reduce((acc: ChunkResponse[], v: ChunkResponse) => (acc.push(v) ? acc : acc), []), // 收集response
    )
  }

  private postChunk(params: UploadFormData, upFile: UploadFile, chunk: FileChunk): Observable<AjaxResponse> {
    // 获取http请求相关配置
    const requestOptions$: Observable<RequestOpts> = forkJoin([
      this.getServerURL(upFile, chunk),
      this.getRequestHeaders(upFile, chunk),
      this.getRequestBody(upFile, params, chunk),
    ]).pipe(map(([url = 0, headers = 1, body = 2]) => ({ url, headers, body } as RequestOpts)))

    return requestOptions$.pipe(
      concatMap((res: RequestOpts) => {
        const progressSubscriber = new ProgressSubscriber(this.progressSubject, this.task, upFile, chunk) // 进度订阅
        // 上传请求发送前hook
        const { beforeUploadRequestSend } = this.uploaderOptions
        const beforeSend = this.hookWrap(beforeUploadRequestSend?.(this.task, upFile, chunk, res))
        return from(beforeSend).pipe(concatMap(() => this.sendRequest(upFile, chunk, res, progressSubscriber)))
      }),
      concatMap((response: AjaxResponse) => {
        // 上传响应数据处理前hook
        const { beforeUploadResponseProcess } = this.uploaderOptions
        const beforeProcess = this.hookWrap(beforeUploadResponseProcess?.(this.task, upFile, chunk, response))
        return from(beforeProcess).pipe(mapTo(response))
      }),
      tap((response: AjaxResponse) => {
        Logger.info('🚀 ~ AjaxResponse', upFile.name, chunk, response)
        // 请求响应参数校验,200状态码认为是成功
        assert(response.status === 200, JSON.stringify(response.response))
      }),
      retryWithDelay(this.uploaderOptions.maxRetryTimes, this.uploaderOptions.retryInterval), // 根据配置进行重试
      catchError((err: Error) => {
        this.changeFileChunkStatus(chunk, StatusCode.Error)
        this.emit(EventType.ChunkError, this.task, upFile, chunk, err)
        return throwError(err)
      }),
    )
  }

  private sendRequest(
    upfile: UploadFile,
    chunk: FileChunk,
    requestOpts: RequestOpts,
    progressSubscriber?: ProgressSubscriber,
  ): Observable<AjaxResponse> {
    const { requestOptions, requestBodyProcessFn } = this.uploaderOptions
    const { url, headers, body } = requestOpts
    const processRequestBody$ = this.toObserverble(
      requestBodyProcessFn?.(this.task, upfile, chunk, body) || this.toFormData(body),
    )
    return processRequestBody$.pipe(
      concatMap((body) =>
        ajax({
          url,
          headers,
          body,
          method: 'POST',
          progressSubscriber,
          withCredentials: !!requestOptions.withCredentials,
          timeout: requestOptions.timeout || 0,
        }),
      ),
    )
  }

  private generateFileChunks(chunkSize: number, file: UploadFile): Observable<FileChunk[]> {
    return new Observable((ob: Subscriber<FileChunk[]>) => {
      try {
        let start = 0
        let end = 0
        const chunkList: FileChunk[] = []
        const chunkCount: number = Math.max(1, Math.ceil(file.size / chunkSize))
        for (let index = 0; index < chunkCount; index++) {
          start = end
          end = index + 1 === chunkCount ? file.size : end + chunkSize
          chunkList.push(chunkFactory(file.id + '-' + index, index, start, end, end - start))
        }
        ob.next(chunkList)
        ob.complete()
      } catch (error) {
        ob.error(error)
      }
    })
  }

  private getRequestBody(
    uploadFile: UploadFile,
    uploadParams: UploadFormData,
    chunk: FileChunk,
  ): Observable<UploadFormData> {
    return new Observable((ob: Subscriber<UploadFormData>) => {
      const { beforeFileRead, fileReaded } = this.uploaderOptions
      // 文件读取前后hook
      const beforeRead = this.hookWrap(beforeFileRead?.(this.task, uploadFile, chunk))
      const shouldComputeChunkHash: boolean = !!this.uploaderOptions.computeChunkHash
      const sub = from(beforeRead)
        .pipe(
          concatMap(() => this.readFile(uploadFile, chunk.start, chunk.end)),
          concatMap((data: Blob) => {
            // 文件读取后
            const readed = this.hookWrap(fileReaded?.(this.task, uploadFile, chunk, data))
            return from(readed).pipe(mapTo(data))
          }),
          concatMap((data: Blob) => {
            const hash$ = shouldComputeChunkHash ? this.computeFileHash(data) : of(chunk.hash || '')
            return hash$.pipe(map((hash: string) => Object.assign(chunk, { hash, data })))
          }),
          concatMap((chunk: FileChunk) => {
            Object.assign(uploadParams, {
              currentChunkSize: chunk.data?.size || chunk.size,
              chunkHash: chunk.hash,
              file: chunk.data,
            })
            return this.prepareRequestParamsForChunk(uploadFile, chunk, uploadParams)
          }),
        )
        .subscribe(ob)
      return () => sub.unsubscribe()
    })
  }

  private prepareRequestParamsForChunk(
    uploadFile: UploadFile,
    chunk: FileChunk,
    uploadParams: UploadFormData,
  ): Observable<UploadFormData> {
    return this.getRequestParams(uploadFile, chunk, uploadParams).pipe(
      map((userParams: Obj | undefined) => Object.assign(uploadParams, userParams || {})),
    )
  }

  private handleProgress(): Observable<any> {
    const reduceFn = (res: number = 0, cur: { uploaded: number }) => (res += cur.uploaded || 0)
    return this.progressSubject.pipe(
      map(({ chunk, file, event }) => {
        const chunkSize = chunk.data?.size || chunk.size || event.total
        const chunkLoaded = Math.min(chunkSize, event.loaded || 0)

        const chunkList: FileChunk[] = file.chunkList || []
        chunkList[chunk.index].uploaded = chunk.uploaded = chunkLoaded
        chunk.progress = Math.max(Math.round((chunkLoaded / chunkSize) * 100), chunk.progress || 0)

        let fileUploaded: number = chunkList.reduce(reduceFn, 0)
        let fileProgress: number = Math.round((fileUploaded / file.size) * 100)
        fileProgress = Math.max(Math.min(fileProgress, 100), file.progress || 0)
        file.uploaded = fileUploaded
        file.progress = fileProgress

        let taskLastProgress = this.task.progress

        let taskProgress = this.task.progress
        if (this.task.fileIDList?.length === 1) {
          taskProgress = Math.max(file.progress, this.task.progress || 0)
        } else {
          let taskUploaded = this.task.fileList.reduce(reduceFn, 0) || 0
          taskProgress = Math.round((taskUploaded / this.task.fileSize) * 100)
          taskProgress = Math.max(taskProgress, this.task.progress || 0)
        }
        this.task.progress = taskProgress

        if (this.isResumable() && this.task.progress > taskLastProgress) {
          scheduleWork(() => this.presistTaskOnly(this.task))
        }
        // this.emit(EventType.TaskProgress, this.task, file, this.task.progress)

        return this.task.progress
        // Logger.info(
        //   `progress - ${this.task.name} - ${file.name} - ${chunk.index}`,
        //   chunk.progress,
        //   file.progress,
        //   this.task.progress,
        // )
      }),
      distinctUntilChanged(),
      tap((taskProgress: number) => {
        this.emit(EventType.TaskProgress, this.task, taskProgress)
      }),
    )
  }

  private putToTaskFileList(uploadFile: UploadFile): UploadFile {
    if (uploadFile) {
      this.task.fileList = this.task.fileList || []
      const index: number = this.task.fileList.findIndex((f) => f.id === uploadFile.id)
      index !== -1 ? this.task.fileList.splice(index, 1, uploadFile) : this.task.fileList.push(uploadFile)
    }
    return uploadFile
  }

  private changeUploadFileStatus(uploadFile: UploadFile, status: StatusCode): void {
    uploadFile.status = status
  }

  private changeFileChunkStatus(chunk: FileChunk, status: StatusCode): void {
    chunk.status = status
  }

  private changeUplotaTaskStatus(task: UploadTask, status: StatusCode): void {
    task.status = status
  }
}

class ProgressSubscriber extends Subscriber<ProgressEvent> {
  constructor(
    private subject: Subject<ProgressPayload>,
    private task: UploadTask,
    private file: UploadFile,
    private chunk: FileChunk,
  ) {
    super()
  }
  next(data: ProgressEvent) {
    this.subject.next({
      task: this.task,
      file: this.file,
      chunk: this.chunk,
      event: data,
    })
  }
  error(e: Error) {
    Logger.error('progress error', e)
  }
}
