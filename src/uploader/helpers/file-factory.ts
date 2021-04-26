import { idGenerator, normalizePath } from '../../utils'
import { FileStore } from '../modules'
import { StatusCode, UploadFile } from '../../interface'

interface WebkitFile {
  relativePath?: string
  webkitRelativePath?: string
}

export const fileFactory = (file: File & WebkitFile): UploadFile => {
  const uploadFile: UploadFile = {
    id: 'file-' + idGenerator(),
    hash: '',
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    raw: file instanceof Blob ? file : null,
    // raw: file instanceof Blob ? file.slice(0, file.size, file.type) : null,
    // raw: null,
    path: file['path'] || '',
    relativePath: normalizePath(file.relativePath || file.webkitRelativePath || file.name),

    uploaded: 0,
    chunkIDList: [],
    chunkList: [],
    progress: 0,
    status: StatusCode.Pause,
    response: {},
    extraInfo: {},
  }
  FileStore.add(uploadFile)
  return uploadFile
}
