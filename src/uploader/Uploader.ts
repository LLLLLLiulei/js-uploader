import { ID, StatusCode, EventType, UploaderOptions, UploadFile, UploadTask } from '../interface'
import { fileFactory } from './helpers/file-factory'
import { FileStore, Storage, FileDragger, FilePicker } from './modules'
import { handle as handleTask } from './handlers'
import { tap, map, concatMap, mapTo, mergeMap, filter, first, switchMap, takeUntil, last } from 'rxjs/operators'
import {
  from,
  Observable,
  throwError,
  Subscription,
  merge,
  Subject,
  fromEvent,
  race,
  of,
  animationFrameScheduler,
  scheduled,
  asapScheduler,
  Subscriber,
} from 'rxjs'
import TaskHandler from './handlers/TaskHandler'
import Base from './Base'
import { scheduleWork } from '../utils/schedule-work'
import { taskFactory } from './helpers/task-factory'
import { Logger } from '../shared/Logger'

const defaultOptions: UploaderOptions = {
  requestOptions: {
    url: '/',
    timeout: 0,
  },
  autoUpload: false,
  computeFileHash: false,
  computeChunkHash: false,
  maxRetryTimes: 3,
  retryInterval: 5000,
  chunked: true,
  chunkSize: 1024 * 1024 * 4,
  chunkConcurrency: 1,
  taskConcurrency: 1,
  resumable: true,
}

export class Uploader extends Base {
  readonly options: UploaderOptions
  readonly taskQueue: UploadTask[] = []
  readonly filePickers: FilePicker[] = []
  readonly fileDraggers: FileDragger[] = []

  private taskHandlerMap: Map<ID, TaskHandler> = new Map()
  private upload$: Nullable<Observable<UploadTask>> = null
  private subscription: Subscription = new Subscription()
  private uploadSubscription: Nullable<Subscription> = null
  private taskSubject: Subject<UploadTask> = new Subject<UploadTask>()

  private action: Subject<string> = new Subject<string>()
  private pause$ = this.action.pipe(filter((v) => v === 'pause'))
  private clear$ = this.action.pipe(filter((v) => v === 'clear'))

  constructor (options?: UploaderOptions) {
    super()

    const opt: UploaderOptions = this.mergeOptions(options)
    this.validateOptions(opt)
    this.options = opt
    this.initFilePickersAndDraggers()
    this.initEventHandler()
    this.options.resumable && this.restoreTask()
  }

  static create (options?: UploaderOptions): Uploader {
    return new Uploader(options)
  }

  private mergeOptions (options?: UploaderOptions): UploaderOptions {
    let opt = Object.assign({}, defaultOptions, options)
    Object.keys(defaultOptions).forEach((k) => {
      if (typeof defaultOptions[k] === 'object') {
        opt[k] = Object.assign(defaultOptions[k], opt[k])
      }
    })
    return opt
  }

  private validateOptions (options: UploaderOptions) {
    Logger.info('🚀 ~ file: Uploader.ts ~ line 84 ~ Uploader ~ validateOptions ~ options', options)
    // TODO
  }

  upload (task?: UploadTask, action?: 'resume' | 'retry'): void {
    if (!this.uploadSubscription || this.uploadSubscription?.closed) {
      const filteredTaskStatus = [StatusCode.Waiting, StatusCode.Uploading, StatusCode.Complete]
      this.upload$ = this.taskSubject.pipe(
        filter((task: UploadTask) => {
          return !filteredTaskStatus.includes(task.status as StatusCode)
        }),
        tap((task: UploadTask) => {
          Logger.info('🚀 ~ file: 等待上传', task)
          this.changeUploadTaskStatus(task, StatusCode.Waiting)
          this.emit(EventType.TaskWaiting, task)
        }),
        mergeMap((task: UploadTask) => this.executeForResult(task, action), this.options.taskConcurrency || 1),
      )

      this.uploadSubscription?.unsubscribe()
      this.uploadSubscription = this.upload$.subscribe({
        next: (v: UploadTask) => {
          Logger.info('任务结束', v)
          this.checkComplete()
        },
        error: (e: Error) => {
          Logger.info('任务出错', e)
        },
        complete: () => {
          Logger.info('所有任务完成')
        },
      })
      this.subscription.add(this.uploadSubscription)
    }
    this.putNextTask(task)
  }

  private checkComplete (): void {
    if (this.isComplete()) {
      this.emit(EventType.Complete)
    }
  }

  private executeForResult (task: UploadTask, action?: string): Observable<UploadTask> {
    let handler: Nullable<TaskHandler>
    return of(task).pipe(
      filter((task) => task.status === StatusCode.Waiting),
      tap(() => {
        handler = this.rebindTaskHandlerEvent(this.getTaskHandler(task))
        action === 'resume' ? handler.resume() : action === 'retry' ? handler.retry() : handler.handle()
      }),
      switchMap((task) =>
        race(
          fromEvent(handler!, EventType.TaskPause).pipe(
            tap(() => {
              // 暂停
              Logger.info('任务暂停')
            }),
          ),
          fromEvent(handler!, EventType.TaskCancel).pipe(
            tap(() => {
              // 取消
              this.freeHandler(task)
            }),
          ),
          fromEvent(handler!, EventType.TaskComplete).pipe(
            tap(() => {
              // 完成
              this.freeHandler(task)
            }),
          ),
          fromEvent(handler!, EventType.TaskError).pipe(
            switchMap((err) => {
              // 出错 跳过错误的任务？
              if (this.options.skipTaskWhenUploadError) {
                this.freeHandler(task)
                return of(null)
              }
              return throwError(err)
            }),
          ),
        ).pipe(mapTo(task), first()),
      ),
    )
  }

  resume (task?: UploadTask): void {
    this.upload(task, 'resume')
  }

  retry (task?: UploadTask): void {
    this.upload(task, 'retry')
  }

  pause (task?: UploadTask): void {
    this.action.next('pause')
    const fn = (task: UploadTask) => {
      if (task.status !== StatusCode.Complete) {
        const handler = this.taskHandlerMap.get(task.id)
        handler?.pause()
        if (!handler) {
          task.status = StatusCode.Pause
          // 任务暂停事件
          this.emit(EventType.TaskPause, task)
        }
      }
    }
    if (task) {
      fn(task)
    } else {
      let sub: Nullable<Subscription> = scheduled(this.taskQueue, asapScheduler).subscribe({
        next: (task) => fn(task),
        complete: () => {
          sub?.unsubscribe()
          sub = null
        },
      })
    }
  }

  cancel (task?: UploadTask): void {
    if (task) {
      this.action.next('cancel')
      this.removeTask(task)
    } else {
      this.clear()
    }
  }

  clear (): void {
    this.action.next('clear')
    const unsubscribe = () => {
      this.uploadSubscription?.unsubscribe()
      this.uploadSubscription = null
      this.upload$ = null
    }
    unsubscribe()

    let queue = this.taskQueue.slice()
    const fn = (timeRemaining?: () => number) => {
      do {
        this.removeTask(queue.splice(0, 100), true)
      } while (queue.length && timeRemaining && timeRemaining?.())
      queue.length ? scheduleWork(fn) : unsubscribe()
    }
    this.clearStorage()
    scheduleWork(fn)
  }

  isUploading (): boolean {
    if (this.uploadSubscription?.closed) {
      return false
    }
    return this.taskQueue.some((task) => task.status === StatusCode.Uploading || task.status === StatusCode.Waiting)
  }

  hasError (): boolean {
    return this.taskQueue.some((task) => task.status === StatusCode.Error)
  }

  getErrorTasks (): UploadTask[] {
    return this.taskQueue.filter((task) => task.status === StatusCode.Error)
  }

  isComplete (): boolean {
    let status = [StatusCode.Uploading, StatusCode.Waiting, StatusCode.Pause]
    return !this.taskQueue.some((task) => status.includes(task.status))
  }

  destory (): void {
    this.subscription.unsubscribe()
  }

  private removeTask (tasks: UploadTask | UploadTask[], clear?: boolean) {
    if (!Array.isArray(tasks)) {
      tasks = [tasks]
    }
    tasks.forEach((task) => {
      let index = this.taskQueue.findIndex((i) => i.id === task?.id)
      index > -1 && this.taskQueue.splice(index, 1)
      this.taskHandlerMap.get(task.id)?.abort()
      this.taskHandlerMap.delete(task.id)
      !clear && this.removeTaskFromStroage(task)
      // 任务取消事件
      this.emit(EventType.TaskCancel, task)
    })
  }

  private rebindTaskHandlerEvent (handler: TaskHandler, ...e: EventType[]): TaskHandler {
    const events = e?.length ? e : Object.values(EventType)
    events.forEach((e) => {
      handler?.off(e)
      handler?.on(e, (...args) => this.taskHandlerEventCallback(e as EventType, ...args))
    })
    return handler
  }

  private getTaskHandler (task: UploadTask): TaskHandler {
    const handler: TaskHandler = this.taskHandlerMap.get(task.id) || handleTask(task, this.options)
    this.taskHandlerMap.set(task.id, handler)
    return handler
  }

  private freeHandler (task: UploadTask): void {
    let id = task.id
    let handler: Nullable<TaskHandler> = this.taskHandlerMap.get(id) || null
    if (handler) {
      Object.values(EventType).forEach((e) => handler!.off(e))
      this.taskHandlerMap.delete(id)
      handler = null
    }
  }

  private putNextTask (task?: UploadTask | ID): void {
    if (task) {
      if (typeof task === 'object') {
        this.taskSubject.next(task)
      } else {
        let tsk = this.taskQueue.find((tsk: UploadTask) => tsk.id === task)
        tsk && this.taskSubject.next(tsk)
      }
    } else {
      let sub: Nullable<Subscription> = scheduled(this.taskQueue, animationFrameScheduler)
        .pipe(
          filter((tsk: UploadTask) => tsk.status !== StatusCode.Complete),
          takeUntil(this.pause$),
        )
        .subscribe({
          next: (tsk) => this.taskSubject.next(tsk),
          complete: () => {
            sub?.unsubscribe()
            sub = null
          },
        })
    }
  }

  private taskHandlerEventCallback (e: EventType, ...args: any[]) {
    Logger.info('🚀 ~ file: Uploader.ts ~ line 179 ~ Uploader ~ taskHandlerEventCallback ~ e', e, args)
    this.emit(e, ...args)
  }

  private changeUploadTaskStatus (task: UploadTask, status: StatusCode) {
    task.status = status
  }

  private restoreTask (): Promise<UploadTask[]> {
    return new Promise((resolve, reject) => {
      Storage.UploadTask.list()
        .then((list: unknown[]) => {
          Logger.info('Uploader -> restoreTask -> list', list)
          const taskList: UploadTask[] = []
          const fn = (timeRemaining?: () => number) => {
            while (list.length) {
              const arr = list.splice(0, 20) as UploadTask[]
              arr.forEach((task) => {
                if (task.status === StatusCode.Complete) {
                  return this.removeTaskFromStroage(task)
                }
                task.status = StatusCode.Pause
                task.progress = task.progress >= 100 ? 99 : task.progress
                this.taskQueue.push(task)
                taskList.push(task)
                this.options.autoUpload && this.upload(task)
                // 任务恢复事件
                this.emit(EventType.TaskRestore, task)
              })
              if (!timeRemaining || !timeRemaining?.()) {
                break
              }
            }
            list.length ? scheduleWork(fn) : resolve(taskList)
          }
          scheduleWork(fn)
        })
        .catch((e) => reject(e))
    })
  }

  initFilePickersAndDraggers () {
    const { filePicker, fileDragger } = this.options
    const filePickers = Array.isArray(filePicker) ? filePicker : filePicker ? [filePicker] : null
    const fileDraggers = Array.isArray(fileDragger) ? fileDragger : fileDragger ? [fileDragger] : null
    const obs: Observable<File[]>[] = []

    if (filePickers?.length) {
      obs.push(
        ...filePickers.map((opts) => {
          const picker = new FilePicker(opts)
          this.filePickers.push(picker)
          return picker.file$
        }),
      )
    }
    if (fileDraggers?.length) {
      obs.push(
        ...fileDraggers.map((opts) => {
          const dragger = new FileDragger(opts)
          this.fileDraggers.push(dragger)
          return dragger.file$
        }),
      )
    }

    if (obs.length) {
      this.subscription.add(
        merge(...obs)
          .pipe(
            concatMap((files: File[]) => {
              return of(files).pipe(
                concatMap((files: File[]) => {
                  // 选择文件后添加文件前hook
                  const beforeAdd = this.hookWrap(this.options.beforeFilesAdd?.(files))
                  return from(beforeAdd).pipe(mapTo(files))
                }),
                concatMap((files: File[]) => {
                  return from(this.addFilesAsync(...files)).pipe(map((tasks) => ({ files, tasks })))
                }),
                takeUntil(this.clear$),
              )
            }),
          )
          .subscribe(),
      )
    }
  }

  private initEventHandler (): void {
    this.on(EventType.TaskCreated, (task: UploadTask) => {
      this.options.autoUpload && this.upload(task)
    })
  }

  addFiles (...files: Array<File>): Promise<UploadTask[]> {
    return new Promise((resolve, reject) => {
      Logger.info('Uploader -> addFile -> files', files)
      if (!files?.length) {
        return resolve([])
      }
      const filelist: UploadFile[] = []
      const { fileFilter } = this.options
      files.forEach((file) => {
        let ignored = false
        let fileName = file.name
        if (fileFilter instanceof RegExp) {
          ignored = !fileFilter.test(fileName)
        } else if (typeof fileFilter === 'function') {
          ignored = !fileFilter(fileName, file)
        }
        !ignored && filelist.push(fileFactory(file))
      })
      Logger.info('Uploader -> addFile -> filelist', filelist)
      this.generateTask(...filelist)
        .toPromise()
        .then((tasks) => {
          Logger.info(this.taskQueue)
          const resolveTask = (tasks: UploadTask[]) => {
            resolve(tasks)
          }
          this.options.resumable
            ? this.presistTask(tasks).subscribe(() => resolveTask(tasks), reject)
            : resolveTask(tasks)
        })
    })
  }

  addFilesAsync (...files: Array<File>): Promise<UploadTask[]> {
    return new Promise((resolve, reject) => {
      Logger.info('Uploader -> addFile -> files', files)
      if (!files?.length) {
        return resolve([])
      }

      const finish = (tasks: UploadTask[]) => {
        if (this.options.resumable) {
          let sub: Nullable<Subscription> = this.presistTask(tasks, this.clear$)
            .pipe(takeUntil(this.clear$))
            .subscribe({
              error: (e) => reject(e),
              complete: () => {
                // 任务持久化事件
                this.emit(EventType.TasksPresist, tasks)
                sub?.unsubscribe()
                sub = null
                resolve(tasks)
              },
            })
        } else {
          resolve(tasks)
        }
      }

      const { fileFilter } = this.options
      const tasks: Set<UploadTask> = new Set()

      const fn = async (timeRemaining?: () => number) => {
        while (files.length) {
          Logger.info(files.length)
          const filelist: UploadFile[] = []
          files.splice(0, 20).forEach((file) => {
            let ignored = false
            if (fileFilter instanceof RegExp) {
              ignored = !fileFilter.test(file.name)
            } else if (typeof fileFilter === 'function') {
              ignored = !fileFilter(file.name, file)
            }
            if (!ignored) {
              filelist.push(fileFactory(file))
            }
          })
          const currentTasks: UploadTask[] = await this.generateTask(...filelist).toPromise()
          currentTasks.map((i) => tasks.add(i))
          if (!timeRemaining || !timeRemaining?.()) {
            break
          }
        }
        files.length ? scheduleWork(fn) : finish([...tasks])
      }
      scheduleWork(fn)
    })
  }

  private generateTask (...fileList: UploadFile[]): Observable<UploadTask[]> {
    return new Observable((subscriber: Subscriber<UploadTask[]>) => {
      const { ossOptions, singleFileTask } = this.options
      const updateTasks: Set<UploadTask> = new Set()
      const newTasks: UploadTask[] = []
      const notifier: Subject<void> = new Subject()
      const sub: Subscription = from(fileList)
        .pipe(
          tap((file: UploadFile) => {
            let pos = file.relativePath.indexOf('/')
            let newTask: Nullable<UploadTask> = null
            let inFolder = !singleFileTask && pos !== -1
            if (!inFolder) {
              newTask = taskFactory(file, singleFileTask)
            } else {
              let parentPath: string = file.relativePath.substring(0, pos)
              let existsTask: UploadTask | undefined = [...this.taskQueue, ...newTasks].find((tsk) => {
                return tsk.fileIDList.some((id) => FileStore.get(id)?.relativePath.startsWith(parentPath))
              })
              if (existsTask) {
                existsTask.fileIDList.push(file.id)
                existsTask.fileList.push(file)
                existsTask.fileSize += file.size
                updateTasks.add(existsTask)
              } else {
                newTask = taskFactory(file, singleFileTask)
              }
            }
            if (newTask) {
              newTask.oss = ossOptions?.enable ? ossOptions?.type : newTask.oss
              newTask.type = singleFileTask ? 'file' : newTask.type
              newTasks.push(newTask)
            }
          }),
          last(),
          concatMap(() => (fileList.length ? from(this.hookWrap(this.options.filesAdded?.(fileList))) : of(null))),
          concatMap(() => (newTasks.length ? from(this.hookWrap(this.options.beforeTasksAdd?.(newTasks))) : of(null))),
          tap(() => {
            // 任务创建事件
            newTasks.forEach((task) => {
              this.emit(EventType.TaskCreated, task)
              this.taskQueue.push(task)
            })
            // 任务更新事件
            updateTasks.forEach((task) => this.emit(EventType.TaskUpdate, task))
          }),
          takeUntil(notifier),
        )
        .subscribe({
          complete () {
            subscriber.next(newTasks)
            subscriber.complete()
          },
          error: (e) => subscriber.error(e),
        })

      return () => {
        notifier?.next()
        notifier?.unsubscribe()
        sub?.unsubscribe()
      }
    })
  }
}
