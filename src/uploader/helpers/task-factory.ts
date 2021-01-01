import { idGenerator } from '../../utils/id-generator'
import { StatusCode, UploadFile, UploadTask } from '../../interface'

export const taskFactory = (file: UploadFile, singleFileTask?: boolean): UploadTask => {
  let pos = file.relativePath.indexOf('/')
  let name = singleFileTask || pos === -1 ? file.name : file.relativePath.substring(0, pos)
  const task: UploadTask = {
    id: 'task-' + idGenerator(),
    name,
    type: pos === -1 ? 'file' : 'dir',
    fileIDList: [file.id],
    fileSize: file.size,
    fileList: [file],
    extraInfo: {},
    oss: false,
    progress: 0,
    status: StatusCode.Pause,
    addTime: new Date(),
  }
  return task
}
