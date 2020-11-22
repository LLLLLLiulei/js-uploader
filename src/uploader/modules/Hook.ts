type MaybePromise = Promise<unknown> | void | undefined

export class Hook {
  beforeFileAdd (): MaybePromise {}
  afterFileAdd (): MaybePromise {}

  beforeTaskAdd (): MaybePromise {}
  afterTaskAdd (): MaybePromise {}

  beforeTaskStart (): MaybePromise {}
  afterTaskStart (): MaybePromise {}

  beforeTaskPresist (): MaybePromise {}
  afterTaskPresist (): MaybePromise {}

  beforeTaskPause (): MaybePromise {}
  afterTaskPause (): MaybePromise {}

  beforeTaskResume (): MaybePromise {}
  afterTaskResume (): MaybePromise {}

  beforeTaskRetry (): MaybePromise {}
  afterTaskRetry (): MaybePromise {}

  beforeTaskCancel (): MaybePromise {}
  afterTaskCancel (): MaybePromise {}

  beforeTaskComplete (): MaybePromise {}
  afterTaskComplete (): MaybePromise {}

  beforeFileRead (): MaybePromise {}
  afterFileRead (): MaybePromise {}

  beforeFileUpload (): MaybePromise {}
  afterFileUpload (): MaybePromise {}

  beforeFileComplete (): MaybePromise {}
  afterFileComplete (): MaybePromise {}

  beforeChunkUpload (): MaybePromise {}
  afterChunkUpload (): MaybePromise {}
}
