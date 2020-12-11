export const computeMd5 = (data: Blob | ArrayBuffer): Promise<string> => {
  return new Promise((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer()
    const file = data
    let currentChunk = 0
    const chunkSize: number = 1024 ** 2 * 4
    const fileSize: number = file instanceof ArrayBuffer ? file.byteLength : file.size
    const chunks: number = Math.ceil(fileSize / chunkSize)
    let fileReader: Nullable<FileReader>
    if (file instanceof Blob) {
      fileReader = new FileReader()
      fileReader.onload = (e: ProgressEvent<FileReader>) => {
        calc(e.target?.result as ArrayBuffer)
      }
      fileReader.onerror = (e: ProgressEvent<FileReader>) => {
        console.warn('oops, something went wrong.', e)
        reject(e)
      }
    }
    const calc = (data: ArrayBuffer) => {
      console.log('main read chunk nr', currentChunk + 1, 'of', chunks)
      spark.append(data)
      currentChunk++
      if (currentChunk < chunks) {
        requestAnimationFrame(() => loadNext())
      } else {
        let md5 = spark.end()
        console.info('computed hash', md5)
        resolve(md5)
      }
    }
    const loadNext = () => {
      let start = currentChunk * chunkSize
      let end = start + chunkSize >= fileSize ? fileSize : start + chunkSize
      if (file instanceof ArrayBuffer) {
        calc(file.slice(start, end))
      } else {
        fileReader?.readAsArrayBuffer(file.slice(start, end))
      }
    }
  })
}
