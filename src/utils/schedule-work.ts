import { Logger } from '../shared/Logger'

export const scheduleWork = (callback: (...args: any[]) => void, timeout?: number): void => {
  if (typeof callback !== 'function') {
    return
  }
  if ('requestIdleCallback' in window) {
    Logger.warn('scheduleWork : use requestIdleCallback!')
    window.requestIdleCallback((idle) => callback(() => idle.timeRemaining()), { timeout })
  } else if ('requestAnimationFrame' in window) {
    Logger.warn('scheduleWork : use requestAnimationFrame!')
    window.requestAnimationFrame(() => callback())
  } else {
    Logger.warn('scheduleWork : use setTimeout!')
    window.setTimeout(() => callback())
  }
}
