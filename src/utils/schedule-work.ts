import { Logger } from '../shared/Logger'

export const scheduleWork = (callback: (...args: any[]) => void, timeout?: number): void => {
  if (typeof callback !== 'function') {
    return
  }
  if ('requestIdleCallback' in window) {
    Logger.warn('scheduleWork : use requestIdleCallback!')
    window.requestIdleCallback((idle) => callback(() => idle.timeRemaining()), { timeout: timeout ?? 1000 })
  } else {
    Logger.warn('scheduleWork : use requestAnimationFrame!')
    window.requestAnimationFrame(() => callback())
  }
}
