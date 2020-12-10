export enum EventType {
  FileIgnored = 'FileIgnored',
  FileUploadStart = 'FileUploadStart',
  FileError = 'FileError',
  FileComplete = 'FileComplete',

  FileSkip = 'FileSkip',

  TaskCreated = 'TaskCreated',
  TaskUpdate = 'TaskUpdate',
  TaskRestore = 'TaskRestore',
  TaskPresist = 'TaskPresist',
  TaskWaiting = 'TaskWaiting',
  TaskUploadStart = 'TaskUploadStart',
  TaskProgress = 'TaskProgress',
  TaskPause = 'TaskPause',
  TaskResume = 'TaskResume',
  TaskRetry = 'TaskRetry',
  TaskError = 'TaskError',
  TaskCancel = 'TaskCancel',
  TaskComplete = 'TaskComplete',

  Complete = 'Complete',
}

export enum StatusCode {
  Waiting = 'waiting',
  Uploading = 'uploading',
  Pause = 'pause',
  Error = 'error',
  Complete = 'complete',
}

enum TaskExtraStatus {
  Reading = 'reading',
  Transfer = 'reading',
}

export type ID = string | number

export type Protocol = 'http:' | 'https:'

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'get' | 'post' | 'put' | 'patch' | 'delete'

export type Domain = string | { http: string; https: string }

export type OSS = false | 'qiniu'

export type StringKeyObject = { [key: string]: any }

export type FileStatus = StatusCode

export type ChunkStatus = StatusCode

export type TaskStatus = StatusCode | TaskExtraStatus

export interface FileChunk {
  id: ID
  start: number
  end: number
  index: number
  data: Nullable<Blob>
  hash: string
  uploaded: number
  size: number
  progress: number
  status: ChunkStatus
  response: StringKeyObject
}

export interface UploadFile {
  id: ID
  hash: string
  name: string
  type: string
  size: number
  relativePath: string
  path: string
  lastModified: number
  raw: Nullable<Blob>

  uploaded: number
  chunkIDList: ID[]
  chunkList: FileChunk[]
  progress: number
  status: FileStatus
  response: StringKeyObject
  extraInfo: StringKeyObject
}

export interface UploadTask {
  id: ID
  name: string
  type: 'file' | 'dir'
  fileIDList: ID[]
  fileList: UploadFile[]
  filSize: number
  extraInfo: StringKeyObject
  oss: OSS
  progress: number
  status: TaskStatus
  addTime: Date
}

export interface FilePickerOptions {
  $el: HTMLInputElement | string
  multiple?: boolean
  directory?: boolean
  accept?: string[]
}

export interface FileDraggerOptions {
  $el: HTMLElement
  onDragover?: DragEventHandler
  onDragenter?: DragEventHandler
  onDragleave?: DragEventHandler
  onDrop?: DragEventHandler
}

export type DragEventHandler = (event: DragEvent) => void

export type MaybePromise = Promise<any> | void
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

export interface AjaxResponse {
  originalEvent: Event
  xhr: XMLHttpRequest
  request?: any
  status: number
  response: any
  responseText: string
  responseType: string
}

export interface UploaderOptions {
  requestOptions: RequestOptions
  ossOptions?: OssOptions

  singleFileTask?: boolean

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

  beforeFilesAdd?: (files: Array<File | string>) => MaybePromise
  filesAdded?: (files: Array<File | string>, tasks: UploadTask[]) => MaybePromise

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

export type RequestOpts = {
  url: string
  headers: StringKeyObject
  body: UploadFormData
}

export interface ChunkResponse {
  chunk: FileChunk
  response?: AjaxResponse
}

export interface ProgressPayload {
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
