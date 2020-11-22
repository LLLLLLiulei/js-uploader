import { UploadFile } from '../../modules'
import { idGenerator } from '../../../utils'
import { FileStore } from '../../modules/FileStore'
import { normalizePath } from '../../../utils/normalize-path'

export const fileFactory = (f: File | string): UploadFile[] => {
  if (typeof f === 'string') {
    return []
  }
  const file = f as File
  const uploadFile = new UploadFile()
  uploadFile.id = 'file-' + idGenerator()
  uploadFile.name = file.name
  uploadFile.size = file.size
  uploadFile.type = file.type
  uploadFile.lastModified = file.lastModified
  uploadFile.raw = file.slice(0, file.size, file.type)
  uploadFile.path = file['path']
  uploadFile.relativePath = normalizePath(file['relativePath'] || file['webkitRelativePath'] || file['name'])
  FileStore.add(uploadFile)
  return [uploadFile]
}
