import { ID, OSS, TaskStatus, StringKeyObject, StatusCode } from '../../types'
import { UploadFile } from './UploadFile'
import { idGenerator } from '../../utils'

export class UploadTask {
  id: ID
  name: string
  fileIDList: ID[] = []
  fileList?: UploadFile[]
  extraInfo?: StringKeyObject
  oss?: OSS
  progress: number = 0
  status: TaskStatus = StatusCode.Pause
  addTime: Date

  constructor (file: UploadFile) {
    this.id = 'task-' + idGenerator()
    let pos = file.relativePath.indexOf('/')
    this.name = pos === -1 ? file.name : file.relativePath.substring(0, pos)
    this.fileIDList.push(file.id)
    this.addTime = new Date()
  }
}
