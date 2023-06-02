export interface WorkerMessage {
  topic: string
  callbackTopic?: string
  data?: unknown
}

declare function postMessage(data: WorkerMessage | Transferable, transferables?: Transferable[]): void

export class WorkerMessageListener {
  readonly once: boolean
  readonly callback: Function
  constructor(callback: Function, once = false) {
    this.once = once
    this.callback = callback
  }
}

const listenersMap = new Map<string, WorkerMessageListener[]>()

export const workerMessageHandler = (e: MessageEvent<WorkerMessage>) => {
  console.log('🚀 ~ file: helper.ts ~ line 34 ~ workerMessageHandler ~ e', e)
  let { topic, data } = e.data
  const rawListeners = listenersMap.get(topic)
  const listeners = rawListeners?.length ? [...rawListeners] : []
  listeners?.forEach((listener) => {
    if (listener.once) {
      let index = rawListeners?.indexOf(listener) as number
      index > -1 && rawListeners?.splice(index, 1)
    }
    try {
      listener.callback?.(data)
    } catch (error) {}
  })
}

export const onMessage = (topic: string, callback: Function) => {
  const listeners = listenersMap.get(topic) || []
  listeners.push(new WorkerMessageListener(callback))
  listenersMap.set(topic, listeners)
}

export const onceMessage = (topic: string, callback: Function) => {
  const listeners = listenersMap.get(topic) || []
  listeners.push(new WorkerMessageListener(callback, true))
  listenersMap.set(topic, listeners)
}

export const sendMessage = (topic: string, data: unknown) => postMessage({ topic, data })

const getTimeoutTimer = (timeout: number, callback?: Function) => {
  return setTimeout(() => callback?.(), timeout)
}

export function sendMessageForResult<R extends any = any>(
  message: Required<WorkerMessage>,
  timeout = 30000,
): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    const timer = getTimeoutTimer(timeout, reject)
    postMessage(message)
    onceMessage(message.callbackTopic, (data: R) => {
      resolve(data)
      clearTimeout(timer)
    })
  })
}
