import { scriptContent as sparkMD5Factory } from '../shared/sparkMD5Script'
import { computeMd5 } from '../utils/compute-md5'
import md5WorkerScript from './md5WorkerScript'

const taskQueue: Task[] = []
const workers: MD5Worker[] = []
const workerURL = URL.createObjectURL(new Blob([`${sparkMD5Factory};${md5WorkerScript}`]))
const maxWorkerNum: number = 1 || typeof navigator !== 'undefined' ? navigator.hardwareConcurrency - 0 || 4 : 4
const keepaliveTime: number = 1000 * 60 * 1 // TODO
interface Task {
  data: Blob | ArrayBuffer
  callback?: (error: Error | null, md5: string) => void
  workerID?: string | number
}

class MD5Worker extends Worker {
  private static maxWorkerID: number = 1
  id: string | number = MD5Worker.maxWorkerID++
  isBusy: boolean = false

  constructor (stringUrl: string) {
    super(stringUrl)
  }

  execute (task?: Task): void {
    task = task || taskQueue.pop()
    if (task) {
      this.isBusy = true
      const { data, callback } = task
      task.workerID = this.id
      // transferable
      data instanceof ArrayBuffer ? this.postMessage(data, [data]) : this.postMessage(data)
      const complete = (error: Error | null, md5: string) => {
        typeof callback === 'function' && callback(error, md5)
        taskQueue.length && this.execute(taskQueue.pop()!)
        this.isBusy = false
      }
      this.onmessage = (ev: MessageEvent) => complete(null, ev.data)
      this.onerror = (ev: ErrorEvent) => complete(ev.error, '')
    }
  }
}

interface WorkResult {
  promise: Nullable<Promise<string>>
  cancel: () => void
}
class MD5WorkerPool {
  public execute (data: Blob | ArrayBuffer): WorkResult
  public execute (data: Blob | ArrayBuffer, callback?: (error: Error | null, md5: string) => void): WorkResult {
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
      cancel: () => {
        let index = taskQueue.findIndex((tsk) => tsk === task)
        index !== -1 && taskQueue.splice(index, 1)
        if (task.workerID) {
          index = workers.findIndex((w) => w.id === task.workerID)
          index !== -1 && workers.splice(index, 1)[0].terminate()
        }
        MD5WorkerPool.getWorker()?.execute()
      },
    }
  }

  private static getWorker (): Nullable<MD5Worker> {
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
