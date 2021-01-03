
一个使用TypeScript和RxJS实现的浏览器端文件上传库，支持文件拖拽、文件分块上传、md5计算、暂停/继续、错误重试（延迟重试）、进度展示、上传任务持久化（重启浏览器后可继续上传）等特性。

demo：https://github.com/LLLLLLiulei/uploader-demo.git

![image](https://github.com/LLLLLLiulei/js-uploader/blob/main/assets/img/demo.gif?raw=true)


 

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

- ##### requestOptions [Object] [必填] 请求配置
    - ###### url [String|Function] [必填]    上传接口地址，字符串或返回字符串的方法，配置为方法时将传入当前上传任务task、当前上传文件uploadFile、当前分块chunk，方法需返回一个string或Promise<string>
    - ###### headers [Object|Function] [可选]  [默认值:{}]   请求头，json对象或返回json对象的方法，默认值：配置为方法时将传入当前上传任务task、当前上传文件uploadFile、当前分块chunk，方法需返回一个json对象或Promise<Object>
    - ###### body [Object|Function] [可选]  [默认值:RequestBaseParams]  json对象或返回json对象的方法，配置为方法时将传入当前上传任务task、当前上传文件uploadFile、当前分块chunk，方法需返回一个对象或Promise<Object>
    - ###### timeout [number] [可选] [默认值:0] 请求超时时间，单位:ms
    - ###### withCredentials [boolean] [可选] [默认值:false] 是否携带cookie

- ##### singleFileTask [boolean] [可选] [默认值:false] 是否单文件任务；为true时，用户选择一个文件夹后，该文件夹下的每个文件将创建一个独立的上传任务；为false时，整个文件夹将只创建一个上传任务。
- ##### computeFileHash [boolean] [可选] [默认值:false] 是否计算文件hash(md5)；为true时，在文件上传前将计算文件hash并在上传参数中携带文件hash值。
- ##### computeChunkHash [boolean] [可选] [默认值:false] 是否计算每个分片hash(md5)；为true时，在每个分块上传前将计算分块hash并在上传参数中携带分块hash值。
- ##### autoUpload [boolean] [可选] [默认值:false]  选择文件后是否自动上传；为true时，用户选择文件后将自动开始上传。
- ##### maxRetryTimes [number] [可选] [默认值:3]    任务错误时最大重试次数
- ##### retryInterval [number] [可选] [默认值:5000]    重试间隔(单位:ms)；每次重试的时间间隔。
- ##### resumable [boolean] [可选] [默认值:false]   是否保存任务便于断点续传；为true时，将保存任务信息以及文件二进制数据到浏览器的IndexedDB中，在Uploader对象创建后将自动恢复上传任务。
- ##### chunked [boolean] [可选] [默认值:false] 是否开启分片上传
- ##### chunkSize [number] [可选] [默认值:4 * 1024 * 1024]  分片大小(单位:字节)
- ##### chunkConcurrency [number] [可选] [默认值:1] 单文件分块并发数，一个文件可同时上传的分块数
- ##### taskConcurrency [number] [可选] [默认值:1]  任务并发数，可同时上传的任务数
- ##### skipFileWhenUploadError [boolean] [可选] [默认值:false] 任务中单个文件上传错误是否跳过该文件；为true时将跳过错误的文件，为false时将中止该任务的上传
- ##### skipTaskWhenUploadError [boolean] [可选] [默认值:false] 上传过程中任务出错是否跳过该任务；为true时将跳过错误的任务，为false时将中止所有上传
- ##### filePicker [FilePickerOptions | Array<FilePickerOptions>] [可选] [默认值:null]  文件选择器
    - FilePickerOptions
        - $el [HTMLInputElement | string] input元素或input元素的查询选择器，用于选择文件
        - multiple [boolean] 是否多选，仅适用于选择文件
        - directory [boolean] 是否选择文件夹
        - accept[string[]] input原生属性    

- ##### fileDragger [FileDraggerOptions | Array<FileDraggerOptions>] [可选] [默认值:null] 文件拖放器
    - FileDraggerOptions
        - $el [HTMLElement] html元素，可用于拖放文件的区域
        - onDragover [Function] dragover事件
        - onDragenter [Function] dragenter事件
        - onDragleave [Function] dragleave事件
        - onDrop [Function] drop事件

- ##### fileFilter [RegExp|Function] [可选] [默认值:null]   文件过滤器,可为正则或者方法((fileName: string, file: File) => boolean),为方法时将传入文件名称和File对象，返回false时或正则不匹配将过滤该文件
- ##### readFileFn [Function] [可选] [默认值:Blob.slice]    读取文件的方法 
    - 方法签名：(task: UploadTask, upfile: UploadFile, start?: number, end?: number) => Blob｜Promise<Blob>
    - 参数说明：
        - task [UploadTask] 当前上传任务
        - upfile [UploadFile] 当前上传文件
        - start [number] 文件读取起始位置
        - end [number] 文件读取结束位置
    - 返回值：Blob或返回Blob的Promise口
- ##### requestBodyProcessFn [Function] [可选] [默认值:null] 处理requestBody的方法，发送上传请求前处理请求体
    - 方法签名：(task: UploadTask, upfile: UploadFile, chunk: FileChunk, params: Obj) => any | Promise<any>
    - 参数说明：
        - task [UploadTask] 当前上传任务
        - upfile [UploadFile] 当前上传文件
        - chunk [FileChunk] 当前分块
        - params [RequestBaseParams]   默认上传参数
    - 返回值：任意值或返回任意值的Promise，该值将发送给上传接口
- ##### beforeFilesAdd [Function] [可选] [默认值:null]    文件添加前hook（选择文件后）
    - 方法签名：(files: File[]) => void|Promise<void>
    - 参数说明：
        - files [File[]] 原生File对象数组
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve
- ##### filesAdded [Function] [可选] [默认值:null]  文件添加后hook
    - 方法签名：(files: UploadFile[]) => void|Promise<void>
    - 参数说明：
        - files [UploadFile[]] UploadFile包装对象数组
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve
- ##### beforeTasksAdd [Function] [可选] [默认值:null]  任务添加前hook
    - 方法签名：(tasks: UploadTask[]) => void|Promise<void>
    - 参数说明：
        - tasks [UploadTask[]] 上传任务对象数组
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve
- ##### beforeTaskStart [Function] [可选] [默认值:null] 任务开始前hook
    - 方法签名：(task: UploadTask) => void|Promise<void>
    - 参数说明：
        - task [UploadTask] 上传任务对象
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve
- ##### beforeFileUploadStart [Function] [可选] [默认值:null]   文件开始上传前hook
    - 方法签名：(task: UploadTask, file: UploadFile) => void|Promise<void>
    - 参数说明：
        - task [UploadTask] 当前上传任务
        - file [UploadFile] 当前上传文件
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve
- ##### beforeFileHashCompute [Function] [可选] [默认值:null]   文件hash计算前hook（如需计算hash）
    - 方法签名：(task: UploadTask, file: UploadFile) => void|Promise<void>
    - 参数说明：
        - task [UploadTask] 当前上传任务
        - file [UploadFile] 当前上传文件
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve
- ##### fileHashComputed  [Function] [可选] [默认值:null]    hash计算后hook（如需计算hash）
    - 方法签名：(task: UploadTask, file: UploadFile, hash: string) => void|Promise<void>
    - 参数说明：
        - task [UploadTask] 当前上传任务
        - file [UploadFile] 当前上传文件
        - hash [string] 文件hash(md5)值
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve
- ##### beforeFileRead  [Function] [可选] [默认值:null]  文件读取前hook
    - 方法签名：(task: UploadTask, file: UploadFile, chunk: FileChunk) => void|Promise<void>
    - 参数说明：
        - task [UploadTask] 当前上传任务
        - file [UploadFile] 当前上传文件
        - chunk [FileChunk] 当前分块
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve
- ##### fileReaded  [Function] [可选] [默认值:null]文件读取后hook
    - 方法签名：(task: UploadTask, file: UploadFile, chunk: FileChunk, data: Blob) => void|Promise<void>
    - 参数说明：
        - task [UploadTask] 当前上传任务
        - file [UploadFile] 当前上传文件
        - chunk [FileChunk] 当前分块
        - data [Blob] 分块二进制数据
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve
- ##### beforeUploadRequestSend [Function] [可选] [默认值:null]   上传请求发送前hook
    - 方法签名：(task: UploadTask, file: UploadFile, chunk: FileChunk, requestParams: Obj) => void|Promise<void>
    - 参数说明：
        - task [UploadTask] 当前上传任务
        - file [UploadFile] 当前上传文件
        - chunk [FileChunk] 当前分块
        - requestParams [Object] 请求参数
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve
- ##### beforeUploadResponseProcess  [Function] [可选] [默认值:null] 处理上传请求响应前hook
    - 方法签名：(task: UploadTask,file: UploadFile,chunk: FileChunk,response: AjaxResponse,) => void|Promise<void>
    - 参数说明：
        - task [UploadTask] 当前上传任务
        - file [UploadFile] 当前上传文件
        - chunk [FileChunk] 当前分块
        - response [Object] 请求响应数据
    - 返回值：无返回值或返回Promise，返回Promise时将等待Promise resolve

#### 方法
- ##### upload  开始上传，开始所有任务或指定任务
    - 方法签名：(task?: UploadTask) => void
    - 参数说明：
        - task [UploadTask][可选] 指定上传任务
    - 返回值：无返回值
- ##### pause   暂停所有任务或指定任务
    - 方法签名：(task?: UploadTask) => void
    - 参数说明：
        - task [UploadTask][可选] 指定需要暂停的任务
    - 返回值：无返回值
- ##### resume  继续/恢复上传所有任务或指定任务
    - 方法签名：(task?: UploadTask) => void
    - 参数说明：
        - task [UploadTask][可选] 指定需要继续上传的任务
    - 返回值：无返回值
- ##### retry   错误时重试所有任务或指定任务
    - 方法签名：(task?: UploadTask) => void
    - 参数说明：
        - task [UploadTask][可选] 指定需要重试的任务
    - 返回值：无返回值
- ##### cancel  取消/删除任务所有任务或指定任务
    - 方法签名：(task?: UploadTask) => void
    - 参数说明：
        - task [UploadTask][可选] 指定需要取消的任务
    - 返回值：无返回值
- ##### clear   清空所有上传任务
    - 方法签名：() => void
    - 参数说明：无参数
    - 返回值：无返回值
- ##### isUploading 是否正在上传
    - 方法签名：() => boolean
    - 参数说明：无参数
    - 返回值：boolean
- ##### isComplete  是否全部完成
    - 方法签名：() => boolean
    - 参数说明：无参数
    - 返回值：boolean
- ##### hasError    是否存在错误
    - 方法签名：() => boolean
    - 参数说明：无参数
    - 返回值：boolean
- ##### getErrorTasks   获取上传出错的任务
    - 方法签名：() => boolean
    - 参数说明：无参数
    - 返回值：UploadTask[] 
- ##### initFilePickersAndDraggers 根据配置参数中的filePicker和fileDragger手动初始化文件选择器和文件拖放
    - 方法签名：() => void
    - 参数说明：无参数
    - 返回值：无返回值

#### 事件
- ##### file-upload-start   文件开始上传
    - 参数说明：
        - task [UploadTask] 当前上传文件所属任务
        - uploadfile [UploadFile] 当前上传文件
- ##### file-error  文件上传出错
    - 参数说明：
        - task [UploadTask] 当前上传文件所属任务
        - uploadfile [UploadFile] 当前上传文件
        - error [Error] 错误信息
- ##### file-complete   文件上传完成
    - 参数说明：
        - task [UploadTask] 当前上传文件所属任务
        - uploadfile [UploadFile] 当前上传文件
        - chunkResponse [ChunkResponse] 文件最后一分块和请求响应
- ##### chunk-upload-start  分块开始上传
    - 参数说明：
        - task [UploadTask] 当前上传文件所属任务
        - uploadfile [UploadFile] 当前上传文件
        - chunk [FileChunk] 当前分块
- ##### chunk-error 分块上传错误
    - 参数说明：
        - task [UploadTask] 当前上传文件所属任务
        - uploadfile [UploadFile] 当前上传文件
        - chunk [FileChunk] 当前分块
        - error [Error] 错误信息
- ##### chunk-complete  分块上传完成
    - 参数说明：
        - task [UploadTask] 当前上传文件所属任务
        - uploadfile [UploadFile] 当前上传文件
        - chunk [FileChunk] 当前分块
        - response [AjaxResponse] 请求响应
- ##### task-created    任务创建
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### task-update 任务更新（增加了新文件等）
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### task-restore     任务恢复
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### task-presist    任务持久化
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### task-waiting    任务进入等待队列
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### task-upload-start 任务开始上传
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### task-progress   任务进度
    - 参数说明：
        - task [UploadTask] 任务包装对象
        - progress [number] 任务进度
- ##### task-pause  任务暂停上传
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### task-resume 任务继续上传
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### task-retry  任务重试
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### task-error  任务上传出错
    - 参数说明：
        - task [UploadTask] 任务包装对象
        - error [Error] 错误信息
- ##### task-cancel 任务取消
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### task-complete   任务完成
    - 参数说明：
        - task [UploadTask] 任务包装对象
- ##### complete    所有任务完成


### UploadTask
- #### 属性
    - id [string] 唯一标识
    - name  [string] 名称
    - type  ['file'|'dir'] 类型file:文件，dir:文件夹
    - fileIDList [string[]] 包含的上传文件ID数组
    - fileList [UploadFile[]]   包含的上传文件
    - fileSize [number] 文件总大小
    - progress [number] 进度
    - status  [StatusCode]  状态
    - addTime   [Date]  创建时间
    - extraInfo [Object]    其他自定义信息

### UploadFile
- #### 属性
    - id [string]  唯一标识
    - name [string] 名称
    - type [string] mimeType 类型
    - size [number] 大小
    - relativePath [string] 相对路径
    - path [string] 路径
    - lastModified [number] 最后修改时间
    - hash [string] hash值
    - raw [Blob]  原始数据
    - uploaded [number] 已上传大小
    - chunkIDList [string[]]    分块ID数组
    - chunkList [FileChunk[]]   分块数组
    - progress [number] 进度
    - status [StatusCode]   状态
    - response [Object] 请求响应
    - extraInfo [Object]    其他自定义信息

### FileChunk
- #### 属性
    - id [string] 唯一标识
    - start [number] 起始位置
    - end [number] 结束位置
    - index [number]    序号，从0开始
    - data [Blob]   二进制数据
    - hash [string] hahs值
    - uploaded [number] 已上传大小
    - size [number] 总大小
    - progress [number] 进度
    - status [StatusCode]   状态
    - response [Object] 请求响应
    - extraInfo [Object]   其他自定义信息

### RequestBaseParams
- #####  chunkIndex [number] 分块索引
- #####  chunkSize [number] 分块大小
- #####  chunkCount [number]    总分块数量
- #####  currentChunkSize [number]  当前分块大小
- #####  chunkHash [string] 分块hash  
- #####  fileID [string]    文件ID
- #####  fileName [string]  文件名称
- #####  fileSize [number]  文件大小
- #####  relativePath [string]  文件相对路径
- #####  fileHash [string]  文件hash

### StatusCode
- ##### waiting 等待
- ##### uploading    上传
- ##### pause    暂停
- ##### error    错误
- ##### complete 完成

文档完善中......


 