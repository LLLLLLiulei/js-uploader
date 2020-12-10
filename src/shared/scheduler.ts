export type ITaskCallback = ((time: boolean) => boolean) | null

export interface ITask {
  callback?: ITaskCallback
  time: number
}

let deadline: number = 0
const macroTask: ITask[] = []
const threshold: number = 1000 / 60
const callbacks: Function[] = []
const getTime = () => performance.now()

export const schedule = (cb: Function) => callbacks.push(cb) === 1 && postMessage()

const postMessage = (() => {
  const cb = () => callbacks.splice(0, callbacks.length).forEach((c) => c())
  if (typeof MessageChannel !== 'undefined') {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = cb
    return () => port2.postMessage(null)
  }
  return () => setTimeout(cb)
})()

export const scheduleWork = (callback: ITaskCallback): void => {
  if ('requestIdleCallback' in window) {
    console.warn('use requestIdleCallback!')
    window.requestIdleCallback((idle) => callback?.(idle.didTimeout), { timeout: 3000 })
    return
  }

  const currentTime = getTime()
  const newTask = { callback, time: currentTime + 3000 }
  macroTask.push(newTask)
  schedule(flushWork)
}

const flushWork = (): void => {
  const currentTime = getTime()
  deadline = currentTime + threshold
  flush(currentTime) && schedule(flushWork)
}

const flush = (initTime: number): boolean => {
  let currentTime = initTime
  let currentTask = peek(macroTask)

  while (currentTask) {
    const timeout = currentTask.time <= currentTime
    if (!timeout && shouldYield()) {
      break
    }

    const callback = currentTask.callback
    currentTask.callback = null

    const next = callback?.(timeout)
    next ? (currentTask.callback = next as any) : macroTask.shift()

    currentTask = peek(macroTask)
    currentTime = getTime()
  }
  return !!currentTask
}

const peek = (queue: ITask[]) => {
  return queue.sort((a, b) => a.time - b.time)[0]
}

export const shouldYield = (): boolean => {
  return getTime() >= deadline
}
