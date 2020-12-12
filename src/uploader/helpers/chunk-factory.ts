import { FileChunk, ID, StatusCode } from '../../types'

export const chunkFactory = (id: ID, index: number, start: number, end: number, size: number): FileChunk => {
  const chunk: FileChunk = {
    id,
    start,
    end,
    index,
    data: null,
    hash: '',
    uploaded: 0,
    size: size || end - start,
    progress: 0,
    status: StatusCode.Pause,
    response: {},
    extraInfo: {},
  }
  return chunk
}
