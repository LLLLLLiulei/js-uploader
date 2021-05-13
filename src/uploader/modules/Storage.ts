import { IDB } from './IDB'
import { FileChunk, ID, UploadFile, UploadTask } from '../../interface'

class RxIDB extends IDB {
  static readonly dbPrefix = 'js-uploader'
  readonly UploadTask: IDB<ID, UploadTask>
  readonly UploadFile: IDB<ID, UploadFile>
  readonly FileChunk: IDB<ID, FileChunk>
  readonly BinaryLike: IDB<ID>

  constructor(id?: ID) {
    const prefix = id ? `${RxIDB.dbPrefix}_${id}` : RxIDB.dbPrefix
    super(prefix + '_public')

    this.UploadTask = IDB.createInstance<ID, UploadTask>(prefix + '_task')
    this.UploadFile = IDB.createInstance<ID, UploadFile>(prefix + '_file')
    this.FileChunk = IDB.createInstance<ID, FileChunk>(prefix + '_chunk')
    this.BinaryLike = IDB.createInstance<ID>(prefix + '_binary')
  }
}

const storageMap = new Map<ID, RxIDB>()

const RxStorage = new RxIDB()

export const getStorage = (id?: ID) => {
  if (!id) {
    return RxStorage
  }
  if (storageMap.has(id)) {
    return storageMap.get(id)!
  }
  let storage = new RxIDB(id)
  storageMap.set(id, storage)
  return storage
}
