import { fromEvent, Observable } from 'rxjs'
import { filter, map, tap } from 'rxjs/operators'
import { FilePickerOptions } from '../../interface'
import { Logger } from '../../shared/Logger'

export class FilePicker {
  $el: HTMLInputElement
  file$: Observable<File[]>

  constructor (opts: FilePickerOptions) {
    const { $el, multiple, directory, accept } = opts
    if (!$el) {
      throw new Error()
    }
    this.$el = $el instanceof HTMLInputElement ? $el : this.createInput(opts)
    this.setInputAttr(multiple, directory, accept)
    this.file$ = fromEvent(this.$el, 'change').pipe(
      filter(() => this.$el.files != null && this.$el.files.length > 0),
      map(() => Array.from(this.$el.files as FileList)),
      tap((files: File[]) => {
        this.$el.value = ''
        Logger.info('FilePicker -> constructor -> files', files)
      }),
    )
  }
  private createInput (opts: FilePickerOptions): HTMLInputElement {
    let id: string = opts.$el as string
    const $input = document.createElement('input')
    $input.id = id
    $input.setAttribute('type', 'file')
    Object.assign($input.style, {
      visibility: 'hidden',
      position: 'absolute',
      width: '1px',
      height: '1px',
    })
    document.body.append($input)
    return $input
  }

  private setInputAttr (multiple?: boolean, directory?: boolean, accept: string[] = []) {
    this.$el.setAttribute('type', 'file')
    multiple && this.$el.setAttribute('multiple', 'multiple')
    directory && this.$el.setAttribute('webkitdirectory', 'webkitdirectory')
    accept?.length && this.$el.setAttribute('accept', accept.join())
  }
}
