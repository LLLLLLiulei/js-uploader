import { UploadTask } from '../modules/UploadTask'
import { CommonsTaskHandler } from './CommonsTaskHandler'
import { QiniuOSSTaskHandler } from './QiniuOSSTaskHandler'
import TaskHandler from './TaskHandler'
import { UploaderOptions } from '../Uploader'

export function handle (task: UploadTask, uploaderOptions: UploaderOptions): TaskHandler {
  let handler: TaskHandler
  if (!uploaderOptions?.ossOptions?.enable) {
    handler = new CommonsTaskHandler(task, uploaderOptions)
  } else {
    switch (uploaderOptions.ossOptions.type) {
      case 'qiniu':
        handler = new QiniuOSSTaskHandler(task, uploaderOptions)
        break
      default:
        handler = new QiniuOSSTaskHandler(task, uploaderOptions)
        break
    }
  }

  // handler.on(EventType.TaskPaused, (...args) => {
  //   console.warn(EventType.TaskPaused, args)
  // })
  // handler.on(EventType.TaskRetry, (...args) => {
  //   console.warn(EventType.TaskRetry, args)
  // })
  // handler.on(EventType.TaskCanceled, (...args) => {
  //   console.warn(EventType.TaskCanceled, args)
  // })
  // handler.on(EventType.TaskError, (...args) => {
  //   console.warn(EventType.TaskError, args)
  // })
  // handler.on(EventType.TaskComplete, (...args) => {
  //   console.warn(EventType.TaskComplete, args)
  // })
  // handler.on(EventType.FileComplete, (...args) => {
  //   console.warn(EventType.FileComplete, args)
  // })
  // handler.on(EventType.FileError, (...args) => {
  //   console.warn(EventType.FileError, args)
  // })

  // handler.on(EventType.TaskProgress, (...args) => {
  //   console.warn(EventType.TaskProgress, args)
  // })
  // handler.on(EventType.TaskUploadStart, (...args) => {
  //   console.warn(EventType.TaskUploadStart, args)
  // })
  // handler.on(EventType.FileUploadStart, (...args) => {
  //   console.warn(EventType.FileUploadStart, args)
  // })

  return handler
}
