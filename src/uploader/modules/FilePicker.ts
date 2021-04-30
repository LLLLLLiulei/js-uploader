import { from, fromEvent, Observable } from 'rxjs'
import { delayWhen, filter, map, tap } from 'rxjs/operators'
import { FilePickerOptions } from '../../interface'
import { Logger } from '../../shared'
export class FilePicker {
  $el: HTMLInputElement
  file$: Observable<File[]>

  constructor(opts: FilePickerOptions) {
    const { $el, multiple, directory, accept } = opts
    if (!$el) {
      throw new Error()
    }
    this.$el = $el instanceof HTMLInputElement ? $el : this.createInput(opts)

    // const reduceFile = () =>
    //   scheduled(this.$el.files as FileList, asapScheduler)
    //     .pipe(
    //       reduce((acc: File[], val) => {
    //         acc.push(val)
    //         return acc
    //       }, []),
    //     )
    //     .toPromise()

    this.setInputAttr(multiple, directory, accept)

    this.file$ = fromEvent(this.$el, 'change').pipe(
      tap((e: Event) => {
        console.log(e)
      }),
      delayWhen(() => from(new Promise(setTimeout as any))),
      filter(() => !!this.$el.files?.length),
      //   mergeMap(() => from(reduceFile())),
      map(() => Array.from(this.$el.files as FileList)),
      tap((files: File[]) => {
        this.$el.value = ''
        Logger.info('FilePicker -> constructor -> files', files)
      }),
    )
  }
  private createInput(opts: FilePickerOptions): HTMLInputElement {
    let $input: Nullable<HTMLInputElement> = document.querySelector(opts.$el as string) || null
    if (!$input) {
      let id: string = String(opts.$el).replace(/^[#.]*/, '')
      $input = document.createElement('input')
      $input.id = id
      Object.assign($input.style, {
        visibility: 'hidden',
        position: 'absolute',
        width: '1px',
        height: '1px',
        top: '-1px',
        left: '-1px',
      })
      document.body.append($input)
    }
    $input.setAttribute('type', 'file')
    return $input
  }

  private setInputAttr(multiple?: boolean, directory?: boolean, accept: string[] = []) {
    this.$el.setAttribute('type', 'file')
    multiple && this.$el.setAttribute('multiple', 'multiple')
    directory && this.$el.setAttribute('webkitdirectory', 'webkitdirectory')
    accept?.length && this.$el.setAttribute('accept', accept.join())
  }
}
