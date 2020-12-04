import { scriptString as sparkMD5Factory } from '../shared/sparkMD5Script'
import md5WorkerScript from './md5WorkerScript'

const taskQueue: MD5Task[] = []
const workers: MD5Worker[] = []
const workerURL = URL.createObjectURL(new Blob([`${sparkMD5Factory};${md5WorkerScript}`]))
const maxWorkerNum: number = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency - 0 || 4 : 4
const keepaliveTime: number = 1000 * 60 * 1

interface MD5Task {
  data: Blob | ArrayBuffer
  callback?: (error: Error | null, md5: string) => void
}

class MD5Worker extends Worker {
  private static maxWorkerID: number = 1
  id: string | number
  isBusy: boolean

  constructor (stringUrl: string) {
    super(stringUrl)
    this.id = MD5Worker.maxWorkerID++
    this.isBusy = false
  }

  execute (task: MD5Task): void {
    this.isBusy = true
    const { data, callback } = task
    // transferable
    data instanceof ArrayBuffer ? this.postMessage(data, [data]) : this.postMessage(data)
    const executeMore = () => {
      const task = taskQueue.pop()
      task && this.execute(task)
    }
    const complete = (error: Error | null, md5: string) => {
      typeof callback === 'function' && callback(error, md5)
      executeMore()
      this.isBusy = false
    }
    this.onmessage = (ev: MessageEvent) => {
      complete(null, ev.data)
    }
    this.onerror = (ev: ErrorEvent) => {
      complete(ev.error, '')
    }
  }
}

class MD5WorkerPool {
  public execute (data: Blob | ArrayBuffer): Promise<string>
  public execute (data: Blob | ArrayBuffer, callback: (error: Error | null, md5: string) => void): void
  public execute (
    data: Blob | ArrayBuffer,
    callback?: (error: Error | null, md5: string) => void,
  ): Promise<string> | void {
    let promise: Promise<string> | void
    if (!callback) {
      promise = new Promise((resolve, reject) => {
        callback = (error: Error | null, md5: string) => (error ? reject(error) : resolve(md5))
      })
    }
    let worker = MD5WorkerPool.getWorker()
    let task = { data, callback }
    worker ? worker.execute(task) : taskQueue.push(task)
    return promise
  }

  private static getWorker (): MD5Worker | undefined {
    let worker = workers.find((wk) => !wk.isBusy)
    if (worker) {
      return worker
    }
    if (workers.length < maxWorkerNum) {
      workers.push((worker = new MD5Worker(workerURL)))
    }
    return worker
  }
}

export const md5WorkerPool = new MD5WorkerPool()

// input= document.createElement('input')
// input.type='file'
// input.onchange=function(e){
//     tempFile = e.path[0].files[0]
// }
// input.click()

// console.time('s')
// tempFile.arrayBuffer().then(bf=>{
//     console.warn(bf)
//     md5WorkerPool.execute(bf,(s)=>{
//         console.timeEnd('s')
//         console.log(s)
//     })
// })

// console.time('s')
// md5WorkerPool.execute(tempFile).then(md5=>{
//   console.timeEnd('s')
//   console.log(md5)
// })
