export enum EventType {
  FileUploadStart = 'FileUploadStart',
  FileError = 'FileError',
  FileComplete = 'FileComplete',

  TaskAdd = 'TaskAdd',
  TaskRestore = 'TaskRestore',
  TaskPresist = 'TaskPresist',
  TaskUploadStart = 'TaskUploadStart',
  TaskProgress = 'TaskProgress',
  TaskPaused = 'TaskPaused',
  TaskResume = 'TaskResume',
  TaskRetry = 'TaskRetry',
  TaskError = 'TaskError',
  TaskCanceled = 'TaskCanceled',
  TaskComplete = 'TaskComplete',

  Complete = 'Complete',
}

export enum StatusCode {
  Waiting = 'waiting',
  Uploading = 'uploading',
  Pause = 'pause',
  Error = 'error',
  // Success = 'success',
  Complete = 'complete',
}

enum TaskExtraStatus {
  Reading = 'reading',
  Transfer = 'reading',
}

export type ID = string | number

// export type StatusCode = 'waiting' | 'uploading' | 'pause' | 'error' | 'success'

// export type ChunkStatus = StatusCode

// export type FileStatus = StatusCode

// export type TaskStatus = StatusCode | 'reading' | 'transfer' | 'complete'

export type Protocol = 'http:' | 'https:'

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'get' | 'post' | 'put' | 'patch' | 'delete'

export type Domain = string | { http: string; https: string }

export type OSS = 'qiniu'

export type StringKeyObject = { [key: string]: any }

export type FileStatus = StatusCode

export type ChunkStatus = StatusCode

export type TaskStatus = StatusCode | TaskExtraStatus
