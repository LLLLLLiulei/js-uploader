import { idGenerator } from '../../utils/id-generator'
import { StatusCode, UploadFile, UploadTask } from '../../types'

export const taskFactory = (file: UploadFile): UploadTask => {
  let pos = file.relativePath.indexOf('/')
  let name = pos === -1 ? file.name : file.relativePath.substring(0, pos)
  const task: UploadTask = {
    id: 'task-' + idGenerator(),
    name,
    type: pos === -1 ? 'file' : 'dir',
    fileIDList: [file.id],
    fileList: [file],
    extraInfo: {},
    oss: undefined,
    progress: 0,
    status: StatusCode.Pause,
    addTime: new Date(),
  }
  return task
}
