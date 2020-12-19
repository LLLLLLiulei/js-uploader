import { Logger } from '../shared/Logger'

export const scheduleWork = (callback: Function): void => {
  if ('requestIdleCallback' in window) {
    Logger.warn('scheduleWork : use requestIdleCallback!')
    window.requestIdleCallback((idle) => callback?.(() => idle.timeRemaining()), { timeout: 1000 })
  } else {
    Logger.warn('scheduleWork : use requestAnimationFrame!')
    window.requestAnimationFrame(() => callback?.())
  }
}
