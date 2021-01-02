# js-uploader

js-uploader是一个简单易用的浏览器端文件上传库，支持文件拖拽、文件分块上传、md5计算、暂停/继续、错误重试（延迟重试）、进度展示、上传任务持久化（重启浏览器后可继续上传）等特性。



## 安装

``` bash
npm install js-uploader
```


## 使用

- ###  初始化Uploader
Uploader支持的配置项请查看API文档

```js
import { Uploader } from 'js-uploader'

const uploader = Uploader.create({
  requestOptions: {
    url: 'http://test.com/upload', //上传地址
    headers: {  //http请求headers
      Auth:'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9'
    }
  },
  filePicker: [ //文件选择器
    { $el: document.querySelector('#fileSelector'), directory: false, multiple: true }
  ]
})
```

- ### 获取用户选择
监听任务创建事件：task-created，可获取到用户选择文件后创建的上传任务：UploadTask，一个上传任务可能包含多个文件（用户选择文件夹上传时）

```js
uploader.on('task-created', (task: UploadTask) => {
  console.log(`名称：${task.name}`, `文件大小：${task.filSize}`, `状态：${task.status}`)
})
```

- ### 开始上传
调用upload方法开始执行所有上传任务，也可传入UploadTask对象执行指定任务

```js
uploader.upload() // or uploader.upload(uploadTask)
```

- ### 暂停/继续/出错重试
可传入UploadTask对象，指定对应的上传任务

```js
uploader.pause()    //暂停上传 or uploader.pause(uploadTask) 
uploader.resume()   //继续上传 or uploader.resume(uploadTask)
uploader.retry()    //重试 or uploader.retry(uploadTask) 
```
 

- ### 获取上传任务进度
监听任务进度事件：task-progress，可获取当前执行的上传任务、对应的UploadFile以及任务进度信息

```js
uploader.on('task-progress', (task: UploadTask, file: UploadFile, progress: number) => {
  console.log(`当前上传任务：${task.name}`)
  console.log(`当前上传文件：${file.name}`)
  console.log(`任务进度：${progress}`)
})
```
 

- ### 处理任务失败/成功
监听任务错误事件：task-error，可获取到对应的出错的任务以及错误信息。
监听任务完成事件：task-complete，可获取到对应的上传完成的任务


```js
uploader.on('task-error', (task: UploadTask, err: Error) => {
  console.log(`任务出错：${task.name}`)
  console.error(err)
})

uploader.on('task-complete', (task: UploadTask) => {
  console.log(`任务完成：${task.name}`)
})
```



## 文档

### Uploader

```js
Uploader.create(options:UploaderOptions) 
```

#### 配置参数 (UploaderOptions)

- ##### ++requestOptions++ [Object] [必填] 请求配置
    - ###### ++url++ [String|Function] [必填] 
    - ###### ++headers++ [Object|Function] [可选] 
    - ###### ++body++ [Object|Function] [可选] 
    - ###### ++timeout++ [number] [可选] 
    - ###### ++withCredentials++ [boolean] [可选] 

- ##### ++singleFileTask++ [boolean] [可选] [默认值:false] 是否单文件任务
- ##### ++computeFileHash++ [boolean] [可选] [默认值:false] 是否计算文件hash(md5)
- ##### ++computeChunkHash++ [boolean] [可选] [默认值:false] 是否计算每个分片hash(md5)
- ##### ++autoUpload++ [boolean] [可选] [默认值:false]  选择文件后是否自动上传
- ##### ++maxRetryTimes++ [number] [可选] [默认值:3]    错误时最大重试次数
- ##### ++retryInterval++ [number] [可选] [默认值:3000]    重试间隔(单位:ms)
- ##### ++resumable++ [boolean] [可选] [默认值:false]   是否保存任务便于断点续传
- ##### ++chunked++ [boolean] [可选] [默认值:false] 是否分片上传
- ##### ++chunkSize++ [number] [可选] [默认值:4 * 1024 * 1024]  分片大小(单位:字节)
- ##### ++chunkConcurrency++ [number] [可选] [默认值:1] 单文件分块并发数，一个文件可同时上传的分块数
- ##### ++taskConcurrency++ [number] [可选] [默认值:1]  任务并发数，可同时上传的任务数
- ##### ++skipFileWhenUploadError++ [boolean] [可选] [默认值:false] 任务中单个文件上传错误是否跳过该文件
- ##### ++skipTaskWhenUploadError++ [boolean] [可选] [默认值:false] 上传过程中任务出错是否跳过该任务
- ##### ++filePicker++ [FilePickerOptions | Array<FilePickerOptions>] [可选] [默认值:null]  文件选择器
    - FilePickerOptions
        - FilePickerOptions

- ##### ++fileDragger++ [FileDraggerOptions | Array<FileDraggerOptions>] [可选] [默认值:null] 文件拖拽器
    - FileDraggerOptions
        - FileDraggerOptions

- ##### ++fileFilter++ [RegExp|Function] [可选] [默认值:null]   文件过滤器,可为正则或者方法((fileName: string, file: File) => boolean),为方法时将传入文件名称和File对象
- ##### ++readFileFn++ [Function] [可选] [默认值:Blob.slice]    读取文件的方法(task: UploadTask, upfile: UploadFile, start?: number, end?: number) => Blob｜Promise<Blob> 
- ##### ++requestBodyProcessFn++ [Function] [可选] [默认值:] 处理requestBody的方法(task: UploadTask, upfile: UploadFile, chunk: FileChunk, params: Obj) => TPromise<any>
- ##### ++beforeFilesAdd++ [Function] [可选] [默认值:]    文件添加前（选择文件后）(files: File[]) => MaybePromise
- ##### ++filesAdded++ [Function] [可选] [默认值:]  文件添加后(files: UploadFile[]) => MaybePromise
- ##### ++beforeTasksAdd++ [Function] [可选] [默认值:]  任务添加前(tasks: UploadTask[]) => MaybePromise
- ##### ++beforeTaskStart++ [Function] [可选] [默认值:] 任务开始前(task: UploadTask) => MaybePromise
- ##### ++beforeFileUploadStart++ [Function] [可选] [默认值:]   文件开始上传前(task: UploadTask, file: UploadFile) => MaybePromise
- ##### ++beforeFileHashCompute++ [Function] [可选] [默认值:]   文件hash计算前（如需计算hash）(task: UploadTask, file: UploadFile) => MaybePromise
- ##### ++fileHashComputed++  [Function] [可选] [默认值:]    hash计算后(task: UploadTask, file: UploadFile, hash: string) => MaybePromise
- ##### ++beforeFileRead++  [Function] [可选] [默认值:]  文件读取前（分片读取(task: UploadTask, file: UploadFile, chunk: FileChunk) => MaybePromise
- ##### ++fileReaded++  [Function] [可选] [默认值:]文件读取后(task: UploadTask, file: UploadFile, chunk: FileChunk, data: Blob) => MaybePromise
- ##### ++beforeUploadRequestSend++ [Function] [可选] [默认值:]   上传请求发送前(task: UploadTask, file: UploadFile, chunk: FileChunk, requestParams: Obj) => MaybePromise
- ##### ++beforeUploadResponseProcess++  [Function] [可选] [默认值:] 处理上传请求响应前(task: UploadTask,file: UploadFile,chunk: FileChunk,response: AjaxResponse,) => MaybePromise

#### 方法
- ##### ++upload++  开始上传
- ##### ++pause++   暂停
- ##### ++resume++  恢复上传
- ##### ++retry++   错误重试
- ##### ++cancel++  取消/删除任务
- ##### ++clear++   清空所有上传任务
- ##### ++isUploading++ 是否正在上传
- ##### ++isComplete++  是否全部完成
- ##### ++hasError++    是否存在错误
- ##### ++getErrorTasks++   获取上传出错的任务

#### 事件
- ##### ++file-upload-start++   文件开始上传
- ##### ++file-error++  文件上传出错
- ##### ++file-complete++   文件上传完成
- ##### ++chunk-upload-start++  分块开始上传
- ##### ++chunk-error++ 分块上传错误
- ##### ++chunk-complete++  分块上传完成
- ##### ++task-created++    任务创建
- ##### ++task-update++ 任务更新（增加了新文件等）
- ##### ++task-restore++     任务恢复
- ##### ++task-presist++    任务持久化
- ##### ++task-waiting++    任务进入等待队列
- ##### ++task-upload-start++ 任务开始上传
- ##### ++task-progress++   任务进度
- ##### ++task-pause++  任务暂停上传
- ##### ++task-resume++ 任务继续上传
- ##### ++task-retry++  任务重试
- ##### ++task-error++  任务上传出错
- ##### ++task-cancel++ 任务取消
- ##### ++task-complete++   任务完成
- ##### ++complete++    所有任务完成


### UploadTask

### UploadFile

### FileChunk


......