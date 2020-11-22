import { UploadFile } from '../modules'
import { idGenerator } from '../../utils'
import { FileStore } from '../modules/FileStore'
import * as mime from 'mime'
import * as fs from 'fs'
import * as path from 'path'
import { normalizePath } from '../../utils/normalize-path'

function listFilesPath (pPath: string): string[] {
  let fileList: string[] = []
  const getFile = (p: string) => {
    let files = fs.readdirSync(p)
    files.forEach((item) => {
      let fPath = path.join(p, item)
      let stat = fs.statSync(fPath)
      stat.isDirectory() ? getFile(fPath) : fileList.push(fPath)
    })
  }
  fs.statSync(pPath).isDirectory() && getFile(pPath)
  return fileList
}

function listFiles (p: string): UploadFile[] {
  let subFilesPath = listFilesPath(p)
  let fileList: UploadFile[] = []
  subFilesPath.forEach((f) => {
    let file = newFile(f, p)
    if (file) {
      fileList.push(file)
    }
  })
  return fileList
}

function newFile (filePath: string, parentPath?: string): UploadFile | undefined {
  if (!filePath) {
    return
  }
  filePath = normalizePath(filePath)
  parentPath = parentPath ? normalizePath(parentPath) : parentPath
  let stat = fs.statSync(filePath)
  const uploadFile = new UploadFile()
  uploadFile.id = 'file-' + idGenerator()
  uploadFile.name = path.basename(filePath)
  uploadFile.type = mime.getType(filePath) || 'application/octet-stream'
  uploadFile.size = stat.size
  uploadFile.relativePath = parentPath ? path.relative(path.normalize(parentPath + '/..'), filePath) : uploadFile.name
  uploadFile.path = filePath
  uploadFile.lastModified = stat.mtime.getTime()
  return uploadFile
}

export const fileFactory = (fpath: unknown): UploadFile[] => {
  if (!fpath) {
    throw new Error('filePath is null')
  }
  const filePath = fpath as string
  const fileList = []
  let stat = fs.statSync(filePath)
  if (stat.isDirectory()) {
    let list = listFiles(filePath)
    fileList.push(...list)
  } else {
    let uploadFile = newFile(filePath)
    if (uploadFile) {
      fileList.push(uploadFile)
    }
  }
  FileStore.addAll(fileList)
  return fileList
}
