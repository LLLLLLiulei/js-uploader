import { Observable, fromEvent, from } from 'rxjs'
import { tap, mergeMap } from 'rxjs/operators'
import { FileDraggerOptions } from '../../interface'

export class FileDragger {
  $el: HTMLElement
  file$: Observable<File[]>

  constructor (options: FileDraggerOptions) {
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

  private parseDataTransfer (e: DragEvent): Promise<File[]> {
    const dataTransfer = e.dataTransfer
    if (!dataTransfer) {
      return Promise.resolve([])
    }
    if (
      dataTransfer.items &&
      dataTransfer.items.length &&
      typeof dataTransfer.items[0].webkitGetAsEntry === 'function'
    ) {
      return this.parseWebkitDataTransfer(dataTransfer, e)
    } else {
      return Promise.resolve(Array.from(dataTransfer.files))
    }
  }

  private parseWebkitDataTransfer (dataTransfer: DataTransfer, _e: DragEvent): Promise<File[]> {
    const files: File[] = []

    const read = (reader: any): Promise<any> => {
      return new Promise((resolve, reject) => {
        reader.readEntries((entries: any) => {
          const promises: Promise<any>[] = entries.map((entry: any) => {
            if (entry.isFile) {
              return new Promise((resolve, reject) => {
                let fullPath = entry.fullPath
                entry.file((file: File) => {
                  file && files.push(Object.assign(file, { relativePath: String(fullPath).replace(/^\//, '') }))
                  resolve(file)
                }, reject)
              })
            } else {
              return read(entry.createReader())
            }
          })
          Promise.all(promises)
            .then(resolve)
            .catch(reject)
        }, reject)
      })
    }

    const promises: Promise<unknown>[] = []
    for (let i = 0; i < dataTransfer.items.length; i++) {
      let item = dataTransfer.items[i]
      let entry = item.webkitGetAsEntry()
      if (!entry) {
        continue
      }
      if (entry.isFile) {
        let file = item.getAsFile()
        file && files.push(Object.assign(file, { relativePath: String(entry.fullPath).replace(/^\//, '') }))
      } else {
        promises.push(read(entry.createReader()))
      }
    }

    return new Promise((resolve, reject) => {
      Promise.all(promises)
        .then(() => resolve(files))
        .catch(reject)
    })
  }
}

type DragEventHandler = (event: DragEvent) => void
