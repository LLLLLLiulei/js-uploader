import { EventEmitter, Storage, FileStore } from './modules'
import {
  Observable,
  from,
  of,
  Subscriber,
  Subscription,
  forkJoin,
  NEVER,
  scheduled,
  asapScheduler,
  asyncScheduler,
  concat,
  merge,
} from 'rxjs'
import {
  bufferCount,
  concatMap,
  last,
  mapTo,
  mergeMap,
  takeUntil,
  tap,
  map,
  combineAll,
  filter,
  reduce,
  concatAll,
  mergeAll,
  switchMap,
  buffer,
} from 'rxjs/operators'
import { EventType, FileChunk, ID, MaybePromise, TPromise, UploadFile, UploadTask } from '../interface'
import { Logger } from '../shared'
import { isElectron } from '../utils'

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
    const items = chunks?.map((chunk: FileChunk) => ({
      key: String(chunk.id),
      value: Object.assign({}, chunk, { data: null }),
    }))
    if (items?.length > 1000) {
      return from(items)
        .pipe(
          bufferCount(1000),
          concatMap((values) => Storage.FileChunk.setItems(values)),
        )
        .toPromise()
    }
    return Storage.FileChunk.setItems(items)
  }

  protected presistFileOnly(...files: UploadFile[]): Promise<void> {
    const items = files?.map((file: UploadFile) => ({
      key: String(file.id),
      value: Object.assign({}, file, { raw: null, chunkList: null }),
    }))
    if (items?.length > 1000) {
      return from(items)
        .pipe(
          bufferCount(1000),
          concatMap((values) => Storage.UploadFile.setItems(values)),
        )
        .toPromise()
    }
    return Storage.UploadFile.setItems(items)
  }

  protected presistTaskOnly(...tasks: UploadTask[]): Promise<void> {
    const items = tasks?.map((task: UploadTask) => ({
      key: String(task.id),
      value: Object.assign({}, task, { fileList: null }),
    }))
    if (items?.length > 1000) {
      return from(items)
        .pipe(
          bufferCount(1000),
          concatMap((values) => Storage.UploadTask.setItems(values)),
        )
        .toPromise()
    }
    return Storage.UploadTask.setItems(items)
  }

  protected presistUploadFile(file: UploadFile | undefined): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!file) {
        return reject('no file!')
      }
      const promise: Promise<any> =
        isElectron() && file.raw ? this.presistBlob(String(file.id), file.raw) : Promise.resolve()
      promise
        .then(() => {
          Logger.warn(`save file ${file.name}`)
          const upfile = file.raw instanceof Blob ? Object.assign({}, file, { raw: null }) : file
          Storage.UploadFile.setItem(String(file.id), upfile).then(resolve).catch(reject)
        })
        .catch(reject)
    })
  }

  protected presistBlob(key: string, blob: Blob): Promise<Blob> {
    return Storage.BinaryLike.setItem(key, blob)
  }

  protected presistTaskWithoutBlob(tasks: UploadTask[], nofication$?: Observable<any>): Observable<UploadTask[]> {
    Logger.info('Uploader -> presistTask -> tasks', tasks)
    const tryTakeUntil = () => takeUntil(nofication$ || NEVER)

    const job$ = tasks.map((task) => {
      const uptask: UploadTask = Object.assign({}, task, { fileList: [] })

      return from(task.fileIDList).pipe(
        map((id) => FileStore.get(id)!),
        filter((file) => !!file),
        map((file) => {
          const upfile = file.raw instanceof Blob ? Object.assign({}, file, { raw: null }) : file
          let value: KeyValuePair = {
            key: String(upfile.id),
            value: upfile,
          }
          return value
        }),
        // reduce((arr: KeyValuePair[], val: KeyValuePair) => {
        //   arr.push(val)
        //   return arr
        // }, []),
        bufferCount(1000),
        concatMap((values) => from(Storage.UploadFile.setItems(values))),
        concatMap(() => from(Storage.UploadTask.setItem(String(uptask.id), uptask))),
        last(),
        tap(() => {
          this.emit(EventType.TaskPresist, task)
        }),
        tryTakeUntil(),
      )
    })
    return forkJoin(job$).pipe(mapTo(tasks))
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

  protected async removeChunkFromStroage(...chunks: FileChunk[] | ID[]) {
    if (chunks?.length) {
      if (typeof chunks[0] === 'object') {
        await Storage.FileChunk.removeItems((<FileChunk[]>chunks).map((i) => String(i.id)))
        console.log('Storage.FileChunk.removeItems')
      } else {
        await Storage.FileChunk.removeItems((<ID[]>chunks).map((i) => String(i)))
        console.log('Storage.FileChunk.removeItems')
      }
    }
  }

  protected removeFileFromFileStore(...fileIDs: ID[]) {
    fileIDs?.forEach((id) => FileStore.remove(id))
  }

  protected removeFileFromStroage(...files: UploadFile[] | ID[]) {
    if (!files?.length) {
      return Promise.resolve()
    }
    const isFile = typeof files[0] === 'object'
    const ids: string[] = isFile ? (<UploadFile[]>files).map((i) => String(i.id)) : (<ID[]>files).map((i) => String(i))
    this.removeFileFromFileStore(...ids)

    return of(ids)
      .pipe(
        concatMap(() => from(Storage.UploadFile.removeItems(ids))),
        tap(() => {
          console.log('Storage.UploadFile.removeItems', ids)
        }),
        concatMap(() => from(Storage.BinaryLike.removeItems(ids))),
        tap(() => {
          console.log('Storage.BinaryLike.removeItems', ids)
        }),
        concatMap(() =>
          from(ids).pipe(
            mergeMap((id: string) => from(Storage.FileChunk.keysStartingWith(id))),
            reduce((arr: string[], val: string[]) => arr.concat(val), []),
            tap((val) => {
              console.log('Storage.FileChunk.keysStartingWith', val)
            }),
            switchMap((chunkIds: string[]) => from(this.removeChunkFromStroage(...chunkIds))),
          ),
        ),
      )
      .toPromise()
  }

  protected async removeTaskFromStroage(...tasks: UploadTask[]) {
    if (!tasks?.length) {
      return
    }
    const ids = tasks.map((i) => String(i.id))
    const fileIDs = tasks.reduce((res: ID[], cur) => res.concat(cur.fileIDList), [])
    await from(Storage.UploadTask.removeItems(ids))
      .pipe(
        tap(() => {
          console.log('Storage.UploadTask.removeItems', ids)
        }),
        switchMap(() => from(this.removeFileFromStroage(...fileIDs))),
      )
      .toPromise()
  }

  protected clearStorage(): Promise<unknown> {
    return Promise.all([Storage.BinaryLike.clear(), Storage.UploadFile.clear(), Storage.UploadTask.clear()])
  }

  protected hookWrap<T extends MaybePromise, V = any>(fn: T, promiseValue?: V): Promise<any> {
    return (fn as any) || Promise.resolve(promiseValue)
  }
}
