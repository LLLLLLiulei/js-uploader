interface IdleDeadline {
  readonly didTimeout: boolean
  readonly timeRemaining: () => number
}
declare interface Window {
  requestIdleCallback: (cb: (idleDeadline: IdleDeadline) => void, options?: { timeout?: number }) => number
  cancelIdleCallback: (handle: number) => void
  SparkMD5: SparkMD5
}

declare type Nullable<T> = T | null
