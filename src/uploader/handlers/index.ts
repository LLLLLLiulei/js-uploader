import { UploadTask, UploaderOptions } from '../../interface'
import { CommonsTaskHandler } from './CommonsTaskHandler'
import { TaskHandler } from './TaskHandler'

export function handle (task: UploadTask, uploaderOptions: UploaderOptions): TaskHandler {
  return new CommonsTaskHandler(task, uploaderOptions)
}

export * from './CommonsTaskHandler'
export * from './TaskHandler'
