import { Uploader } from './uploader'
import { AjaxResponse, BaseParams, EventType, FileChunk, StringKeyObject, UploadFile, UploadTask } from './types'
import * as $ from 'jquery'
import { ajax } from 'rxjs/ajax'
import { Observable } from 'rxjs'

let tokenMap = {}
const uploader = Uploader.create({
  ossOptions: {
    enable: false,
    type: 'qiniu',
    keyGenerator (file: UploadFile) {
      console.log('objectKeyGenerator -> objectKeyGenerator', arguments)
      return tokenMap[file.id].key
    },
    uptokenGenerator (file: UploadFile) {
      console.log('uptokenGenerator -> uptokenGenerator', arguments)
      let url = 'http://saas.test.work.zving.com/server/companys/f05dd7da36ba4e238f9c1f053c2e76e3/oss/client/uptoken'
      let headers = {
        CMPID: 'f05dd7da36ba4e238f9c1f053c2e76e3',
        GUID: '787845727d8345289a9bdc97de6e8556',
        TOKEN:
          'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlY20gY2xpZW50IiwiaXNzIjoienZpbmciLCJjbGFpbURlZmF1bHRLZXkiOiJsaXVsZWkwMSIsImV4cCI6MTYwNTg2ODU1MSwiaWF0IjoxNjA1MjYzNzUxLCJqdGkiOiIzNDBhMGFhMjRiM2Q0YWNhYTZlZGJhYmYyNzFhODU1ZCJ9.Z2er-FrFSU020TgApgtPULzIhamjE1tqin8t4kyN3FA',
      }
      url = `${url}?fileName=${file.name}&fileSize=${file.size}&relativePath=${file.relativePath}`
      let ob$: Observable<{ key: string; token: string }> = ajax.getJSON(url, headers)
      return ob$.toPromise().then((res) => {
        console.log('uptokenGenerator -> res', res)
        tokenMap[file.id] = res
        return res.token
      })
    },
  },
  requestOptions: {
    url: (task: UploadTask, upfile: UploadFile, chunk: FileChunk) => {
      return new Promise((resolve, reject) => {
        console.log('🚀 ~ requestOptions - url ', task, upfile, chunk)
        setTimeout(() => {
          resolve('http://ecm.test.work.zving.com/catalogs/4751/files/upload')
        }, 1000)
      })
      // console.log('🚀 ~ requestOptions - url ', task, upfile, chunk)
      // return 'http://ecm.test.work.zving.com/catalogs/4751/files/upload'
    },
    headers: (task: UploadTask, upfile: UploadFile, chunk: FileChunk) => {
      return new Promise((resolve, reject) => {
        console.log('🚀 ~ requestOptions - headers ', task, upfile, chunk)
        setTimeout(() => {
          resolve({
            CMPID: 'f05dd7da36ba4e238f9c1f053c2e76e3',
            TOKEN:
              'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlY20gY2xpZW50IiwiaXNzIjoienZpbmciLCJjbGFpbURlZmF1bHRLZXkiOiJhZG1pbiIsImV4cCI6MTYwODE4MzcwNywiaWF0IjoxNjA3NTc4OTA3LCJqdGkiOiI2Zjc5YTE2ODg0MzU0MGNhYWMzNzJmOGU0YWU2OGU3ZiJ9.6SfBHOOaLVamguqpZgh2r9Zvd2pR_LqVvqGlOcAdan8',
            GUID: 'b1da407ce0a5408b847f4151d41783ff',
          })
        }, 1000)
      })
      // return {
      //   CMPID: 'f05dd7da36ba4e238f9c1f053c2e76e3',
      //   TOKEN:
      //     'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlY20gY2xpZW50IiwiaXNzIjoienZpbmciLCJjbGFpbURlZmF1bHRLZXkiOiJsaXVsZWkwMSIsImV4cCI6MTYwNzc2NDI3NCwiaWF0IjoxNjA3MTU5NDc0LCJqdGkiOiJkODM5ZmI5YWY5M2M0NzVlODUwODE1YmUxM2M3YzQxOSJ9.G9iSOi6JQRXYQRtXpWuiVF7lfWs6xv7IsZZUDCLb32A',
      //   GUID: 'b1da407ce0a5408b847f4151d41783ff',
      // }
    },
    body: (task: UploadTask, uploadfile: UploadFile, chunk: FileChunk, baseParams: StringKeyObject) => {
      return new Promise((resolve, reject) => {
        console.log('🚀 ~ requestOptions - headers ', task, uploadfile, chunk, baseParams)
        setTimeout(() => {
          resolve(
            Object.assign(baseParams, {
              chunkNumber: baseParams.chunkIndex + 1,
              identifier: uploadfile.id,
              filename: uploadfile.name,
              totalChunks: uploadfile.chunkIDList?.length,
            }),
          )
        }, 1000)
      })

      // return Object.assign(baseParams, {
      //   chunkNumber: baseParams.chunkIndex + 1,
      //   identifier: uploadfile.id,
      //   filename: uploadfile.name,
      //   totalChunks: uploadfile.chunkIDList?.length,
      // })
    },
  },
  singleFileTask: true,
  computeFileHash: true,
  computeChunkHash: true,
  autoUpload: false,
  maxRetryTimes: 3,
  retryInterval: 3000,
  resumable: true,
  chunked: true,
  chunkSize: 4 * 1024 ** 2,
  chunkConcurrency: 2,
  taskConcurrency: 2,
  skipFileWhenUploadError: false,
  skipTaskWhenUploadError: false,
  filePicker: [
    { $el: document.querySelector('#fileInput') as HTMLInputElement, directory: false, multiple: true },
    { $el: document.querySelector('#fileInput1') as HTMLInputElement, directory: true, multiple: true },
  ],
  fileDragger: {
    $el: document.body,
    onDragenter: (e) => {
      // console.log('🚀 ~ onDragenter ~ e', e)
    },
    onDragleave: (e) => {
      // console.log('🚀 ~ onDragleave ~ e', e)
    },
    onDrop: (e) => {
      console.log('🚀 ~ onDrop ~ e', e)
    },
  },
  fileFilter (name, file) {
    console.log('🚀 ~ fileFilter ', arguments)
    return !/\.DS_Store/.test(name)
  },
  readFileFn (task: UploadTask, upfile: UploadFile, start?: number, end?: number) {
    console.log('🚀 ~ readFileFn', arguments)
    return new Promise((resolve, reject) => {
      resolve(upfile.raw!.slice(start, end))
    })
  },
  requestBodyProcessFn (task: UploadTask, upfile: UploadFile, chunk: FileChunk, params: StringKeyObject) {
    return new Promise((resolve) => {
      console.log('🚀 ~ requestBodyProcessFn ', arguments)
      setTimeout(() => {
        const formData = new FormData()
        Object.keys(params).forEach((k) => formData.append(k, params[k]))
        resolve(formData)
      }, 1000)
    })
  },
  beforeFilesAdd (files: File[]) {
    return new Promise((resolve) => {
      console.log('🚀 ~ beforeFilesAdd ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
  filesAdded (files: UploadFile[]) {
    return new Promise((resolve) => {
      console.log('🚀 ~ filesAdded ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
  beforeTasksAdd (tasks: UploadTask[]) {
    return new Promise((resolve) => {
      console.log('🚀 ~ beforeTasksAdd ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
  beforeTaskStart (task: UploadTask) {
    return new Promise((resolve) => {
      console.log('🚀 ~ beforeTaskStart ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
  beforeFileUploadStart (task: UploadTask, file: UploadFile) {
    return new Promise((resolve) => {
      console.log('🚀 ~ beforeFileUploadStart ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
  beforeFileHashCompute (task: UploadTask, file: UploadFile) {
    return new Promise((resolve) => {
      console.log('🚀 ~ beforeFileHashCompute ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
  fileHashComputed (task: UploadTask, file: UploadFile, hash: string) {
    return new Promise((resolve) => {
      console.log('🚀 ~ fileHashComputed ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
  beforeFileRead (task: UploadTask, file: UploadFile, chunk: FileChunk) {
    return new Promise((resolve) => {
      console.log('🚀 ~ beforeFileRead ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
  fileReaded (task: UploadTask, file: UploadFile, chunk: FileChunk, data: Blob) {
    return new Promise((resolve) => {
      console.log('🚀 ~ fileReaded ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
  beforeUploadRequestSend (task: UploadTask, file: UploadFile, chunk: FileChunk, requestParams: StringKeyObject) {
    return new Promise((resolve) => {
      console.log('🚀 ~ beforeUploadRequestSend ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
  beforeUploadResponseProcess (task: UploadTask, file: UploadFile, chunk: FileChunk, response: AjaxResponse) {
    return new Promise((resolve) => {
      console.log('🚀 ~ beforeUploadResponseProcess ', arguments)
      setTimeout(() => {
        resolve('')
      }, 1000)
    })
  },
})

const taskMap = {}
const appendHtml = (task: UploadTask) => {
  taskMap[task.id] = task
  let html = `
    <div id="${task.id}" style="margin:10px;padding:10px;border:1px solid;width;100%">
      <div style="width:100%;display:flex;text-align:center">
        <div style="width:30%;text-align:left">${task.name}</div>
        <div style="width:5%;text-align:left">${task.type}</div>
        <div style="width:10%;text-align:left">${task.filSize}</div>
        <div style="width:10%" class="task-progress">${task.progress}</div>
        <div style="width:10%" class="task-status">${task.status}</div>
        <div style="width:30%">
          <button class="uploadBtn" taskID="${task.id}">upload</button>
          <button class="pauseBtn" taskID="${task.id}">pause</button>
          <button class="resumeBtn" taskID="${task.id}">resume</button>
          <button class="retryBtn" taskID="${task.id}">retry</button>
          <button class="cancelBtn" taskID="${task.id}">cancel</button>
        </div>
      </div>
    </div>
  `

  requestAnimationFrame((_) => {
    $('#task-container').append(html)
    setTimeout(() => {
      $(`#${task.id} .uploadBtn`).on('click', (e: JQuery.ClickEvent) => {
        console.log('🚀 ~ file: test.ts ~ line 175 ~ e', e)
        console.log('🚀 ~ file: test.ts ~ line 175 ~ e', e)
        let taskID = $(e.target).attr('taskID') as string
        let task = taskMap[taskID]
        uploader.upload(task)
      })
      $(`#${task.id}  .pauseBtn`).on('click', (e: JQuery.ClickEvent) => {
        let taskID = $(e.target).attr('taskID') as string
        let task = taskMap[taskID]
        uploader.pause(task)
      })
      $(`#${task.id}  .resumeBtn`).on('click', (e: JQuery.ClickEvent) => {
        let taskID = $(e.target).attr('taskID') as string
        let task = taskMap[taskID]
        uploader.resume(task)
      })
      $(`#${task.id}  .retryBtn`).on('click', (e: JQuery.ClickEvent) => {
        let taskID = $(e.target).attr('taskID') as string
        let task = taskMap[taskID]
        uploader.retry(task)
      })
      $(`#${task.id}  .cancelBtn`).on('click', (e: JQuery.ClickEvent) => {
        let taskID = $(e.target).attr('taskID') as string
        let task = taskMap[taskID]
        uploader.cancel(task)
      })
    })
  })
}
uploader.on(EventType.TaskCreated, appendHtml)
uploader.on(EventType.TaskRestore, appendHtml)

uploader.on(EventType.TaskUploadStart, (task: UploadTask) => {
  $(`#${task.id} .task-status`).html(task.status)
})
uploader.on(EventType.TaskWaiting, (task: UploadTask) => {
  $(`#${task.id} .task-status`).html(task.status)
})
uploader.on(EventType.TaskProgress, (task: UploadTask, file: UploadFile, progress: number) => {
  // console.log('===TaskProgress', progress)
  $(`#${task.id} .task-progress`).html(String(task.progress))
  $(`#${task.id} .task-status`).html(task.status)
})
uploader.on(EventType.TaskComplete, (task: UploadTask) => {
  // console.log('===TaskComplete', task)
  $(`#${task.id} .task-status`).html(task.status)
})
uploader.on(EventType.TaskPause, (task: UploadTask) => {
  // console.log('===TaskPaused', task)
  $(`#${task.id} .task-status`).html(task.status)
})
uploader.on(EventType.TaskCancel, (task: UploadTask) => {
  // console.log('===TaskCanceled', task)
  $(`#${task.id}`).remove()
})
uploader.on(EventType.TaskError, (task: UploadTask) => {
  $(`#${task.id} .task-status`).html(task.status)
})
uploader.on(EventType.Complete, () => {
  // console.warn('Complete--------------------------------------------------------------------')
  // uploader.clear()
})
uploader.on(EventType.FileComplete, (...args) => {
  // console.log('===FileComplete', ...args)
})

setTimeout(() => {
  $('#uploadBtn')?.on('click', () => {
    console.log('begin upload')
    uploader.upload()
  })
  $('#pauseBtn')?.on('click', () => {
    console.log('pause upload')
    uploader.pause()
  })
  $('#resumeBtn')?.on('click', () => {
    console.log('resume upload')
    uploader.resume()
  })
  $('#retryBtn')?.on('click', () => {
    console.log('retry upload')
    uploader.retry()
  })
  $('#cancelBtn')?.on('click', () => {
    console.log('cancel upload')
    uploader.cancel()
  })
})

Object.assign(window, { up: uploader })

Object.values(EventType).forEach((evt) => {
  uploader.on(evt, function () {
    console.warn(evt, arguments)
  })
})
