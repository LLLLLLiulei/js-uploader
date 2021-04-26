import { IDB } from './IDB'
import { FileChunk, ID, UploadFile, UploadTask } from '../../interface'

class RxIDB extends IDB {
  static readonly dbPrefix = 'js-uploader'
  readonly UploadTask: IDB<ID, UploadTask> = IDB.createInstance<ID, UploadTask>(RxIDB.dbPrefix + '_task')
  readonly UploadFile: IDB<ID, UploadFile> = IDB.createInstance<ID, UploadFile>(RxIDB.dbPrefix + '_file')
  readonly FileChunk: IDB<ID, FileChunk> = IDB.createInstance<ID, FileChunk>(RxIDB.dbPrefix + '_chunk')
  readonly BinaryLike: IDB<ID> = IDB.createInstance<ID>(RxIDB.dbPrefix + '_binary')

  constructor() {
    super(RxIDB.dbPrefix + '_public')
  }
}

// class RxIDB extends IDB {
//   static readonly dbPrefix = 'js-uploader'
//   readonly UploadTask: IDB<ID, UploadTask> = IDB.createInstance<ID, UploadTask>(RxIDB.dbPrefix, 'upload-task')
//   readonly UploadFile: IDB<ID, UploadFile> = IDB.createInstance<ID, UploadFile>(RxIDB.dbPrefix, 'upload-file')
//   readonly FileChunk: IDB<ID, FileChunk> = IDB.createInstance<ID, FileChunk>(RxIDB.dbPrefix, 'file-chunk')
//   readonly BinaryLike: IDB<ID> = IDB.createInstance<ID>(RxIDB.dbPrefix, 'binary')

//   constructor() {
//     super(RxIDB.dbPrefix, 'public')
//   }
// }

export const RxStorage = new RxIDB()

// test
Object.assign(window, { RxStorage, IDB })
