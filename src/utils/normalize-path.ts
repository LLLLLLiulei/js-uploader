export const normalizePath = (path = '') => {
  return path.replace(/\\/g, '/').replace(/[/\/]+/g, '/')
}
