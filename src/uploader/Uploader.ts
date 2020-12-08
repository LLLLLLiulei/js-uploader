import { RequestMethod, StringKeyObject, OSS, ID, StatusCode, EventType } from '../types'
import { UploadTask } from './modules/UploadTask'
import { fileFactory } from './helpers/brower/file-factory'
import {
  UploadFile,
  FileStore,
  Storage,
  FileChunk,
  FilePickerOptions,
  FileDraggerOptions,
  FileDragger,
} from './modules'
import { handle as handleTask } from './handlers'
import { FilePicker } from './modules'
import { tap, map, concatMap, mapTo, mergeMap, filter, first, take, switchMap } from 'rxjs/operators'
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
} from 'rxjs'
import TaskHandler from './handlers/TaskHandler'
import { AjaxResponse } from 'rxjs/ajax'
import Base from './Base'

const defaultOptions: UploaderOptions = {
  requestOptions: {
    url: '/',
    method: 'post',
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
    // TODO
  }

  upload (task?: UploadTask, action?: 'resume' | 'retry'): void {
    setTimeout(() => this.putNextTask(task))

    if (!this.uploadSubscription || this.uploadSubscription?.closed) {
      const filteredTaskStatus = [StatusCode.Waiting, StatusCode.Uploading, StatusCode.Complete]
      this.upload$ = this.taskSubject.pipe(
        filter((task: UploadTask) => {
          return !filteredTaskStatus.includes(task.status as StatusCode)
        }),
        tap((task: UploadTask) => {
          console.log('🚀 ~ file: 等待上传', task)
          this.changeUploadTaskStatus(task, StatusCode.Waiting)
          this.emit(EventType.TaskWaiting, task)
        }),
        mergeMap((task: UploadTask) => {
          const handler: TaskHandler = this.rebindTaskHandlerEvent(this.getTaskHandler(task))
          action === 'resume' ? handler.resume() : action === 'retry' ? handler.retry() : handler.handle()
          return race(
            fromEvent(handler, EventType.TaskPaused).pipe(
              tap(() => {
                // 暂停
                console.log('任务暂停')
              }),
            ),
            fromEvent(handler, EventType.TaskCanceled).pipe(
              tap(() => {
                // 取消
                this.freeHandler(task)
              }),
            ),
            fromEvent(handler, EventType.TaskComplete).pipe(
              tap((v) => {
                // 完成
                console.log('🚀 ~ file: Uploader.ts ~ line 172 ~ Uploader ~ tap ~ v', v)
                this.freeHandler(task)
              }),
            ),
            fromEvent(handler, EventType.TaskError).pipe(
              switchMap((err) => {
                // 出错 跳过错误的任务？
                if (this.options.skipTaskWhenUploadError) {
                  this.freeHandler(task)
                  return of(null)
                }
                return throwError(err)
              }),
            ),
          ).pipe(mapTo(task), first())
        }, this.options.taskConcurrency || 1),
      )

      this.uploadSubscription?.unsubscribe()
      this.uploadSubscription = this.upload$.subscribe({
        next: (v) => {
          console.log('任务结束', v)
        },
        error: (e: Error) => {
          console.log('任务出错', e)
        },
        complete: () => {
          console.log('所有任务完成')
        },
      })
      this.subscription.add(this.uploadSubscription)
    }
  }

  resume (task?: UploadTask): void {
    this.upload(task, 'resume')
  }

  retry (task?: UploadTask): void {
    this.upload(task, 'retry')
  }

  pause (task?: UploadTask): void {
    if (task) {
      this.taskHandlerMap.get(task.id)?.pause()
    } else {
      let next
      let values = this.taskHandlerMap.values()
      while (!(next = values.next()).done) {
        next?.value?.pause()
      }
      next?.value?.pause()
    }
  }

  cancel (task?: UploadTask): void {
    task ? this.removeTask(task) : this.clear()
  }

  clear (): void {
    const unsubscribe = () => {
      this.uploadSubscription?.unsubscribe()
      this.uploadSubscription = null
      this.upload$ = null
    }
    unsubscribe()
    const fn = () => {
      let list = this.taskQueue.splice(0, 20)
      if (list.length) {
        this.removeTask(...list)
        requestAnimationFrame(fn)
      } else {
        unsubscribe()
      }
    }
    fn()
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

  getErrorTask (): UploadTask[] {
    return this.taskQueue.filter((task) => task.status === StatusCode.Error)
  }

  isComplete (): boolean {
    return !this.isUploading()
  }

  destory (): void {
    this.subscription.unsubscribe()
  }

  removeTask (...tasks: UploadTask[]) {
    tasks.forEach((task) => {
      let index = this.taskQueue.findIndex((i) => i.id === task.id)
      index > -1 && this.taskQueue.splice(index, 1)
      this.taskHandlerMap.get(task.id)?.abort()
      this.taskHandlerMap.delete(task.id)
      this.removeTaskFromStroage(task)
      this.emit(EventType.TaskCanceled, task)
    })
  }

  private rebindTaskHandlerEvent (handler: TaskHandler, ...e: EventType[]): TaskHandler {
    const events = e?.length ? e : Object.keys(EventType)
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
      Object.keys(EventType).forEach((e) => handler!.off(e))
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
      let sub: Nullable<Subscription> = scheduled(this.taskQueue, animationFrameScheduler).subscribe({
        next: (tsk) => this.taskSubject.next(tsk),
        complete: () => {
          sub?.unsubscribe()
          sub = null
        },
      })
      // this.taskQueue.forEach((tsk) => this.taskSubject.next(tsk))
    }
  }

  private taskHandlerEventCallback (e: EventType, ...args: any[]) {
    console.log('🚀 ~ file: Uploader.ts ~ line 179 ~ Uploader ~ taskHandlerEventCallback ~ e', e, args)
    this.emit(e, ...args)
  }

  private changeUploadTaskStatus (task: UploadTask, status: StatusCode) {
    task.status = status
  }

  private restoreTask (): Promise<UploadTask[]> {
    return new Promise((resolve, reject) => {
      Storage.UploadTask.list()
        .then((list: unknown[]) => {
          console.log('Uploader -> restoreTask -> list', list)
          const taskList: UploadTask[] = []
          const fn = () => {
            const arr = list.splice(0, 20) as UploadTask[]
            if (arr.length) {
              arr.forEach((task) => {
                if (task.status === StatusCode.Complete) {
                  return this.removeTaskFromStroage(task)
                }
                task.status = StatusCode.Pause
                task.progress = task.progress >= 100 ? 99 : task.progress
                this.taskQueue.push(task)
                taskList.push(task)
                this.options.autoUpload && this.upload(task)
                this.emit(EventType.TaskRestore, task)
              })
              requestAnimationFrame(fn)
            } else {
              resolve(taskList)
            }
          }
          fn()
        })
        .catch((e) => reject(e))
    })
  }

  private initFilePickersAndDraggers () {
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
              const beforeAdd = this.options.beforeFileAdd?.(files) || Promise.resolve()
              return from(beforeAdd).pipe(mapTo(files))
            }),
            concatMap((files: File[]) => {
              return from(this.addFilesAsync(...files)).pipe(map((tasks) => ({ files, tasks })))
            }),
            concatMap(({ files, tasks }) => {
              const afterAdd = this.options.fileAdded?.(files, tasks) || Promise.resolve()
              return from(afterAdd).pipe(mapTo(tasks))
            }),
          )
          .subscribe(),
      )
    }
  }

  private initEventHandler (): void {
    this.on(EventType.TaskAdd, (task: UploadTask) => {
      this.options.autoUpload && this.upload(task)
    })
  }

  addFiles (...files: Array<File | string>): Promise<UploadTask[]> {
    return new Promise((resolve, reject) => {
      console.log('Uploader -> addFile -> files', files)
      if (!files?.length) {
        return resolve([])
      }
      const filelist: UploadFile[] = []
      const { fileFilter } = this.options
      files.forEach((file) => {
        let ignored = false
        let fileName = typeof file === 'string' ? '' : file.name // TODO
        if (fileFilter instanceof RegExp) {
          ignored = !fileFilter.test(fileName)
        } else if (typeof fileFilter === 'function') {
          ignored = !fileFilter(fileName, file)
        }
        !ignored && filelist.push(...fileFactory(file))
      })
      console.log('Uploader -> addFile -> filelist', filelist)
      const tasks = this.generateTask(...filelist)
      console.log(this.taskQueue)
      const resolveTask = (tasks: UploadTask[]) => {
        resolve(tasks)
      }
      this.options.resumable
        ? this.presistTask(...tasks).subscribe(() => resolveTask(tasks), reject)
        : resolveTask(tasks)
    })
  }

  // TEST
  addFilesAsync (...files: Array<File | string>): Promise<UploadTask[]> {
    return new Promise((resolve, reject) => {
      console.log('Uploader -> addFile -> files', files)
      if (!files?.length) {
        return resolve([])
      }

      const { fileFilter } = this.options
      const resolveTask = (tasks: UploadTask[]) => {
        resolve(tasks)
      }
      const finish = (tasks: UploadTask[]) => {
        this.options.resumable
          ? this.presistTask(...tasks).subscribe(() => resolveTask(tasks), reject)
          : resolveTask(tasks)
      }
      const tasks: UploadTask[] = []
      const loop = () => {
        if (files.length) {
          const filelist: UploadFile[] = []
          console.log(files.length)
          const arr = files.splice(0, 20)

          arr.forEach((file) => {
            let ignored = false
            let fileName = typeof file === 'string' ? '' : file.name // TODO
            if (fileFilter instanceof RegExp) {
              ignored = !fileFilter.test(fileName)
            } else if (typeof fileFilter === 'function') {
              ignored = !fileFilter(fileName, file)
            }
            if (!ignored) {
              filelist.push(...fileFactory(file))
              // console.log('Uploader -> addFile -> filelist', filelist)
            }
          })

          const currentTasks: UploadTask[] = this.generateTask(...filelist)
          tasks.push(...currentTasks)
          requestAnimationFrame(() => loop())
        } else {
          finish(tasks)
        }
      }
      loop()
    })
  }

  private generateTask (...fileList: UploadFile[]): UploadTask[] {
    const taskList: UploadTask[] = []
    fileList.forEach((file: UploadFile) => {
      let task: Nullable<UploadTask> = null
      let pos = file.relativePath.indexOf('/')
      let inFolder = !this.options.singleTask && pos !== -1
      if (!inFolder) {
        task = new UploadTask(file)
        task.name = file.name
      } else {
        let parentPath: string = file.relativePath.substring(0, pos)
        let existsTask: UploadTask | undefined = this.taskQueue.find((tsk) => {
          return tsk.fileIDList.some((id) => FileStore.get(id)?.relativePath.startsWith(parentPath))
        })
        if (existsTask) {
          existsTask.fileIDList.push(file.id)
          !taskList.some((tsk) => tsk.id === existsTask?.id) && taskList.push(existsTask)
        } else {
          task = new UploadTask(file)
        }
      }
      if (task) {
        const ossOptions = this.options?.ossOptions
        task.oss = ossOptions?.enable ? ossOptions?.type : undefined
        taskList.push(task)
        this.taskQueue.push(task)
        this.emit(EventType.TaskAdd, task)
        this.options.autoUpload && this.upload()
      }
    })
    return taskList
  }
}

export interface OssOptions {
  enable: boolean
  type: OSS
  keyGenerator: (file: UploadFile, task: UploadTask) => Promise<string> | string
  uptokenGenerator: (file: UploadFile, task: UploadTask) => Promise<string> | string
}

export interface RequestOptions {
  url: string | ((task: UploadTask, upfile: UploadFile, chunk: FileChunk) => string | Promise<string>)
  method?: RequestMethod
  headers?: StringKeyObject | ((task: UploadTask, upfile: UploadFile) => StringKeyObject | Promise<StringKeyObject>)
  body?:
    | StringKeyObject
    | ((task: UploadTask, upfile: UploadFile, params: StringKeyObject) => StringKeyObject | Promise<StringKeyObject>)
  timeout?: number
  withCredentials?: boolean
}

export interface UploaderOptions {
  requestOptions: RequestOptions
  ossOptions?: OssOptions

  singleTask?: boolean

  skipFileWhenUploadError?: boolean
  skipTaskWhenUploadError?: boolean

  computeFileHash?: boolean
  computeChunkHash?: boolean

  autoUpload?: boolean
  maxRetryTimes?: number
  retryInterval?: number

  resumable?: boolean
  chunked?: boolean
  chunkSize?: number
  chunkConcurrency?: number
  taskConcurrency?: number

  filePicker?: FilePickerOptions | FilePickerOptions[]
  fileDragger?: FileDraggerOptions | FileDraggerOptions[]
  fileFilter?: RegExp | ((fileName: string, file: File | string) => boolean)

  readFileFn?: (taks: UploadTask, upfile: UploadFile, start?: number, end?: number) => Blob | Promise<Blob>
  computeHashFn?: (data: Blob | string, upfile: UploadFile) => string | Promise<string>
  requestBodyProcessFn?: (params: StringKeyObject) => Promise<any> | any

  beforeFileAdd?: (files: Array<File | string>) => MaybePromise
  fileAdded?: (files: Array<File | string>, tasks: UploadTask[]) => MaybePromise

  beforeTaskStart?: (task: UploadTask) => MaybePromise
  taskStarted?: (task: UploadTask) => MaybePromise

  beforeFileUploadStart?: (file: UploadFile, task: UploadTask) => MaybePromise
  fileUploadStarted?: (file: UploadFile, task: UploadTask) => MaybePromise

  beforeFileHashCompute?: (file: UploadFile, task: UploadTask) => MaybePromise
  fileHashComputed?: (file: UploadFile, task: UploadTask) => MaybePromise

  beforeFileRead?: (chunk: FileChunk, file: UploadFile, task: UploadTask) => MaybePromise
  fileReaded?: (chunk: FileChunk, file: UploadFile, task: UploadTask) => MaybePromise

  beforeUploadRequestSend?: (requestParams: StringKeyObject, file: UploadFile, task: UploadTask) => MaybePromise
  uploadRequestSent?: (requestParams: StringKeyObject, file: UploadFile, task: UploadTask) => MaybePromise

  beforeUploadResponseProcess?: (
    response: AjaxResponse,
    chunk: FileChunk,
    file: UploadFile,
    task: UploadTask,
  ) => MaybePromise
  uploadResponseProcessed?: (
    response: AjaxResponse,
    chunk: FileChunk,
    file: UploadFile,
    task: UploadTask,
  ) => MaybePromise

  beforeFileUploadComplete?: (file: UploadFile, task: UploadTask) => MaybePromise
}

type MaybePromise = Promise<any> | void
