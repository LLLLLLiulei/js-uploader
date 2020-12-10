export const scheduleWork = (callback: Function): void => {
  if ('requestIdleCallback' in window) {
    console.warn('scheduleWork : use requestIdleCallback!')
    window.requestIdleCallback((idle) => callback?.(idle.timeRemaining), { timeout: 1000 })
  } else {
    console.warn('scheduleWork : use requestAnimationFrame!')
    window.requestAnimationFrame(() => callback?.())
  }
}
