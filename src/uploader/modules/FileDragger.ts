import { Observable, fromEvent, from, scheduled, asyncScheduler } from 'rxjs'
import { tap, mergeMap, concatMap, map, mergeAll } from 'rxjs/operators'
import { FileDraggerOptions, TPromise, UploaderOptions } from '../../interface'
import { Logger } from '../../shared'
import { getType as getMimeType } from 'mime'
import { basename, relative, join, dirname } from 'path'
import { isElectron } from '../..'

export class FileDragger {
  $el: HTMLElement
  file$: Observable<File[]>

  constructor(options: FileDraggerOptions, private uploadOptions?: UploaderOptions) {
    const { $el, onDragover, onDragenter, onDragleave, onDrop } = options
    if (!$el) {
      throw new Error()
    }
    this.$el = $el
    const wrap = (_e: DragEvent, fn?: DragEventHandler): DragEventHandler => (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      fn?.(e)
    }
    this.$el.addEventListener('dragover', (e: DragEvent) => wrap(e, onDragover)(e))
    this.$el.addEventListener('dragenter', (e: DragEvent) => wrap(e, onDragenter)(e))
    this.$el.addEventListener('dragleave', (e: DragEvent) => wrap(e, onDragleave)(e))
    this.$el.addEventListener('drop', (e: DragEvent) => wrap(e, onDrop)(e))
    this.file$ = fromEvent(this.$el, 'drop').pipe(
      tap((e) => {
        e.stopPropagation()
        e.preventDefault()
      }),
      mergeMap((e) => from(this.parseDataTransfer(e as DragEvent))),
    )
  }

  private parseDataTransfer(e: DragEvent): Promise<File[]> {
    const dataTransfer = e.dataTransfer
    if (!dataTransfer) {
      return Promise.resolve([])
    }
    Logger.info('parseDataTransfer', dataTransfer.files.length, dataTransfer.items.length)
    const fileStat = this.uploadOptions?.fileStatFn
    const readdir = this.uploadOptions?.readdirFn
    if (isElectron() && typeof fileStat === 'function' && typeof readdir === 'function') {
      return parseFilesByPath(dataTransfer, fileStat, readdir)
    }
    if (dataTransfer.items?.length && typeof dataTransfer.items[0].webkitGetAsEntry === 'function') {
      return webkitGetAsEntryApi(dataTransfer)
    } else {
      return Promise.resolve(Array.from(dataTransfer.files))
    }
  }
}

export async function parseFilesByPath(
  dataTransfer: DataTransfer,
  fileStat: NonNullable<UploaderOptions['fileStatFn']>,
  readdir: NonNullable<UploaderOptions['readdirFn']>,
): Promise<File[]> {
  console.time('parseFilesByPath')
  const list: File[] = []
  let rootDir: string = ''
  const loop = async (filePath: string): Promise<void> => {
    if (!filePath) {
      return
    }
    let stat = null
    try {
      stat = await toPromise(fileStat(filePath))
    } catch (error) {
      Logger.warn(filePath + ' not exists')
    }
    if (stat?.isFile()) {
      let name = basename(filePath)
      const file = {
        lastModified: stat.mtimeMs,
        name,
        size: stat.size,
        type: getMimeType(filePath),
        path: filePath,
        relativePath: rootDir ? relative(rootDir, filePath) : name,
      }
      list.push((file as unknown) as File)
    } else if (stat?.isDirectory()) {
      const children = await toPromise(readdir(filePath))
      await scheduled(children || [], asyncScheduler)
        .pipe(concatMap((name) => from(loop(join(filePath, name)))))
        .toPromise()

      //   let promises = (await toPromise(readdir(filePath))).map((name) => loop(join(filePath, name)))
      //   await Promise.all(promises)
    }
  }

  await Promise.all(
    Array.from(dataTransfer.files).map(async (file: any) => {
      rootDir = dirname(file.path)
      return await loop(file.path)
    }),
  )
  console.timeEnd('parseFilesByPath')
  return list
}

// function toObserverble<T>(input: TPromise<T>): Observable<T> {
//   return input && input instanceof Promise ? from(input) : of(input)
// }

function toPromise<T>(input: TPromise<T>): Promise<T> {
  return input && input instanceof Promise ? input : Promise.resolve(input)
}

async function webkitGetAsEntryApi(dataTransfer: DataTransfer): Promise<any[]> {
  console.time('webkitGetAsEntryApi')
  const files: any[] = []
  const promises: Promise<any>[] = []
  const createPromiseToAddFileOrParseDirectory = (entry: any) => {
    return new Promise<void>(async (resolve) => {
      if (entry.isFile) {
        entry.file(
          (file: any) => {
            file.relativePath = getRelativePath(entry)
            files.push(file)
            resolve()
          },
          () => resolve(),
        )
      } else if (entry.isDirectory) {
        let entries = await parseDir(entry.createReader(), [])
        scheduled(entries || [], asyncScheduler)
          .pipe(map(createPromiseToAddFileOrParseDirectory), mergeAll())
          .subscribe({
            complete: resolve,
          })
      }
    })
  }

  try {
    Array.from(dataTransfer.items).forEach((item: DataTransferItem) => {
      const entry = item.webkitGetAsEntry()
      entry && promises.push(createPromiseToAddFileOrParseDirectory(entry))
    })
    await Promise.all(promises)
  } catch (error) {
    Logger.error(error)
  }
  console.timeEnd('webkitGetAsEntryApi')
  return files
}

function getRelativePath(fileEntry: any) {
  let p = (fileEntry.fullPath || fileEntry.name) as string
  return p.startsWith('/') ? p.substr(1) : p
  //   return String(fileEntry.fullPath || fileEntry.name).replace(/^\//, '')
}

function parseDir(directoryReader: any, oldEntries: any[]) {
  return new Promise<any[]>((resolve) => getFilesAndDirectoriesFromDirectory(directoryReader, oldEntries, resolve))
}

function getFilesAndDirectoriesFromDirectory(directoryReader: any, oldEntries: any[], callback: Function) {
  directoryReader.readEntries(
    (entries: any[]) => {
      const newEntries = [...oldEntries, ...entries]
      if (entries?.length) {
        setTimeout(() => getFilesAndDirectoriesFromDirectory(directoryReader, newEntries, callback))
      } else {
        callback(newEntries)
      }
    },
    () => callback(oldEntries),
  )
}

type DragEventHandler = (event: DragEvent) => void
