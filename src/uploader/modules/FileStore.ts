import { from } from 'rxjs'
import { map, bufferCount } from 'rxjs/operators'
import { ID, UploadFile } from '../../interface'

export class FileStore {
  private static store: Map<ID, UploadFile> = new Map()

  private constructor() {}

  static add(file: UploadFile): void {
    if (file) {
      FileStore.store.set(file.id, file)
    }
  }

  static addAll(files: UploadFile[]): void {
    if (files?.length > 0) {
      files.forEach((f) => FileStore.add(f))
    }
  }

  static remove(id?: ID): UploadFile | undefined {
    if (this.isEmpty()) {
      return
    }
    const k = id || FileStore.store.keys().next().value
    const file = FileStore.store.get(k)
    FileStore.store.delete(k)
    return file
  }

  static get(fileID: ID): UploadFile | undefined {
    if (!fileID) {
      return
    }
    return FileStore.store.get(fileID)
  }

  static list() {
    return from(FileStore.store)
      .pipe(
        map((item) => item[1]),
        bufferCount(FileStore.store.size),
      )
      .toPromise()
  }

  static size() {
    return FileStore.store.size
  }

  static isEmpty() {
    return !FileStore.store.size
  }

  static clear() {
    FileStore.store.clear()
  }
}
