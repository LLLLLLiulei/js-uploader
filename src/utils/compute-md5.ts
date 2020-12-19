import { scheduleWork } from './schedule-work'

export const computeMd5 = (file: Blob | ArrayBuffer): Promise<string> => {
  return new Promise((resolve) => {
    const spark = new SparkMD5.ArrayBuffer()
    let currentChunk = 0
    const chunkSize: number = 1024 ** 2 * 4
    const fileSize: number = file instanceof ArrayBuffer ? file.byteLength : file.size
    const chunks: number = Math.ceil(fileSize / chunkSize)

    const append = (data: ArrayBuffer | Blob, start: number, end: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        console.log('read chunk nr', currentChunk + 1, 'of', chunks)
        if (data instanceof ArrayBuffer) {
          spark.append(data.slice(start, end))
          resolve()
        } else {
          const fileReader: FileReader = new FileReader()
          fileReader.onload = (e: ProgressEvent<FileReader>) => {
            spark.append(e.target?.result as ArrayBuffer)
            resolve()
          }
          fileReader.onerror = (e: ProgressEvent<FileReader>) => {
            console.warn('oops, something went wrong.', e)
            reject(e)
          }
        }
      })
    }

    const loadNext = async (timeRemaining?: () => number) => {
      while (currentChunk < chunks) {
        let start = currentChunk * chunkSize
        let end = start + chunkSize >= fileSize ? fileSize : start + chunkSize
        await append(file, start, end)
        currentChunk++
        if (!timeRemaining || !timeRemaining?.()) {
          break
        }
      }
      if (currentChunk < chunks) {
        scheduleWork(loadNext)
      } else {
        let md5 = spark.end()
        console.info('computed hash', md5)
        resolve(md5)
      }
    }

    return loadNext()
  })
}
