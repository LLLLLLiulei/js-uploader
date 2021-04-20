import { delay, retryWhen, scan } from 'rxjs/operators'
import type { MonoTypeOperatorFunction } from 'rxjs/internal/types'

export function retryWithDelay<T>(retryCount: number = -1, delayMs: number = 0): MonoTypeOperatorFunction<T> {
  return retryWhen((err$) =>
    err$.pipe(
      scan((errCount: number, err: Error) => {
        if (retryCount > -1 && errCount >= retryCount) {
          throw err
        }
        return errCount + 1
      }, 0),
      delay(delayMs),
    ),
  )
}
