import { Observable, fromEvent, from } from 'rxjs'
import { tap, mergeMap } from 'rxjs/operators'
import { scheduleWork } from '../../utils'
import { FileDraggerOptions } from '../../interface'
import { Logger } from '../../shared'

export class FileDragger {
  $el: HTMLElement
  file$: Observable<File[]>

  constructor(options: FileDraggerOptions) {
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
    if (dataTransfer.items?.length && typeof dataTransfer.items[0].webkitGetAsEntry === 'function') {
      return webkitGetAsEntryApi(dataTransfer)
    } else {
      return Promise.resolve(Array.from(dataTransfer.files))
    }
  }
}

async function webkitGetAsEntryApi(dataTransfer: DataTransfer): Promise<any[]> {
  const files: any[] = []
  const rootPromises: Promise<any>[] = []

  const createPromiseToAddFileOrParseDirectory = (entry: any) => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(
          (file: any) => {
            file.relativePath = getRelativePath(entry)
            files.push(file)
            resolve(null)
          },
          () => resolve(null),
        )
      } else if (entry.isDirectory) {
        getFilesAndDirectoriesFromDirectory(entry.createReader(), [], (entries: any[]) => {
          const promises = entries.map((entry) => createPromiseToAddFileOrParseDirectory(entry))
          Promise.all(promises).then(() => resolve(null))
        })
      }
    })
  }

  try {
    Array.from(dataTransfer.items).forEach((item: DataTransferItem) => {
      const entry = item.webkitGetAsEntry()
      entry && rootPromises.push(createPromiseToAddFileOrParseDirectory(entry))
    })
    await Promise.all(rootPromises)
  } catch (error) {
    Logger.error(error)
  }
  return files
}

function getRelativePath(fileEntry: any) {
  return String(fileEntry.fullPath || fileEntry.name).replace(/^\//, '')
}

function getFilesAndDirectoriesFromDirectory(directoryReader: any, oldEntries: any[], callback: Function) {
  directoryReader.readEntries(
    (entries: any) => {
      const newEntries = [...oldEntries, ...entries]
      if (entries.length) {
        scheduleWork(() => getFilesAndDirectoriesFromDirectory(directoryReader, newEntries, callback), 500)
      } else {
        callback(newEntries)
      }
    },
    () => callback(oldEntries),
  )
}

type DragEventHandler = (event: DragEvent) => void
