import { ChunkStatus, StringKeyObject, StatusCode, ID } from '../../types'
import { idGenerator } from '../../utils'
import { stat } from 'fs'

export class FileChunk {
  id: ID
  start: number
  end: number
  index: number
  data?: Blob
  hash?: string
  uploaded?: number
  size?: number
  progress?: number
  status?: ChunkStatus
  response?: StringKeyObject

  constructor (
    id: ID = 'chunk-' + idGenerator(),
    index: number,
    start: number,
    end: number,
    size?: number,
    status?: ChunkStatus,
  ) {
    this.id = id
    this.index = index
    this.start = start
    this.end = end
    this.size = size || end - start
    this.status = status || StatusCode.Pause
  }
}
