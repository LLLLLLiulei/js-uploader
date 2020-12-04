export default `
(function () {
  var $this
  try {
    $this = window
  } catch (e) {
    $this = self
  }
  var spark = new $this.SparkMD5.ArrayBuffer()
  console.log($this, $this.SparkMD5)
  $this.onmessage = function (e) {
    console.log(e)
    var data = e.data
    if (!data) {
      return
    }
    console.time('computehash')
    var file = data
    var currentChunk = 0
    var blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice
    var chunkSize = 4194304 // Read in chunks of 4MB
    var isArrayBuffer = file instanceof ArrayBuffer
    var fileSize = !isArrayBuffer ? file.size : file.byteLength
    var chunks = Math.ceil(fileSize / chunkSize)
    var fileReader
    var calc = function (data) {
      console.log('read chunk nr', currentChunk + 1, 'of', chunks)
      spark.append(data)
      currentChunk++
      if (currentChunk < chunks) {
        loadNext()
      } else {
        console.log('finished loading')
        var md5 = spark.end()
        console.info('computed hash', md5)
        $this.postMessage(md5)
        console.timeEnd('computehash')
      }
    }
    if (!isArrayBuffer) {
      fileReader = new FileReader()
      fileReader.onload = function (e) {
        calc(e.target.result)
      }
      fileReader.onerror = function (e) {
        console.warn('oops, something went wrong.', e)
      }
    }
    var loadNext = function () {
      var start = currentChunk * chunkSize
      var end = start + chunkSize >= fileSize ? fileSize : start + chunkSize
      if (isArrayBuffer) {
        calc(file.slice(start, end))
      } else {
        fileReader.readAsArrayBuffer(blobSlice.call(file, start, end))
      }
    }
    loadNext()
  }
})()
`
