import { idGenerator } from '../../utils/id-generator'
import { FileStore } from '../modules/FileStore'
import { normalizePath } from '../../utils/normalize-path'
import { StatusCode, UploadFile } from '../../types'

export const fileFactory = (file: File): UploadFile => {
  const uploadFile: UploadFile = {
    id: 'file-' + idGenerator(),
    hash: '',
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    raw: file.slice(0, file.size, file.type),
    path: file['path'] || '',
    relativePath: normalizePath(file['relativePath'] || file['webkitRelativePath'] || file['name']),

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
