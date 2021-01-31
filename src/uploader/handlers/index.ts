import { UploadTask, UploaderOptions, OSSType } from '../../interface'
import { CommonsTaskHandler } from './CommonsTaskHandler'
import { QiniuOSSTaskHandler } from './QiniuOSSTaskHandler'
import { TaskHandler } from './TaskHandler'

export function handle(task: UploadTask, uploaderOptions: UploaderOptions): TaskHandler {
  const { ossOptions } = uploaderOptions
  if (ossOptions?.enable) {
    switch (ossOptions.type) {
      case OSSType.Qiniu:
        return new QiniuOSSTaskHandler(task, uploaderOptions)
      default:
        return new CommonsTaskHandler(task, uploaderOptions)
    }
  } else {
    return new CommonsTaskHandler(task, uploaderOptions)
  }
}

export * from './CommonsTaskHandler'
export * from './TaskHandler'
