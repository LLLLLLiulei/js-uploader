import { scriptContent as sparkMD5Factory } from './sparkMD5Script'
import { computeMd5 } from '../utils/compute-md5'
import md5WorkerScript from './md5WorkerScript'
import { Logger } from './Logger'

const taskQueue: Task[] = []
const workers: MD5Worker[] = []
const workerURL = URL.createObjectURL(new Blob([`${sparkMD5Factory};${md5WorkerScript}`]))
const maxWorkerNum: number = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
interface Task {
  data: Blob | ArrayBuffer
  callback?: (error: Error | null, md5: string) => void
  workerID?: string | number
}

class MD5Worker {
  private static maxWorkerID: number = 1
  private worker: Worker
  id: string | number = MD5Worker.maxWorkerID++
  isBusy: boolean = false

  constructor(scriptURL: string) {
    this.worker = new Worker(scriptURL)
  }

  execute(task?: Task): void {
    task = task || taskQueue.pop()
    if (task) {
      this.isBusy = true
      const { data, callback } = task
      task.workerID = this.id
      // transferable
      data instanceof ArrayBuffer ? this.worker.postMessage(data, [data]) : this.worker.postMessage(data)
      const complete = (error: Error | null, md5: string) => {
        typeof callback === 'function' && callback(error, md5)
        taskQueue.length && this.execute(taskQueue.pop()!)
        this.isBusy = false
      }
      this.worker.onmessage = (ev: MessageEvent) => complete(null, ev.data)
      this.worker.onerror = (ev: ErrorEvent) => complete(ev.error, '')
    }
  }

  terminate() {
    this.worker.terminate()
  }

  postMessage(message: any) {
    this.worker.postMessage(message)
  }
}

interface WorkResult {
  promise: Nullable<Promise<string>>
  abort: () => void
}
class MD5WorkerPool {
  public execute(data: Blob | ArrayBuffer): WorkResult
  public execute(data: Blob | ArrayBuffer, callback?: (error: Error | null, md5: string) => void): WorkResult {
    let logid = `computemd5->${data instanceof Blob ? data.size : data.byteLength}`
    console.time(logid)
    let promise: Promise<string> | void = !callback
      ? new Promise((resolve, reject) => {
          callback = (error: Error | null, md5: string) => {
            console.timeEnd(logid)
            error ? reject(error) : resolve(md5)
          }
        })
      : void 0
    const task: Task = { data, callback }
    if (taskQueue.push(task) > maxWorkerNum) {
      // TODO
      promise = computeMd5(data)
    } else {
      MD5WorkerPool.getWorker()?.execute()
    }
    return {
      promise: promise || null,
      abort: () => {
        let index = taskQueue.findIndex((tsk) => tsk === task)
        index !== -1 && taskQueue.splice(index, 1)
        if (task.workerID) {
          let worker = workers.find((w) => w.id === task.workerID)
          if (worker) {
            Logger.warn('abort worker')
            worker.postMessage({ action: 'abort' })
            worker.execute()
          }
        }
      },
    }
  }

  private static getWorker(): Nullable<MD5Worker> {
    let worker = workers.find((wk) => !wk.isBusy)
    if (!worker && workers.length < maxWorkerNum) {
      workers.push((worker = new MD5Worker(workerURL)))
    }
    return worker || null
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
