import { empty } from 'rxjs'
import { Subject } from 'rxjs'
import { from } from 'rxjs'
import { repeatWhen } from 'rxjs/operators'
import { retryWhen } from 'rxjs/operators'

let subject = new Subject()
let ob = from([1, 2, 3, 4, 5, 6, 7, 8]).pipe(
  retryWhen(() => subject),
  repeatWhen(() => subject),
)

ob.subscribe(console.log, console.error, () => console.warn('complete'))
