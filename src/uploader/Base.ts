import { EventEmitter, Storage, FileStore } from './modules'
import { Observable, from, of, Subscriber, Subscription, forkJoin, NEVER } from 'rxjs'
import { concatMap, last, mapTo, mergeMap, takeUntil, tap } from 'rxjs/operators'
import { EventType, FileChunk, ID, MaybePromise, TPromise, UploadFile, UploadTask } from '../interface'
import { Logger } from '../shared'

export default class Base extends EventEmitter {
  protected constructor() {
    super()
  }

  protected toObserverble<T>(input: TPromise<T>): Observable<T> {
    return input && input instanceof Promise ? from(input) : of(input)
  }

  protected createObserverble<T>(input: T | ((...args: any[]) => TPromise<T>), ...args: any[]): Observable<T> {
    return new Observable((ob: Subscriber<T>) => {
      let sub: Subscription
      try {
        let data = typeof input === 'function' ? (<Function>input)(...args) : input
        sub = this.toObserverble(data).subscribe(ob)
      } catch (error) {
        ob.error(error)
      }
      return () => sub?.unsubscribe()
    })
  }

  protected presist(task: UploadTask, file: UploadFile, chunk: FileChunk) {
    task && this.presistTaskOnly(task)
    file && this.presistFileOnly(file)
    chunk && this.presistChunkOnly(chunk)
  }

  protected presistChunkOnly(...chunks: FileChunk[]): Promise<void> {
    const items = chunks.map((chunk: FileChunk) => ({
      key: String(chunk.id),
      value: Object.assign({}, chunk, { data: null }),
    }))
    return Storage.FileChunk.setItems(items)
  }

  protected presistFileOnly(...files: UploadFile[]): Promise<void> {
    const items = files.map((file: UploadFile) => ({
      key: String(file.id),
      value: Object.assign({}, file, { raw: null, chunkList: null }),
    }))
    return Storage.UploadFile.setItems(items)
  }

  protected presistTaskOnly(...tasks: UploadTask[]): Promise<void> {
    const items = tasks.map((task: UploadTask) => ({
      key: String(task.id),
      value: Object.assign({}, task, { fileList: null }),
    }))
    return Storage.UploadTask.setItems(items)
  }

  protected presistUploadFile(file: UploadFile | undefined): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!file) {
        return reject('no file!')
      }

      const promise: Promise<any> = file.raw ? this.presistBlob(String(file.id), file.raw) : Promise.resolve()
      promise
        .then(() => {
          Logger.warn(`save file ${file.name}`)
          const upfile = file.raw ? Object.assign({}, file, { raw: null }) : file
          Storage.UploadFile.setItem(String(file.id), upfile).then(resolve).catch(reject)
        })
        .catch(reject)
    })
  }

  protected presistBlob(key: string, blob: Blob): Promise<Blob> {
    return Storage.BinaryLike.setItem(key, blob)
  }

  protected presistTask(tasks: UploadTask[], nofication$?: Observable<any>): Observable<UploadTask[]> {
    Logger.info('Uploader -> presistTask -> tasks', tasks)
    const tryTakeUntil = () => takeUntil(nofication$ || NEVER)
    const job$ = tasks.map((task) => {
      const uptask: UploadTask = Object.assign({}, task, { fileList: [] })
      return from(task.fileIDList).pipe(
        mergeMap((id) => from(this.presistUploadFile(FileStore.get(id)))),
        last(),
        concatMap(() => from(Storage.UploadTask.setItem(String(uptask.id), uptask))),
        tap(() => {
          this.emit(EventType.TaskPresist, task)
        }),
        tryTakeUntil(),
      )
    })
    return forkJoin(job$).pipe(mapTo(tasks))
  }

  protected removeChunkFromStroage(...chunks: FileChunk[] | ID[]) {
    if (chunks && chunks.length) {
      if (typeof chunks[0] === 'object') {
        Storage.FileChunk.removeItems((<FileChunk[]>chunks).map((i) => String(i.id)))
      } else {
        Storage.FileChunk.removeItems((<ID[]>chunks).map((i) => String(i)))
      }
    }
  }

  protected removeFileFromStroage(...files: UploadFile[] | ID[]) {
    if (files && files.length) {
      files.forEach((file: UploadFile | ID) => {
        let fileID: ID = typeof file === 'object' ? file.id : file
        Storage.UploadFile.removeItem(String(fileID)).then(() => {
          Storage.BinaryLike.removeItem(String(fileID))
          if (typeof file === 'object') {
            file = file as UploadFile
            file.chunkIDList && this.removeChunkFromStroage(...file.chunkIDList)
          } else {
            Storage.FileChunk.keysStartingWith(String(fileID)).then((ids) => {
              this.removeChunkFromStroage(...ids)
            })
          }
        })
      })
    }
  }

  protected removeTaskFromStroage(...tasks: UploadTask[]) {
    if (tasks && tasks.length) {
      tasks.forEach((task) =>
        Storage.UploadTask.removeItem(String(task.id)).then(() => {
          task.fileIDList && this.removeFileFromStroage(...task.fileIDList)
        }),
      )
    }
  }

  protected clearStorage(): Promise<unknown> {
    return Promise.all([Storage.BinaryLike.clear(), Storage.UploadFile.clear(), Storage.UploadTask.clear()])
  }

  protected hookWrap<T extends MaybePromise, V = any>(fn: T, promiseValue?: V): Promise<any> {
    return (fn as any) || Promise.resolve(promiseValue)
  }
}
