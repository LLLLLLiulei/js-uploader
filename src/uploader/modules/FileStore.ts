import { ID, UploadFile } from '../../types'

export class FileStore {
  private static store: Map<ID, UploadFile> = new Map()

  private constructor () {}

  static add (file: UploadFile): void {
    if (file) {
      FileStore.store.set(file.id, file)
    }
  }

  static addAll (files: UploadFile[]): void {
    if (files && files.length > 0) {
      files.forEach((f) => FileStore.add(f))
    }
  }

  static remove (): UploadFile | undefined {
    if (this.isEmpty()) {
      return
    }
    const k = FileStore.store.keys()[0]
    const file = FileStore.store.get(k)
    FileStore.store.delete(k)
    return file
  }

  static get (fileID: ID): UploadFile | undefined {
    if (!fileID) {
      return
    }
    return FileStore.store.get(fileID)
  }

  static size () {
    return FileStore.store.size
  }

  static isEmpty () {
    return !FileStore.store.size
  }

  static clear () {
    FileStore.store.clear()
  }
}
