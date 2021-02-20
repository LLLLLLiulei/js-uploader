import { UploadTask, UploaderOptions, OSSProvider } from '../../interface'
import { AwsS3TaskHandler } from './AwsS3TaskHandler'
import { CommonsTaskHandler } from './CommonsTaskHandler'
import { QiniuOSSTaskHandler } from './QiniuOSSTaskHandler'
import { TaskHandler } from './TaskHandler'

export function handle(task: UploadTask, uploaderOptions: UploaderOptions): TaskHandler {
  console.log('🚀 ~ file: index.ts ~ line 7 ~ handle ~ task', task)
  const { ossOptions } = uploaderOptions
  if (ossOptions?.enable) {
    switch (ossOptions?.provider) {
      case OSSProvider.Qiniu:
        return new QiniuOSSTaskHandler(task, uploaderOptions)
      case OSSProvider.S3:
        return new AwsS3TaskHandler(task, uploaderOptions)
      default:
        throw new Error(`unkown OSSProvider:${ossOptions.provider}`)
    }
  } else {
    return new CommonsTaskHandler(task, uploaderOptions)
  }
}

export * from './CommonsTaskHandler'
export * from './TaskHandler'
