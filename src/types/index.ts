export enum EventType {
  FileUploadStart = 'file-upload-start',
  FileError = 'file-error',
  FileComplete = 'file-complete',

  ChunkUploadStart = 'chunk-upload-start',
  ChunkError = 'chunk-error',
  ChunkComplete = 'chunk-complete',

  TaskCreated = 'task-created',
  TaskUpdate = 'task-update',
  TaskRestore = 'task-restore',
  TaskPresist = 'task-presist',
  TaskWaiting = 'task-waiting',
  TaskUploadStart = 'task-upload-start',
  TaskProgress = 'task-progress',
  TaskPause = 'task-pause',
  TaskResume = 'task-resume',
  TaskRetry = 'task-retry',
  TaskError = 'task-error',
  TaskCancel = 'task-cancel',
  TaskComplete = 'task-complete',

  Complete = 'complete',
}

export enum StatusCode {
  Waiting = 'waiting',
  Uploading = 'uploading',
  Pause = 'pause',
  Error = 'error',
  Complete = 'complete',
}

export type ID = string | number

export type Protocol = 'http:' | 'https:'

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type OSS = false | 'qiniu'

export type StringKeyObject = { [key: string]: any }

export type FileStatus = StatusCode

export type ChunkStatus = StatusCode

export type TaskStatus = StatusCode

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
  extraInfo: StringKeyObject
}

export interface UploadFile {
  id: ID
  name: string
  type: string
  size: number
  relativePath: string
  path: string
  lastModified: number
  hash: string
  raw: Nullable<Blob>

  uploaded: number
  chunkIDList: ID[]
  chunkList: FileChunk[]
  progress: number
  status: FileStatus
  response: StringKeyObject
  extraInfo: StringKeyObject
}

export type TaskType = 'file' | 'dir'
export interface UploadTask {
  id: ID
  name: string
  type: TaskType
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
  // 上传请求url
  url: string | ((task: UploadTask, upfile: UploadFile, chunk: FileChunk) => string | Promise<string>)
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
  // 请求配置
  requestOptions: RequestOptions

  // oss配置
  ossOptions?: OssOptions

  // 是否单文件任务
  singleFileTask?: boolean

  // 是否文件计算hash（默认md5）
  computeFileHash?: boolean

  // 是否每个分片hash（默认md5）
  computeChunkHash?: boolean

  // 选择文件后自动上传
  autoUpload?: boolean

  // 错误时最大重试次数
  maxRetryTimes?: number

  // 错误时重试间隔
  retryInterval?: number

  // 是否保存任务便于断点续传
  resumable?: boolean

  // 是否分片
  chunked?: boolean

  // 分片大小
  chunkSize?: number

  // 一个文件可同时上传的分片并发数
  chunkConcurrency?: number

  // 可同时上传的任务并发数
  taskConcurrency?: number

  // 任务中单个文件上传上传错误是否跳过该文件
  skipFileWhenUploadError?: boolean

  // 上传过程中任务出错是否跳过该任务
  skipTaskWhenUploadError?: boolean

  // 文件选择器
  filePicker?: FilePickerOptions | FilePickerOptions[]

  // 文件拖拽器
  fileDragger?: FileDraggerOptions | FileDraggerOptions[]

  // 文件过滤器
  fileFilter?: RegExp | ((fileName: string, file: File | string) => boolean)

  // 读取文件的方法
  readFileFn?: (taks: UploadTask, upfile: UploadFile, start?: number, end?: number) => Blob | Promise<Blob>

  // 处理requestBody的方法
  requestBodyProcessFn?: (params: StringKeyObject) => Promise<any> | any

  // 文件添加前（选择文件后）
  beforeFilesAdd?: (files: Array<File | string>) => MaybePromise

  // 任务开始前
  beforeTaskStart?: (task: UploadTask) => MaybePromise

  // 文件开始上传前
  beforeFileUploadStart?: (file: UploadFile, task: UploadTask) => MaybePromise

  // 文件hash计算前（如需计算hash）
  beforeFileHashCompute?: (file: UploadFile, task: UploadTask) => MaybePromise

  // 文件读取前（分片读取）
  beforeFileRead?: (chunk: FileChunk, file: UploadFile, task: UploadTask) => MaybePromise

  // 上传请求发送前
  beforeUploadRequestSend?: (requestParams: StringKeyObject, file: UploadFile, task: UploadTask) => MaybePromise

  // 处理上传请求响应前
  beforeUploadResponseProcess?: (
    response: AjaxResponse,
    chunk: FileChunk,
    file: UploadFile,
    task: UploadTask,
  ) => MaybePromise
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

export interface BaseParams {
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
}

export interface UploadFormData extends BaseParams {
  file?: Blob
  [key: string]: any
}
