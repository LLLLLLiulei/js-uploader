interface MessageData {
  action: string
}

declare function postMessage(data: any, transferables?: Transferable[]): void

const $this = self

let shouldAbort: boolean = false

self.onmessage = (e: MessageEvent) => {
  console.log(e)
  let data = e.data
  if (!data) {
    return
  }
  shouldAbort = data.action == 'abort'
  if (shouldAbort) {
    return
  }

  console.time('computehash-worker')

  let file = data
  let currentChunk = 0
  let blobSlice = File.prototype.slice
  let chunkSize = 4194304 // Read in chunks of 4MB
  let isArrayBuffer = file instanceof ArrayBuffer
  let fileSize = !isArrayBuffer ? file.size : file.byteLength
  let chunks = Math.ceil(fileSize / chunkSize)
  let fileReader: Nullable<FileReader> = null
  let spark = new SparkMD5.ArrayBuffer()
  let calc = (data: ArrayBuffer) => {
    console.log('read chunk nr', currentChunk + 1, 'of', chunks)
    spark.append(data)
    currentChunk++
    if (currentChunk < chunks) {
      loadNext()
    } else {
      console.log('finished loading')
      let md5 = spark.end()
      console.info('computed hash', md5)
      $this.postMessage(md5)
      console.timeEnd('computehash-worker')
    }
  }
  if (!isArrayBuffer) {
    fileReader = new FileReader()
    fileReader.onload = function (e) {
      calc(e.target?.result as ArrayBuffer)
    }
    fileReader.onerror = function (e) {
      console.warn('oops, something went wrong.', e)
    }
  }
  const checkAbort = () => {
    if (shouldAbort) {
      fileReader?.abort()
      spark.destroy()
      fileReader = spark = data = file = null as any
      return true
    }
    return false
  }
  const loadNext = () => {
    if (checkAbort()) {
      return
    }
    let start = currentChunk * chunkSize
    let end = start + chunkSize >= fileSize ? fileSize : start + chunkSize
    if (isArrayBuffer) {
      calc(file.slice(start, end))
    } else {
      fileReader?.readAsArrayBuffer(blobSlice.call(file, start, end))
    }
  }
  loadNext()
}
