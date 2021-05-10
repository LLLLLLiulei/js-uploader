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
  asyncScheduler,
  BehaviorSubject,
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
  takeUntil,
  bufferCount,
  takeWhile,
} from 'rxjs/operators'
import { ajax, AjaxResponse } from 'rxjs/ajax'
import { retryWithDelay } from '../../operators'
import { assert } from '../../utils/assert'
import { chunkFactory } from '../helpers'
import { scheduleWork } from '../../utils'
import { Logger } from '../../shared'

enum SubjectAction {
  AbortFile = 'abort-file',
  PauseFile = 'pause-file',
}
type SubjectItem = {
  action?: SubjectAction
  data?: unknown
}
export class CommonsTaskHandler extends TaskHandler {
  private readonly progressSubject: Subject<ProgressPayload> = new Subject()

  private upload$: Nullable<Observable<any>> = null
  private subscription: Nullable<Subscription> = null

  private subject: BehaviorSubject<SubjectItem> = new BehaviorSubject({})
  private uploadFileIDSubject: Subject<ID> = new Subject()

  private fileSubscriptionMap: Map<ID, Subscription> = new Map()

  private fileSubscriptionInfoMap: Map<ID, Subscriber<unknown>> = new Map()

  pause(): this {
    this.subscription?.unsubscribe()
    this.subscription = null
    const { task } = this
    task.status = task.status === StatusCode.Complete ? task.status : StatusCode.Pause
    this.isResumable() && this.presistTaskOnly(this.task)

    scheduled(task.fileList || [], asyncScheduler)
      .pipe(
        tap((file) => {
          let status =
            file.status === StatusCode.Complete || file.status === StatusCode.Error ? file.status : StatusCode.Pause
          this.changeUploadFileStatus(file, status)
          this.emit(EventType.FilePause, task, file)
          this.isResumable() && this.presistFileOnly(file)
        }),
      )
      .subscribe()
    this.emit(EventType.TaskPause, this.task)
    return this
  }

  resume(): this {
    this.handle().emit(EventType.TaskResume, this.task)
    return this
  }

  retry(): this {
    let errorFiles = this.task.fileList?.filter((i) => i.status === StatusCode.Error) || []

    scheduled(errorFiles, asyncScheduler).subscribe({
      next: (file) => {
        this.changeUploadFileStatus(file, StatusCode.Pause)
        this.emit(EventType.FilePause, this.task, file)
      },
      complete: () => {
        this.handle().emit(EventType.TaskRetry, this.task)
      },
    })

    return this
  }

  abort(): this {
    this.upload$ = this.subscription = this.subscription?.unsubscribe() as any
    this.emit(EventType.TaskCancel, this.task)
    return this
  }

  pauseFile(...files: UploadFile[]): this {
    const rawFiles: UploadFile[] = []
    scheduled(files, asyncScheduler)
      .pipe(
        bufferCount(100),
        concatMap((files: UploadFile[]) => {
          return from(files).pipe(
            tap((file) => {
              this.fileSubscriptionMap.get(file.id)?.unsubscribe()
              let rawFile = this.task.fileList.find((i) => i.id === file.id)
              if (rawFile && rawFile.status !== StatusCode.Complete && rawFile.status !== StatusCode.Error) {
                this.changeUploadFileStatus(rawFile, StatusCode.Pause)
                this.emit(EventType.FilePause, this.task, rawFile)
                rawFiles.push(rawFile)
              }
            }),
          )
        }),
      )
      .subscribe({
        complete: () => {
          this.emit(EventType.FilesPause, this.task, rawFiles)
        },
      })
    return this
  }

  abortFile(...files: UploadFile[]): this {
    scheduled(files, asyncScheduler)
      .pipe(
        bufferCount(100),
        concatMap((files: UploadFile[]) => {
          return from(files).pipe(
            tap((file) => {
              let subscriber = this.fileSubscriptionInfoMap.get(file.id)
              subscriber?.complete()
              subscriber?.unsubscribe()

              let idIndex = this.task.fileIDList.indexOf(file.id)
              if (idIndex > -1) {
                this.task.fileIDList.splice(idIndex, 1)
                this.task.fileSize -= file.size
                this.task.uploaded -= file.uploaded
              }
              let fileIndex = this.task.fileList?.findIndex((i) => i.id === file.id)!
              if (fileIndex > -1) {
                this.changeUploadFileStatus(this.task.fileList[fileIndex], StatusCode.Pause)
                this.task.fileList.splice(fileIndex, 1)
              }
              this.emit(EventType.FileCancel, this.task, file)
              this.emit(EventType.TaskUpdate, this.task)
            }),
          )
        }),
      )
      .subscribe({
        complete: () => {
          this.emit(EventType.FilesCancel, this.task, files)
        },
      })

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
        switchMap(() => this.createUploadJob()),
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
        if (this.task.fileList.every((i) => i.status === StatusCode.Complete)) {
          this.changeUplotaTaskStatus(this.task, StatusCode.Complete)
          this.emit(EventType.TaskComplete, this.task)
          //   this.removeTaskFromStroage(this.task)
        } else if (this.task.fileList.some((i) => i.status === StatusCode.Error)) {
          this.changeUplotaTaskStatus(this.task, StatusCode.Error)
          this.emit(EventType.TaskError, this.task)
        } else if (this.task.fileList.some((i) => i.status === StatusCode.Pause)) {
          this.changeUplotaTaskStatus(this.task, StatusCode.Pause)
          this.emit(EventType.TaskPause, this.task)
        }
        this.uploaderOptions.resumable && this.presistTaskOnly(this.task)
        from(this.fileSubscriptionInfoMap.values()).subscribe((subscriber) => subscriber.unsubscribe())
      },
    })

    this.subscription.add(this.handleProgress().subscribe())
    return this
  }

  protected handle1(uploadFiles?: UploadFile[]) {
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
        switchMap(() => {
          return this.uploadFileIDSubject.pipe(
            mergeMap((id) => this.executeForResult(id), 2),
            tap(() => {}),
            takeWhile(() => {
              return !this.task.fileIDList.every((id) => this.fileSubscriptionMap.get(id)?.closed)
            }),
          )
        }),
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
        if (this.task.fileList.every((i) => i.status === StatusCode.Complete)) {
          this.changeUplotaTaskStatus(this.task, StatusCode.Complete)
          this.emit(EventType.TaskComplete, this.task)
          this.removeTaskFromStroage(this.task)
        } else if (this.task.fileList.some((i) => i.status === StatusCode.Pause || i.status === StatusCode.Error)) {
          this.changeUplotaTaskStatus(this.task, StatusCode.Pause)
          this.emit(EventType.TaskPause, this.task)
        }
      },
    })

    this.subscription.add(this.handleProgress().subscribe())
    if (uploadFiles?.length) {
      scheduled(uploadFiles, asyncScheduler).subscribe((file) => this.putNextFile(file))
    } else {
      this.putNextFile()
    }
    return this
  }

  private executeForResult(fileID: ID) {
    return of(fileID).pipe(
      concatMap((id) => {
        return new Promise<void>((resolve, reject) => {
          this.fileSubscriptionMap.get(id)?.unsubscribe()
          let subscription = new Observable((subscriber) => {
            let subscription = this.createFileUploadJob(id).subscribe(subscriber)
            return () => {
              subscription.unsubscribe()
              resolve()
            }
          }).subscribe({
            complete: () => resolve(),
            error: (e: Error) => reject(e),
          })
          this.fileSubscriptionMap.set(id, subscription)
        })
      }),
    )
  }

  private putNextFile(uploadFile?: UploadFile | ID): void {
    if (uploadFile) {
      if (typeof uploadFile === 'object') {
        this.uploadFileIDSubject.next(uploadFile.id)
      } else {
        this.uploadFileIDSubject.next(uploadFile)
      }
    } else {
      scheduled(this.task.fileIDList, asyncScheduler).subscribe((id) => this.uploadFileIDSubject.next(id))
    }
  }

  private createFileUploadJob(fileID: ID): Observable<{ uploadFile: UploadFile; chunkResponses: ChunkResponse[] }> {
    const pocessed = []
    return of(fileID).pipe(
      filter((id: ID) => {
        let { action, data } = this.subject.getValue()
        let accept = !(
          (action === SubjectAction.AbortFile || action === SubjectAction.PauseFile) &&
          (data as ID[])?.includes(id)
        )
        !accept && pocessed.push(id)
        return accept
      }),
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
          pocessed.push(uploadFile.id)
          Logger.warn(`skip file,status:${uploadFile.status}`, uploadFile.name)
        }
        return !isComplete
      }),
      //   filter((uploadFile: UploadFile) => {
      //     // 根据配置 跳过出错的文件
      //     const skip: boolean = uploadFile.status === StatusCode.Error && !!this.uploaderOptions.skipFileWhenUploadError
      //     if (skip) {
      //       pocessed.push(uploadFile.id)
      //       Logger.warn(`skip file,status:${uploadFile.status}`, uploadFile.name)
      //     }
      //     return !skip
      //   }),
      tap((uploadFile: UploadFile) => {
        this.changeUploadFileStatus(uploadFile, StatusCode.Waiting)
        this.emit(EventType.FileWaiting, this.task, uploadFile)
      }),
      concatMap((uploadFile: UploadFile) => {
        let ob$ = this.uploadFile(uploadFile).pipe(
          tap(() => {
            pocessed.push(uploadFile.id)
          }),
        )
        return ob$
      }),
    )
  }

  private createUploadJob(): Observable<{ uploadFile: UploadFile; chunkResponses: ChunkResponse[] }> {
    return scheduled(this.task.fileIDList || [], asyncScheduler).pipe(
      filter((id: ID) => {
        let { action, data } = this.subject.getValue()
        return !(
          (action === SubjectAction.AbortFile || action === SubjectAction.PauseFile) &&
          (data as ID[])?.includes(id)
        )
      }),
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
      //   filter((uploadFile: UploadFile) => {
      //     // 根据配置 跳过出错的文件
      //     const skip: boolean = uploadFile.status === StatusCode.Error && !!this.uploaderOptions.skipFileWhenUploadError
      //     if (skip) {
      //       Logger.warn(`skip file,status:${uploadFile.status}`, uploadFile.name)
      //     }
      //     return !skip
      //   }),
      tap((uploadFile: UploadFile) => {
        this.changeUploadFileStatus(uploadFile, StatusCode.Waiting)
        this.emit(EventType.FileWaiting, this.task, uploadFile)
      }),
      concatMap((uploadFile: UploadFile) => {
        let subscriber = this.fileSubscriptionInfoMap.get(uploadFile.id)
        subscriber?.complete()
        subscriber?.unsubscribe()

        return new Observable((subscriber: Subscriber<{ uploadFile: UploadFile; chunkResponses: ChunkResponse[] }>) => {
          let subscription = this.uploadFile(uploadFile).subscribe(subscriber)
          this.fileSubscriptionInfoMap.set(uploadFile.id, subscriber)
          return () => subscription.unsubscribe()
        })
      }),
    )
  }

  private uploadFile(uploadFile: UploadFile): Observable<{ uploadFile: UploadFile; chunkResponses: ChunkResponse[] }> {
    const { task, uploaderOptions } = this

    return of(uploadFile).pipe(
      concatMap((uploadFile: UploadFile) => {
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
      filter((uploadFile: UploadFile) => {
        return uploadFile.status !== StatusCode.Complete && uploadFile.status !== StatusCode.Pause
      }), // 再次过滤成功的文件
      concatMap((uploadFile: UploadFile) => {
        // 判断是否需要计算分片
        const { chunkIDList, chunkList } = uploadFile
        const should = !chunkList?.length || chunkList.length !== chunkIDList?.length
        if (!should) {
          return of(uploadFile)
        }
        // 计算分片，仅计算切片索引不切割文件
        const maxChunkCount = 10000
        const chunked: boolean = !!uploaderOptions.chunked
        let chunkSize: number = chunked ? uploaderOptions.chunkSize || 1024 ** 2 * 4 : Number.MAX_SAFE_INTEGER
        if (Math.ceil(uploadFile.size / chunkSize) > maxChunkCount) {
          chunkSize = Math.ceil(chunkSize / maxChunkCount)
        }

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
      concatMap((res: { uploadFile: UploadFile; chunkResponses: ChunkResponse[] }) => {
        // 文件上传完成前hook
        const beforeComplete = this.hookWrap(uploaderOptions.beforeFileUploadComplete?.(task, uploadFile))
        return from(beforeComplete).pipe(mapTo(res))
      }),
      catchError((e: Error) => {
        Logger.info('🚀 ~  upload error', uploadFile, e)
        // 文件上传错误事件
        this.changeUploadFileStatus(uploadFile, StatusCode.Error)
        this.emit(EventType.FileError, this.task, uploadFile, e)
        this.presistFileOnly(uploadFile)
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
        uploadFile.response =
          !uploadFile.response && chunkResponses?.length
            ? chunkResponses[chunkResponses.length - 1]?.response?.response
            : uploadFile.response
        if (uploadFile.status !== StatusCode.Error) {
          this.changeUploadFileStatus(uploadFile, StatusCode.Complete)
          this.emit(EventType.FileComplete, this.task, uploadFile, chunkResponses)
        }
        this.presistFileOnly(uploadFile)
      }),
      takeUntil(
        this.subject.pipe(
          filter(
            (i) =>
              (i.action === SubjectAction.AbortFile || i.action === SubjectAction.PauseFile) &&
              (i.data as ID[])?.includes(uploadFile.id),
          ),
          tap(() => this.changeUploadFileStatus(uploadFile, StatusCode.Pause)),
        ),
      ),
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

    return scheduled(chunkList || [], asyncScheduler).pipe(
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
      this.getRequestMethod(upFile, chunk),
      this.getResponseType(upFile, chunk),
    ]).pipe(
      map(
        ([url = 0, headers = 1, body = 2, method = 3, responseType = 4]) =>
          ({ url, headers, body, method, responseType } as RequestOpts),
      ),
    )

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
    const { url, headers, body, method, responseType } = requestOpts
    const processRequestBody$ = this.toObserverble(
      requestBodyProcessFn?.(this.task, upfile, chunk, body) || this.toFormData(body),
    )
    return processRequestBody$.pipe(
      concatMap((body) =>
        ajax({
          url,
          headers,
          body,
          method: method || 'POST',
          responseType,
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

        let fileLastProgress = file.progress
        let fileUploaded: number = chunkList.reduce(reduceFn, 0) || 0
        let fileProgress: number = Math.round((fileUploaded / file.size) * 100)
        fileProgress = Math.max(Math.min(fileProgress, 100), file.progress || 0)
        file.uploaded = fileUploaded
        file.progress = fileProgress
        this.emit(EventType.FileProgress, this.task, file, file.progress)

        if (this.isResumable() && file.progress > fileLastProgress) {
          scheduleWork(() => this.presistFileOnly(file))
        }

        let taskLastProgress = this.task.progress
        let taskProgress = this.task.progress
        let taskUploaded = this.task.fileList.reduce(reduceFn, 0) || 0
        if (this.task.fileIDList?.length === 1) {
          taskProgress = Math.max(file.progress, this.task.progress || 0)
        } else {
          taskProgress = Math.round((taskUploaded / this.task.fileSize) * 100)
          taskProgress = Math.max(taskProgress, this.task.progress || 0)
        }
        this.task.uploaded = Math.min(taskUploaded, this.task.fileSize)
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
