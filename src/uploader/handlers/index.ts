import { from, Observable, of } from 'rxjs'
import { map } from 'rxjs/operators'
import { UploadTask, UploaderOptions, OSSProvider, TPromise } from '../../interface'
import { AwsS3TaskHandler } from './AwsS3TaskHandler'
import { CommonsTaskHandler } from './CommonsTaskHandler'
import { QiniuOSSTaskHandler } from './QiniuOSSTaskHandler'
import { TaskHandler } from './TaskHandler'

function toObserverble<T>(input: TPromise<T>): Observable<T> {
  return input && input instanceof Promise ? from(input) : of(input)
}

export function handle(task: UploadTask, uploaderOptions: UploaderOptions): Observable<TaskHandler> {
  const { ossOptions } = uploaderOptions

  return toObserverble(ossOptions?.enable(task)).pipe(
    map((enable) => {
      if (enable) {
        switch (ossOptions?.provider) {
          case OSSProvider.Qiniu:
            return new QiniuOSSTaskHandler(task, uploaderOptions)
          case OSSProvider.S3:
            return new AwsS3TaskHandler(task, uploaderOptions)
          default:
            throw new Error(`unkown OSSProvider:${ossOptions?.provider}`)
        }
      } else {
        return new CommonsTaskHandler(task, uploaderOptions)
      }
    }),
  )
}

export * from './CommonsTaskHandler'
export * from './TaskHandler'
