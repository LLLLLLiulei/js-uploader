import type { Stats } from 'fs'

/**
 * 事件类型
 */
export enum EventType {
  FileWaiting = 'file-waiting',
  // 文件开始上传
  FileUploadStart = 'file-upload-start',
  //   文件进度
  FileProgress = 'file-progress',
  FilePause = 'file-pause',
  FilesPause = 'files-pause',
  // 文件上传出错
  FileError = 'file-error',
  FileCancel = 'file-cancel',
  FilesCancel = 'files-cancel',
  // 文件上传完成
  FileComplete = 'file-complete',

  // 分块开始上传
  ChunkUploadStart = 'chunk-upload-start',
  // 分块上传错误
  ChunkError = 'chunk-error',
  // 分块上传完成
  ChunkComplete = 'chunk-complete',

  // 任务创建
  TaskCreated = 'task-created',
  // 任务更新（增加了新文件等）
  TaskUpdate = 'task-update',
  // 任务恢复
  TaskRestore = 'task-restore',
  // 任务持久化
  TaskPresist = 'task-presist',
  // 任务持久化
  TasksPresist = 'tasks-presist',
  //   批量添加任务完成
  TasksAdded = 'tasks-added',
  // 任务进入等待队列
  TaskWaiting = 'task-waiting',
  // 任务开始上传
  TaskUploadStart = 'task-upload-start',
  // 任务进度
  TaskProgress = 'task-progress',
  // 任务暂停上传
  TaskPause = 'task-pause',
  TasksPause = 'tasks-pause',
  // 任务继续上传
  TaskResume = 'task-resume',
  // 任务重试
  TaskRetry = 'task-retry',
  // 任务上传出错
  TaskError = 'task-error',
  // 任务取消
  TaskCancel = 'task-cancel',
  // 任务完成
  TaskComplete = 'task-complete',

  Clear = 'clear',

  // 所有任务完成
  Complete = 'complete',
}

/**
 * 状态码
 */
export enum StatusCode {
  // 等待
  Waiting = 'waiting',
  // 上传中
  Uploading = 'uploading',
  // 暂停
  Pause = 'pause',
  // 错误
  Error = 'error',
  // 完成
  Complete = 'complete',
}

export enum OSSProvider {
  Qiniu = 'qiniu',
  S3 = 's3',
}

export type ID = string | number

export type Protocol = 'http:' | 'https:'

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type OSS = OSSProvider

export type Obj = { [key: string]: any }

export type FileStatus = StatusCode

export type ChunkStatus = StatusCode

export type TaskStatus = StatusCode

/**
 * 文件分块
 */
export interface FileChunk {
  // 唯一标示
  id: ID
  // 起始位置
  start: number
  // 终点位置
  end: number
  // 索引
  index: number
  // 二进制数据
  data: Nullable<Blob>
  // hash值
  hash: string
  // 已上传字节数
  uploaded: number
  // 大小
  size: number
  // 进度
  progress: number
  // 状态
  status: ChunkStatus
  // 响应
  response: Obj
  // 额外信息
  extraInfo: Obj
}

/**
 * 上传文件
 */
export interface UploadFile {
  // 唯一标示
  id: ID
  // 名称
  name: string
  // 类型 mimeType
  type: string
  // 大小
  size: number
  // 相对路径（有文件夹时）
  relativePath: string
  // 路径
  path: string
  // 最后修改时间
  lastModified: number
  // hash值
  hash: string
  // 原始数据（二进制数据）
  raw: Nullable<Blob>
  // 已上传字节数
  uploaded: number
  // 分块ID列表
  chunkIDList: ID[]
  // 分块列表
  chunkList: FileChunk[]
  // 进度
  progress: number
  // 状态
  status: FileStatus
  // 响应数据（最后一分块响应数据）
  response: Obj
  // 额外信息
  extraInfo: Obj
}

/**
 * 任务类型（文件或文件夹）
 */
export type TaskType = 'file' | 'dir'

/**
 * 上传任务
 */
export interface UploadTask {
  // 唯一标示
  id: ID
  // 名称（文件名称或文件夹名称）
  name: string
  // 任务类型
  type: TaskType
  // 文件ID列表
  fileIDList: ID[]
  // 文件列表
  fileList: UploadFile[]
  // 文件总大小
  fileSize: number

  uploaded: number
  // oss类型
  oss?: Nullable<OSS>
  // 进度
  progress: number
  // 状态
  status: TaskStatus
  // 添加时间
  addTime: Date
  // 额外信息
  extraInfo: Obj
}

/**
 * 文件选择器配置
 */
export interface FilePickerOptions {
  // input元素或者有效的查询选择器
  $el: HTMLInputElement | string
  // 多选 input原生属性
  multiple?: boolean
  // 选择文件夹 input原生属性
  directory?: boolean
  // 接收类型 input原生属性
  accept?: string[]
}

/**
 * 文件拖拽器配置
 */
export interface FileDraggerOptions {
  // 元素或者有效的查询选择器
  $el: HTMLElement
  //  dragover事件
  onDragover?: DragEventHandler
  //  dragenter事件
  onDragenter?: DragEventHandler
  //  dragleave事件
  onDragleave?: DragEventHandler
  //  drop事件
  onDrop?: DragEventHandler
}

export type DragEventHandler = (event: DragEvent) => void

export type MaybePromise = Promise<any> | void
export interface OssOptions {
  enable: (task: UploadTask) => TPromise<boolean>
  provider?: Nullable<OSSProvider>
  s3Config?: S3Config | (() => TPromise<S3Config>)
  keyGenerator?: (file: UploadFile, task: UploadTask) => TPromise<string>
  uptokenGenerator?: (file: UploadFile, task: UploadTask) => TPromise<string> // 仅qiniu使用
}

export type TPromise<T> = T | Promise<T>

export type ResponseType = 'json' | 'text'
export interface RequestOptions {
  // 上传请求url
  url: string | ((task: UploadTask, upfile: UploadFile, chunk: FileChunk) => TPromise<string>)
  headers?: Obj | ((task: UploadTask, upfile: UploadFile, chunk: FileChunk) => TPromise<Obj>)
  body?: Obj | ((task: UploadTask, upfile: UploadFile, chunk: FileChunk, params: Obj) => TPromise<Obj>)
  method?: RequestMethod | ((task: UploadTask, upfile: UploadFile, chunk: FileChunk) => TPromise<RequestMethod>)
  responseType?: ResponseType | ((task: UploadTask, upfile: UploadFile, chunk: FileChunk) => TPromise<ResponseType>)
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

/**
 * 文件上传器配置
 */
export interface UploaderOptions {
  id?: ID
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
  // 可同时上传的文件数量
  fileConcurrency?: number
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

  // 可被恢复的任务状态
  recoverableTaskStatus?: StatusCode[]

  //   读取目录的方法
  readdirFn?: (path: string) => TPromise<string[]>
  //   获取文件stat的方法
  fileStatFn?: (path: string) => TPromise<Stats>
  // 读取文件的方法
  readFileFn?: (task: UploadTask, upfile: UploadFile, start?: number, end?: number) => TPromise<Blob>

  // 处理requestBody的方法
  requestBodyProcessFn?: (task: UploadTask, upfile: UploadFile, chunk: FileChunk, params: Obj) => TPromise<any>

  beforeParseDataTransfer?: (e: DragEvent) => MaybePromise

  // 文件添加前（选择文件后）
  beforeFilesAdd?: (files: File[]) => MaybePromise
  // 文件添加后
  filesAdded?: (files: UploadFile[]) => MaybePromise

  // 任务添加前
  beforeTasksAdd?: (tasks: UploadTask[]) => MaybePromise

  // 任务开始前
  beforeTaskStart?: (task: UploadTask) => MaybePromise

  // 文件开始上传前
  beforeFileUploadStart?: (task: UploadTask, file: UploadFile) => MaybePromise

  // 文件hash计算前（如需计算hash）
  beforeFileHashCompute?: (task: UploadTask, file: UploadFile) => MaybePromise
  // hash计算后
  fileHashComputed?: (task: UploadTask, file: UploadFile, hash: string) => MaybePromise

  // 文件读取前（分片读取）
  beforeFileRead?: (task: UploadTask, file: UploadFile, chunk: FileChunk) => MaybePromise
  // 文件读取后
  fileReaded?: (task: UploadTask, file: UploadFile, chunk: FileChunk, data: Blob) => MaybePromise

  // 上传请求发送前
  beforeUploadRequestSend?: (task: UploadTask, file: UploadFile, chunk: FileChunk, requestParams: Obj) => MaybePromise

  // 处理上传请求响应前
  beforeUploadResponseProcess?: (
    task: UploadTask,
    file: UploadFile,
    chunk: FileChunk,
    response: AjaxResponse,
  ) => MaybePromise

  //  文件上传完成前
  beforeFileUploadComplete?: (task: UploadTask, file: UploadFile) => MaybePromise
}

export type RequestOpts = {
  url: string
  headers: Obj
  body: UploadFormData
  method?: RequestMethod
  responseType?: 'json' | 'text'
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

/**
 * request基本参数
 */
export interface BaseParams {
  // 当前分片索引 0开始
  chunkIndex: number
  // 分块大小
  chunkSize: number
  // 当前分块大小
  currentChunkSize: number
  // 文件ID唯一标示
  fileID: ID
  // 文件名
  fileName: string
  // 文件大小
  fileSize: number
  // 相对路径
  relativePath: string
  // 总分块数
  chunkCount: number
  // 文件hash
  fileHash?: string
  // 当前分块hash
  chunkHash?: string
}

export interface UploadFormData extends BaseParams {
  file?: Blob
  [key: string]: any
}

export interface Credentials {
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly sessionToken?: string
  readonly expiration?: Date
}

export interface HeaderBag {
  [key: string]: string
}

export interface HttpMessage {
  headers: HeaderBag
  body?: any
}

export interface HttpRequest extends HttpMessage, Endpoint {
  method: string
}

export interface QueryParameterBag {
  [key: string]: string | Array<string> | null
}

export interface Endpoint {
  protocol: string
  hostname: string
  port?: number
  path?: string
  query?: QueryParameterBag
}

export interface RequestToSign {
  url: string
  method: string
  query?: QueryParameterBag
  headers?: HeaderBag
  body?: any
}

export interface CompletedPart {
  ETag: string
  PartNumber: number
}

export interface S3Config {
  region: string
  credentials: Credentials
  endpoint: Endpoint
}
