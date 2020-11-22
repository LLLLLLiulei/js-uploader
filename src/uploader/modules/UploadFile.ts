import { ID, FileStatus, StringKeyObject, StatusCode } from '../../types'
import { FileChunk } from './'

export class UploadFile {
  id: ID = ''
  hash?: string
  name: string = ''
  type: string = ''
  size: number = 0
  relativePath: string = ''
  path?: string = ''
  lastModified: number = 0
  raw?: File | Blob

  uploaded?: number
  chunkIDList?: ID[]
  chunkList?: FileChunk[]
  progress?: number
  status?: FileStatus = StatusCode.Pause
  response?: StringKeyObject
  extraInfo?: StringKeyObject
}
