import { delay, retryWhen, scan } from 'rxjs/operators'
import { MonoTypeOperatorFunction } from 'rxjs/internal/types'

export function retryWithDelay<T> (retryCount: number = -1, delayMs: number = 0): MonoTypeOperatorFunction<T> {
  return retryWhen((err$) => {
    return err$.pipe(
      scan((errCount: number, err: Error) => {
        console.log('errCount', errCount)
        if (retryCount > -1 && errCount >= retryCount) {
          throw err
        }
        return errCount + 1
      }, 0),
      delay(delayMs),
    )
  })
}
