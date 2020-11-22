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
import { tap, map, concatMap, mapTo, mergeMap, catchError, filter } from 'rxjs/operators'
import { from, Observable, throwError, Subscription, merge, Subject, Subscriber, fromEvent } from 'rxjs'
import TaskHandler from './handlers/TaskHandler'
import { AjaxResponse } from 'rxjs/ajax'
import Base from './Base'
import FSAdapter from './helpers/fs-adapter'

const defaultOptions: UploaderOptions = {
  serverURL: '/',
  requestMethod: 'POST',
  requestTimeout: 0,
  autoUpload: false,
  fileCountLimit: 0,
  fileSizeLimit: 0,
  singleFileSizeLimit: 100,
  computeFileHash: false,
  computeChunkHash: false,
  autoRetry: true,
  maxRetryTimes: 3,
  retryInterval: 5000,
  chunked: true,
  chunkSize: 1024 * 1024 * 4,
  chunkConcurrency: 1,
  taskConcurrency: 1,
  resumable: true,
  fileParameterName: 'file',
  unpresistTaskWhenSuccess: true,
}

export class Uploader extends Base {
  options: UploaderOptions
  taskQueue: UploadTask[] = []
  private taskHandlerMap: Map<
    string,
    { handler?: TaskHandler; observable?: Observable<any>; subscriber?: Subscriber<any> }
  > = new Map()
  private upload$: Observable<any> | null = null
  private uploadSubscription: Subscription | null = null
  private taskSubject: Subject<UploadTask> = new Subject<UploadTask>()

  private waitingTaskMap: Map<ID, UploadTask> = new Map()

  constructor (options?: UploaderOptions) {
    super()
    const opt = Object.assign({}, defaultOptions, options || {})
    this.validateOptions(opt)
    this.options = opt
    this.initFilePickersAndDraggers()
    this.initEventHandler()
    this.options.resumable && this.restoreTask()
  }

  static create (options?: UploaderOptions): Uploader {
    return new Uploader(options)
  }

  private validateOptions (options: UploaderOptions) {
    // TODO
  }

  private createTaskObservable (task: UploadTask): Observable<any> {
    const observable = Observable.create((subscriber: Subscriber<any>) => {
      let taskHandlerMap = this.taskHandlerMap.get(String(task.id))
      if (taskHandlerMap?.handler && taskHandlerMap?.observable) {
        this.taskHandlerMap.set(String(task.id), Object.assign(taskHandlerMap, { observable, subscriber }))
        return
      }
      const handler = handleTask(task, this.options)
      this.taskHandlerMap.set(String(task.id), { handler, observable, subscriber })
      Object.keys(EventType).forEach((e) => handler.on(e, (...args) => this.emit(e, ...args)))
      const getSubscriber = () => this.taskHandlerMap.get(String(task.id))?.subscriber
      handler.on(EventType.TaskError, (error: Error) => {
        getSubscriber()?.error(error)
      })
      handler.on(EventType.TaskPaused, () => {
        console.warn('Uploader -> EventType.TaskPaused', task)
        getSubscriber()?.complete()
      })
      handler.on(EventType.TaskComplete, () => {
        let subscriber = getSubscriber()
        subscriber?.next()
        subscriber?.complete()
      })
      handler.handle()
      return () => {
        // handler.pause()
        console.warn('..................')
      }
    })

    console.warn('createTaskObservable -> observable', observable)
    return observable
  }

  upload1 (task?: UploadTask): void {
    task = task || this.taskQueue[0]
    let handler = handleTask(task, this.options)
    let ob = handler.handle()

    // this.taskHandlerMap.set(String(task.id), { handler })
    // handler.on(EventType.TaskProgress, (...args) => this.emit(EventType.TaskProgress, ...args))
  }
  upload (task?: UploadTask): void {
    if (this.uploadSubscription && this.uploadSubscription.closed === false) {
      return this.putNextTask(task)
    }
    this.upload$ = this.taskSubject.pipe(
      filter((tsk: UploadTask) => {
        let flag =
          tsk &&
          tsk.status !== StatusCode.Success &&
          tsk.status !== StatusCode.Uploading &&
          !this.waitingTaskMap.has(tsk.id)
        if (!flag) {
          console.log('filtered>>>>>>>', tsk)
        }
        return flag
      }),
      // tap((task) => {
      //   console.warn('before distinctUntilChanged Uploader -> upload -> task', task)
      // }),
      // distinctUntilChanged(),
      tap((task: UploadTask) => {
        console.log('upload=======', task)
        // task.status = StatusCode.Waiting
        this.waitingTaskMap.set(task.id, task)
      }),
      mergeMap((tsk) => {
        console.warn('Uploader -> upload -> tsk', tsk)
        this.waitingTaskMap.delete(tsk.id)
        // tsk.status = StatusCode.Uploading

        let existshandler = this.taskHandlerMap.get(String(tsk.id))?.handler
        let taskHandler = this.taskHandlerMap.get(String(tsk.id))?.handler as TaskHandler
        let job$ = this.createTaskObservable(tsk).pipe(
          map((v) => ({ task: tsk, handler: taskHandler })),
          catchError((e) => {
            return throwError(e)
          }),
          tap((v) => {
            console.warn('Uploader -> upload -> v11', v)
          }),
          // repeatWhen(() => fromEvent(taskHandler, EventType.TaskResume)),
        )
        this.taskHandlerMap.set(
          String(tsk.id),
          Object.assign(this.taskHandlerMap.get(String(tsk.id)) || {}, { observable: job$ }),
        )
        if (existshandler) {
          if (tsk.status === StatusCode.Pause) {
            existshandler.resume()
          } else if (tsk.status === StatusCode.Error) {
            existshandler.retry()
          }
        }
        console.warn('Uploader -> upload -> ob====', job$)
        return job$
      }, this.options.taskConcurrency || 1),
      tap((v) => {
        console.log('Uploader -> upload -> v okokok', v)
        let { task } = v
        this.taskHandlerMap.delete(String(task.id))
      }),
    )
    this.uploadSubscription?.unsubscribe()
    this.uploadSubscription = null
    console.log('Uploader -> upload ->  this.upload$', this.upload$)
    this.uploadSubscription = this.upload$.subscribe({
      next: (v) => {
        console.log('Uploader -> upload -> v', v)
        let hasUploading = this.isUploading()
        console.log('Uploader -> upload -> hasUploading', hasUploading, this.taskQueue)
        // if (!hasUploading) {
        //   this.uploadSubscription?.unsubscribe()
        //   this.uploadSubscription = null
        // }
        if (this.isComplete()) {
          this.emit(EventType.Complete)
        }
      },
      error: (err: Error) => {
        console.log('Uploader -> upload -> err', err)
      },
      complete: () => {
        console.log('complete....complete.complete.complete.complete.complete')
        this.uploadSubscription?.unsubscribe()
      },
    })
    this.putNextTask(task)
  }

  pause (task?: UploadTask): void {
    if (task) {
      let handler = this.taskHandlerMap.get(String(task.id))?.handler
      handler?.pause()
    } else {
      let it = this.taskHandlerMap.values()
      let next = it.next()
      while (!next.done) {
        next.value.handler?.pause()
        next = it.next()
      }
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
      this.taskQueue.forEach((tsk) => {
        this.taskSubject.next(tsk)
      })
    }
  }

  resume (task?: UploadTask): void {
    this.putNextTask(task)
  }

  retry (task?: UploadTask): void {
    this.putNextTask(task)
  }

  cancel (task?: UploadTask): void {
    if (task) {
      let handler = this.taskHandlerMap.get(String(task.id))?.handler
      handler?.abort()
      this.taskHandlerMap.delete(String(task.id))
      this.removeFromTaskQueueAndStroage(task.id)
      let index = this.taskQueue.findIndex((tsk) => tsk.id === task.id)
      index !== -1 && this.taskQueue.splice(index, 0)
    } else {
      this.clear()
    }
  }

  clear (): void {
    this.taskQueue.forEach((task) => {
      let taskID = task.id
      let entry = this.taskHandlerMap.get(String(taskID))
      entry?.handler?.abort()
      this.taskHandlerMap.delete(String(taskID))
    })
    this.removeFromTaskQueueAndStroage(...this.taskQueue.map((i) => i.id))
    this.uploadSubscription?.unsubscribe()
  }

  isUploading (): boolean {
    if (!this.uploadSubscription) {
      return false
    }
    return this.taskQueue.some((task) => task.status === StatusCode.Uploading)
  }

  isComplete (): boolean {
    return this.taskQueue.every((task) => task.status === StatusCode.Success)
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
    }, 1000)
  }

  private restoreTask () {
    Storage.UploadTask.list()
      .then((list: unknown[]) => {
        console.log('Uploader -> restoreTask -> list', list)
        list.forEach((v) => {
          // TODO
          // task.fileIDList.forEach((id) => {
          //   storage.getUploadFile(id).then((file) => file && FileStore.add(file))
          // })
          let task = v as UploadTask
          if (task.status === StatusCode.Success) {
            return
          }
          task.status = StatusCode.Pause
          task.progress = task.progress >= 100 ? 99 : task.progress
          // task.status = task.status === StatusCode.Uploading ? StatusCode.Pause : task.status
          this.taskQueue.push(task)
          this.emit(EventType.TaskRestore, task)
        })
      })
      .catch(console.warn)
  }

  private initFilePickersAndDraggers () {
    const { filePicker, fileDragger } = this.options
    const filePickers = Array.isArray(filePicker) ? filePicker : filePicker ? [filePicker] : null
    const fileDraggers = Array.isArray(fileDragger) ? fileDragger : fileDragger ? [fileDragger] : null
    const obs: Observable<File[]>[] = []

    if (filePickers && filePickers.length) {
      obs.push(...filePickers.map((opts) => new FilePicker(opts).file$))
    }

    if (fileDraggers && fileDraggers.length) {
      obs.push(...fileDraggers.map((opts) => new FileDragger(opts).file$))
    }

    if (obs.length) {
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
        .subscribe()
    }
  }

  private initEventHandler (): void {
    this.on(EventType.TaskAdd, (task: UploadTask) => {
      if (this.isUploading()) {
        this.taskSubject.next(task)
        this.options.autoUpload && this.upload()
      }
    })
  }

  addFiles (...files: Array<File | string>): Promise<UploadTask[]> {
    return new Promise((resolve, reject) => {
      console.log('Uploader -> addFile -> files', files)
      if (!files || !files.length) {
        return resolve([])
      }
      const filelist: UploadFile[] = []
      const { fileFilter } = this.options
      files.forEach((file) => {
        let ignored = false
        // TODO
        let fileName = typeof file === 'string' ? '' : file.name
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
        this.options.autoUpload && this.upload()
      }
      this.options.resumable
        ? this.presistTask(...tasks).subscribe(() => resolveTask(tasks), reject)
        : resolveTask(tasks)
    })
  }

  addFilesAsync (...files: Array<File | string>): Promise<UploadTask[]> {
    return new Promise((resolve, reject) => {
      console.log('Uploader -> addFile -> files', files)
      if (!files || !files.length) {
        return resolve([])
      }

      const { fileFilter } = this.options
      const resolveTask = (tasks: UploadTask[]) => {
        resolve(tasks)
        this.options.autoUpload && this.upload()
      }
      const finish = (tasks: UploadTask[]) => {
        this.options.resumable
          ? this.presistTask(...tasks).subscribe(() => resolveTask(tasks), reject)
          : resolveTask(tasks)
      }
      let timer: any
      const fn = () => {
        if (files.length) {
          const filelist: UploadFile[] = []
          console.log(files.length)
          clearTimeout(timer)
          let file = files.splice(0, 1)[0]
          console.log('Uploader -> fn -> file', file)
          let ignored = false
          // TODO
          let fileName = typeof file === 'string' ? '' : file.name
          if (fileFilter instanceof RegExp) {
            ignored = !fileFilter.test(fileName)
          } else if (typeof fileFilter === 'function') {
            ignored = !fileFilter(fileName, file)
          }
          if (!ignored) {
            filelist.push(...fileFactory(file))
            console.log('Uploader -> addFile -> filelist', filelist)
            const tasks = this.generateTask(...filelist)
            finish(tasks)
          }
          timer = setTimeout(() => fn(), 500)
        }
      }
      fn()
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
        task.oss = this.options.ossConfig?.provider
        taskList.push(task)
        this.taskQueue.push(task)
        this.emit(EventType.TaskAdd, task)
      }
    })
    return taskList
  }
}

interface OSSConfig {
  enable: boolean
  provider: OSS
  objectKeyGenerator: (file: UploadFile, task: UploadTask) => Promise<string> | string
  uptokenGenerator: (file: UploadFile, task: UploadTask) => Promise<string> | string
}

interface RequestOptions {
  url: string | ((task: UploadTask, upfile: UploadFile, chunk: FileChunk) => string | Promise<string>)
  method?: RequestMethod
  headers: StringKeyObject | ((task: UploadTask, upfile: UploadFile) => StringKeyObject | Promise<StringKeyObject>)
  body: StringKeyObject | ((task: UploadTask, upfile: UploadFile) => StringKeyObject | Promise<StringKeyObject>)
  timeout?: number
  withCredentials?: boolean
}

export interface UploaderOptions {
  serverURL: string | ((task: UploadTask, upfile: UploadFile, chunk: FileChunk) => string | Promise<string>)
  requestMethod?: RequestMethod
  requestParams?:
    | StringKeyObject
    | ((task: UploadTask, upfile: UploadFile) => StringKeyObject | Promise<StringKeyObject>)
  requestHeaders?:
    | StringKeyObject
    | ((task: UploadTask, upfile: UploadFile) => StringKeyObject | Promise<StringKeyObject>)
  withCredentials?: boolean
  requestTimeout?: number
  ossConfig?: OSSConfig
  taskExtraInfo?: StringKeyObject
  fileParameterName?: string
  singleTask?: boolean
  unpresistTaskWhenSuccess?: boolean

  skipFileWhenUploadError?: boolean
  skipTaskWhenUploadError?: boolean
  resumable?: boolean
  computeFileHash?: boolean
  computeChunkHash?: boolean
  autoUpload?: boolean

  fileCountLimit?: number
  fileSizeLimit?: number
  singleFileSizeLimit?: number

  autoRetry?: boolean
  maxRetryTimes?: number
  retryInterval?: number
  // hooks?: unknown[]
  chunked?: boolean
  chunkSize?: number
  chunkConcurrency?: number
  taskConcurrency?: number

  filePicker?: FilePickerOptions | FilePickerOptions[]
  fileDragger?: FileDraggerOptions | FileDraggerOptions[]

  fileFilter?: RegExp | ((fileName: string, file: File | string) => boolean)

  fsAdapter?: typeof FSAdapter

  readFileFn?: (taks: UploadTask, upfile: UploadFile, chunk: FileChunk) => Blob | Promise<Blob>
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
