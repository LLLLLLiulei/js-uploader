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
import { tap, map, concatMap, mapTo, mergeMap, filter, first } from 'rxjs/operators'
import { from, Observable, throwError, Subscription, merge, Subject, fromEvent, race, of } from 'rxjs'
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

  private taskHandlerMap: Map<ID, TaskHandler> = new Map()
  private upload$: Observable<any> | null = null
  private uploadSubscription: Subscription | null = null
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

  upload (task?: UploadTask): void {
    setTimeout(() => this.putNextTask(task))

    if (this.uploadSubscription && !this.uploadSubscription.closed) {
      return
    }

    this.upload$ = this.taskSubject.pipe(
      filter((task: UploadTask) => {
        return ![StatusCode.Waiting, StatusCode.Uploading, StatusCode.Complete].includes(task.status as StatusCode)
      }),
      tap((task: UploadTask) => {
        console.log('🚀 ~ file: 等待上传', task)
        this.changeUploadTaskStatus(task, StatusCode.Waiting)
        this.emit(EventType.TaskWaiting, task)
      }),
      mergeMap((task: UploadTask) => {
        const handler: TaskHandler = this.rebindTaskHandlerEvent(this.getTaskHandler(task))
        // setTimeout(() => handler.handle())
        handler.handle()

        return race(
          fromEvent(handler, EventType.TaskPaused).pipe(
            tap(() => {
              // 暂停
              console.log('任务暂停')
            }),
          ),
          fromEvent(handler, EventType.TaskCanceled).pipe(
            tap(() => {
              // 被取消
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
            map((err) => {
              // 跳过错误的任务？
              if (this.options.skipTaskWhenUploadError) {
                this.freeHandler(task)
                return of([])
              }
              return throwError(err)
            }),
          ),
        ).pipe(first())
      }, this.options.taskConcurrency || 1),
      tap((v) => {
        console.log('🚀 ~ file: Uploader.ts ~ line 196 ~ Uploader ~ tap ~ v', v)
      }),
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
  }

  resume (task?: UploadTask): void {
    this.putNextTask(task)
  }

  retry (task?: UploadTask): void {
    this.resume(task)
  }

  pause (task?: UploadTask): void {
    if (task) {
      this.taskHandlerMap.get(task.id)?.pause()
    } else {
      from(this.taskHandlerMap.values())
        .pipe(tap((handler: TaskHandler) => handler?.pause()))
        .subscribe()
    }
  }

  cancel (task?: UploadTask): void {
    if (task) {
      this.taskHandlerMap.get(task.id)?.abort()
      this.taskHandlerMap.delete(task.id)
      this.removeFromTaskQueueAndStroage(task.id)
    } else {
      this.clear()
    }
  }

  clear (): void {
    const ids: ID[] = []
    this.taskQueue.forEach((task) => {
      ids.push(task.id)
      this.taskHandlerMap.get(task.id)?.abort()
      this.taskHandlerMap.delete(task.id)
    })
    this.removeFromTaskQueueAndStroage(...ids)
    this.uploadSubscription?.unsubscribe()
    this.uploadSubscription = null
    this.upload$ = null
  }

  isUploading (): boolean {
    if (!this.uploadSubscription) {
      return false
    }
    return this.taskQueue.some((task) => task.status === StatusCode.Uploading || task.status === StatusCode.Waiting)
  }

  isComplete (): boolean {
    return !this.isUploading()
  }

  removeFromTaskQueueAndStroage (...taskIDs: ID[]): void {
    setTimeout(() => {
      taskIDs.forEach((taskID) => {
        let task: UploadTask | null = null
        let index = this.taskQueue.findIndex((item) => {
          let flag = item.id === taskID
          task = flag ? item : null
          return flag
        })
        if (index !== -1 && task) {
          this.taskQueue.splice(index, 1)
          this.removeTaskFromStroage(task)
          this.emit(EventType.TaskCanceled, task)
        }
      })
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
    let handler: TaskHandler | null = this.taskHandlerMap.get(id) || null
    if (handler) {
      this.taskHandlerMap.delete(id)
      Object.keys(EventType).forEach((e) => handler?.off(e))
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
      this.taskQueue.forEach((tsk) => this.taskSubject.next(tsk))
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
          list.forEach((v) => {
            const task = v as UploadTask
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
          resolve(taskList)
        })
        .catch((e) => reject(e))
    })
  }

  private initFilePickersAndDraggers () {
    const { filePicker, fileDragger } = this.options
    const filePickers = Array.isArray(filePicker) ? filePicker : filePicker ? [filePicker] : null
    const fileDraggers = Array.isArray(fileDragger) ? fileDragger : fileDragger ? [fileDragger] : null
    const obs: Observable<File[]>[] = []

    filePickers?.length && obs.push(...filePickers.map((opts) => new FilePicker(opts).file$))
    fileDraggers?.length && obs.push(...fileDraggers.map((opts) => new FileDragger(opts).file$))

    if (obs.length) {
      merge(...obs)
        .pipe(
          concatMap((files: File[]) => {
            const beforeAdd = this.options.beforeFileAdd?.(files) || Promise.resolve()
            return from(beforeAdd).pipe(mapTo(files))
          }),
          concatMap((files: File[]) => {
            return from(this.addFiles(...files)).pipe(map((tasks) => ({ files, tasks })))
          }),
          concatMap(({ files, tasks }) => {
            const afterAdd = this.options.fileAdded?.(files, tasks) || Promise.resolve()
            return from(afterAdd).pipe(mapTo(tasks))
          }),
        )
        .subscribe()
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
        // this.options.autoUpload && this.upload()
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
        // this.options.autoUpload && this.upload()
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
          const arr = files.splice(0, 10)
          console.log('🚀 ~ file: Uploader.ts ~ line 416 ~ Uploader ~ fn ~ arr', arr)

          arr.forEach((file) => {
            console.log('Uploader -> fn -> file', file)
            let ignored = false
            let fileName = typeof file === 'string' ? '' : file.name // TODO
            if (fileFilter instanceof RegExp) {
              ignored = !fileFilter.test(fileName)
            } else if (typeof fileFilter === 'function') {
              ignored = !fileFilter(fileName, file)
            }
            if (!ignored) {
              filelist.push(...fileFactory(file))
              console.log('Uploader -> addFile -> filelist', filelist)
            }
          })

          const currentTasks: UploadTask[] = this.generateTask(...filelist)
          tasks.push(...currentTasks)
          console.log('🚀 ~ file: Uploader.ts ~ line 435 ~ Uploader ~ fn ~ tasks', currentTasks)
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
      let task: UploadTask | null = null
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
