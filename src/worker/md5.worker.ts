import { fromEvent, iif, Subject, of, Observable, Subscriber } from 'rxjs'
import { map, takeUntil, concatMap, tap, filter } from 'rxjs/operators'
import '../global'

interface WorkerMessage {
  action: string
  data?: any
}

const abort$ = new Subject()

fromEvent(self, 'message')
  .pipe(
    map((e) => e as MessageEvent<Blob | ArrayBuffer | WorkerMessage>),
    map((e) => e.data),
    filter((data) => {
      console.log(data)
      let shouldAbort = (<WorkerMessage>data).action === 'abort'
      shouldAbort && abort$.next()
      return !shouldAbort
    }),
    filter((data) => {
      return data instanceof Blob || data instanceof ArrayBuffer
    }),
    map((data) => data as Blob | ArrayBuffer),
    concatMap((data) => {
      return iif(
        () => data instanceof Blob,
        of(data as Blob).pipe(
          concatMap((blob) => {
            return new Observable((subscriber: Subscriber<ArrayBuffer>) => {
              let fileReader = new FileReader()
              fileReader.onerror = () => {
                subscriber.error(new Error())
              }
              fileReader.onload = (e) => {
                subscriber.next(e.target?.result as ArrayBuffer)
                subscriber.complete()
              }
              fileReader.readAsArrayBuffer(blob)
              return () => fileReader.abort()
            })
          }),
        ),
        of(data as ArrayBuffer),
      )
    }),
    concatMap((data) => {
      return new Observable((subscriber: Subscriber<string>) => {
        const spark = new SparkMD5.ArrayBuffer()
        spark.append(data)
        let md5 = spark.end()
        subscriber.next(md5)
        subscriber.complete()
        return () => spark.destroy()
      })
    }),
    tap((md5: string) => {
      self.postMessage(md5)
    }),
    takeUntil(abort$),
  )
  .subscribe()
