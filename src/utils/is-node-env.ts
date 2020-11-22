export const isNodeEnv: boolean = typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]'
