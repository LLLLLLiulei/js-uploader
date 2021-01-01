<template>
  <div class="uploader-container">
    <transition name="el-fade-in">
      <div class="uploader-drop" id="uploader-drop" v-show="showDrop">
        <div class="uploader-drop-header" v-if="showDropheader">
          <div class="header-back">
            <a href="javascript:void(0)" @click="showDrop = false">
              <i class="el-icon-back"></i> Back
            </a>
          </div>
          <div class="header-title">Add more files</div>
          <div class="header-title"></div>
        </div>
        <i class="el-icon-upload"></i>
        <div class="uploader-drop-item">Drop files here</div>
        <div class="uploader-drop-item">
          <input type="file" id="filePicker" />
          <input type="file" id="dirPicker" />
          <a href="javascript:void(0)" @click="chooseFiles"> browse file</a>
          <span> or</span>
          <a href="javascript:void(0)" @click="chooseDir"> browse directory</a>
        </div>
      </div>
    </transition>

    <transition name="el-fade-in">
      <div class="uploader-list" v-show="!showDrop">
        <div class="uploader-list-toolbar">
          <a href="javascript:void(0)" @click="confirmCancel()">
            <i class="el-icon-delete"></i> Clear
          </a>
          <span> {{ taskList.length || "No" }} tasks </span>
          <a
            href="javascript:void(0)"
            @click="
              showDrop = true;
              showDropheader = true;
            "
          >
            <i class="el-icon-folder-add"></i> Add more
          </a>
        </div>
        <div class="uploader-list-main">
          <el-table
            v-if="false"
            :data="taskList"
            height="100%"
            style="width: 100%"
          >
            <el-table-column
              prop="name"
              label="Name"
              width="220"
              show-overflow-tooltip
            >
            </el-table-column>
            <el-table-column prop="fileSize" label="Size" width="80">
            </el-table-column>
            <el-table-column prop="progress" label="Progress">
              <el-progress :percentage="25" :width="45"></el-progress>
            </el-table-column>
            <el-table-column label="Operate" width="120">
              <div class="table-operate">
                <i class="el-icon-video-play"></i>
                <i class="el-icon-video-pause"></i>
                <i class="el-icon-circle-close"></i>
              </div>
            </el-table-column>
          </el-table>
          <div class="list-row" v-for="item in taskList">
            <el-row :gutter="10">
              <el-col :span="10">
                <div class="item-name">
                  <i class="el-icon-document"></i>
                  <span :title="item.name">{{ item.name }}</span>
                </div>
              </el-col>
              <el-col :span="3">
                <span>{{ formatSize(item.fileSize || item.filSize) }}</span>
              </el-col>
              <el-col :span="8">
                <el-progress
                  :percentage="item.progress"
                  :status="item.status === 'error' ? 'exception' : ''"
                ></el-progress>
              </el-col>
              <el-col :span="3">
                <div class="table-operate">
                  <i
                    v-if="item.status === 'pause'"
                    class="el-icon-video-play"
                    @click="execTask(item)"
                  ></i>
                  <i
                    v-if="
                      item.status === 'uploading' || item.status === 'waiting'
                    "
                    class="el-icon-video-pause"
                    @click="pauseTask(item)"
                  ></i>

                  <i
                    v-if="item.status === 'complete'"
                    class="el-icon-circle-check"
                  ></i>
                  <i
                    v-if="item.status === 'error'"
                    class="el-icon-refresh-left"
                    @click="retryTask(item)"
                  ></i>

                  <i
                    class="el-icon-circle-close"
                    @click="confirmCancel(item)"
                  ></i>
                </div>
              </el-col>
            </el-row>
          </div>
        </div>
        <div class="uploader-list-footer">
          <el-button v-if="!isUploading" type="primary" @click="execTask()">
            <!-- <i class="el-icon-upload" style="font-size:16px"></i> -->
            Upload
          </el-button>
          <el-button v-else type="primary" @click="pauseTask()">
            <!-- <i class="el-icon-upload" style="font-size:16px"></i>  -->
            Pause
          </el-button>
          <!-- <el-button v-if="true" type="danger" @click="confirmCancel">
            <i class="el-icon-delete-solid"></i> Clear
          </el-button> -->
        </div>
      </div>
    </transition>
  </div>
</template>

<script lang="ts">
import {
  Uploader,
  UploaderOptions,
  FileStore,
  EventType,
  UploadTask,
  FileChunk,
  UploadFile,
  ID,
  Obj
} from "js-uploader";
import { ElMessageBox } from "element-plus";
import {
  defineComponent,
  getCurrentInstance,
  onMounted,
  onUnmounted,
  PropType,
  reactive,
  ref,
  SetupContext,
  toRef,
  toRefs,
} from "vue";

interface State {
  taskList: UploadTask[];
  showDrop: boolean;
  showDropheader: boolean;
  isUploading: boolean;
}

export default defineComponent({
  name: "Uploader",
  emits: [...Object.values(EventType)],
  props: {
    options: {
      type: Object as PropType<UploaderOptions>,
      default: null,
      required: true,
    },
  },
  setup(props, ctx: SetupContext) {
    const state = reactive<State>({
      taskList: reactive([]),
      showDrop: true,
      showDropheader: false,
      isUploading: false,
    });
    console.log("🚀 ~ file: Uploader.vue ~ line 136 ~ setup ~ state", state);

    const formatSize = (size: number) => {
      if (isNaN(size) || size === Infinity) {
        return "";
      }
      if (size < 1024) {
        return size.toFixed(0) + " B";
      } else if (size < 1024 * 1024) {
        return (size / 1024.0).toFixed(0) + " KB";
      } else if (size < 1024 * 1024 * 1024) {
        return (size / 1024.0 / 1024.0).toFixed(1) + " M";
      } else {
        return (size / 1024.0 / 1024.0 / 1024.0).toFixed(1) + " G";
      }
    };

    const options: UploaderOptions = {
      requestOptions: {
        url: "http://ecm.test.work.zving.com/catalogs/4751/files/upload",
        headers: {
          CMPID: "f05dd7da36ba4e238f9c1f053c2e76e3",
          TOKEN:
            "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlY20gY2xpZW50IiwiaXNzIjoienZpbmciLCJjbGFpbURlZmF1bHRLZXkiOiJsaXVsZWkwMSIsImV4cCI6MTYwOTY2NzM0OCwiaWF0IjoxNjA5MDYyNTQ4LCJqdGkiOiI4MGQ1ZTVkMWQxODM0ZmQyYWVjOWI2NzAxZWUwYzVmYiJ9.y7tiMYmlJNpx3gtMsrD8qRxpZWpxhi7ZMBPyBeHr6Xk",
        },
        body: (
          task: UploadTask,
          uploadfile: UploadFile,
          chunk: FileChunk,
          baseParams: any
        ) => {
          return Object.assign(baseParams, {
            chunkNumber: baseParams.chunkIndex + 1,
            identifier: uploadfile.id,
            filename: uploadfile.name,
            totalChunks: uploadfile.chunkIDList?.length,
          });
        },
      },
      taskConcurrency: 5,
      resumable: false,
      singleFileTask: true,
      skipTaskWhenUploadError: true,
    };
    const uploader: Uploader = Uploader.create(options);
    const { upload, pause, resume, retry, clear, cancel } = uploader;

    const checkUploading = (): boolean => {
      state.isUploading = uploader.isUploading();
      return state.isUploading;
    };

    const findTask = (id: ID): Nullable<UploadTask> => {
      return state.taskList.find((item) => item.id === id) || null;
    };

    const findTaskIndex = (id: ID): number => {
      return state.taskList.findIndex((item) => item.id === id);
    };

    const assignTask = (task: UploadTask) => {
      if (task) {
        const current: Nullable<UploadTask> = findTask(task.id);
        current && Object.assign(current, task);
      }
    };

    const eventHandler = (eventType: EventType, ...args: any[]) => {
      switch (eventType) {
        case EventType.TaskCreated:
          state.taskList.push(Object.assign({}, args[0]));
          break;
        case EventType.TaskCancel:
          let task: Nullable<UploadTask> = args[0] as UploadTask;
          let index: number = findTaskIndex(task.id);
          index !== -1 && state.taskList.splice(index, 1);
          break;
        case EventType.TaskProgress:
          assignTask(args[0] as UploadTask);
          break;
        case EventType.TaskPause:
          assignTask(args[0] as UploadTask);
          break;
        case EventType.TaskUpdate:
          assignTask(args[0] as UploadTask);
          break;
        case EventType.TaskWaiting:
          assignTask(args[0] as UploadTask);
          break;
        case EventType.TaskComplete:
          assignTask(args[0] as UploadTask);
          break;
        case EventType.TaskError:
          assignTask(args[0] as UploadTask);
          break;
      }
      checkUploading();
      ctx.emit(String(eventType), ...args);
    };

    Object.values(EventType).forEach((e) =>
      uploader.on(e, (...args) => eventHandler(e, ...args))
    );

    let filePicker: Nullable<HTMLInputElement> = null;
    let dirPicker: Nullable<HTMLInputElement> = null;

    const chooseFiles = () => {
      filePicker?.click();
    };

    const chooseDir = () => {
      dirPicker?.click();
    };

    const initFilePickersAndDraggers = () => {
      const dropEl: HTMLElement =
        document.querySelector("#uploader-drop") || document.body;
      uploader.options.fileDragger = {
        $el: dropEl,
        onDragenter: () => {
          dropEl.classList.add("uploader-drop-hover");
        },
        onDragleave: () => {
          dropEl.classList.remove("uploader-drop-hover");
        },
        onDrop: () => {
          dropEl.classList.remove("uploader-drop-hover");
          state.showDrop = false;
        },
      };
      const hideDrop = () => {
        state.showDrop = false;
      };
      filePicker = document.querySelector("#filePicker") as HTMLInputElement;
      filePicker.addEventListener("change", hideDrop);
      dirPicker = document.querySelector("#dirPicker") as HTMLInputElement;
      dirPicker.addEventListener("change", hideDrop);
      uploader.options.filePicker = [
        {
          $el: filePicker,
          multiple: true,
          directory: false,
        },
        {
          $el: dirPicker,
          multiple: true,
          directory: true,
        },
      ];
      (uploader as any).initFilePickersAndDraggers();
    };

    const confirmCancel = (task?: UploadTask) => {
      ElMessageBox.confirm("Confirm to cancel all tasks ?", "Warning", {
        type: "warning",
      })
        .then((res) => {
          task ? uploader.cancel(task) : uploader.clear();
        })
        .catch(() => {});
    };

    const execTask = (task?: UploadTask) => {
      uploader.upload(task);
    };

    const pauseTask = (task?: UploadTask) => {
      uploader.pause(task);
    };

    const cancelTask = (task?: UploadTask) => {
      uploader.cancel(task);
    };

    const retryTask = (task?: UploadTask) => {
      uploader.retry(task);
    };

    onMounted(() => {
      initFilePickersAndDraggers();
    });

    onUnmounted(() => {
      Object.values(EventType).forEach((e) => uploader.off(e));
      uploader.destory();
    });

    return {
      chooseFiles,
      chooseDir,
      confirmCancel,
      execTask,
      pauseTask,
      cancelTask,
      retryTask,
      formatSize,
      ...toRefs(state),
    };
  },
});
</script>
<style scoped>
.uploader-container {
  width: 750px;
  height: 550px;
  background-color: #fafafa;
  border-radius: 5px;
  box-sizing: border-box;
  text-align: center;
  position: relative;
  margin: 0 auto;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 18px;
}
.uploader-container .uploader-drop-hover {
  border: 2.5px dashed #409eff !important;
}
.uploader-container .uploader-drop .uploader-drop-header {
  display: flex;
  position: absolute;
  width: 100%;
  top: 0;
  border-bottom: 1px solid #eaeaea;
  height: 50px;
  line-height: 50px;
}
.header-back {
  text-align: left;
  padding-left: 15px;
}
.header-back,
.header-title {
  width: 33%;
}
.uploader-container .uploader-drop .el-icon-upload {
  display: block;
  font-size: 110px;
  color: #c0c4cc;
  margin: 28px 0;
  line-height: 50px;
}
.uploader-container .uploader-drop {
  border: 2px dashed #d9d9d9;
  /* cursor: pointer; */
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: absolute;
}

.uploader-container .uploader-drop,
.uploader-container .uploader-list {
  width: 100%;
  height: 100%;
  border-radius: 5px;
}
.uploader-container a {
  text-decoration: none;
  color: #2275d7;
}
.uploader-container .uploader-drop-item {
  margin: 10px;
}

.uploader-container .uploader-list {
  align-self: flex-start;
  border: 1px solid #d9d9d9;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: absolute;
}
.uploader-container .uploader-list .uploader-list-toolbar,
.uploader-container .uploader-list .uploader-list-footer {
  padding: 0 15px;
  height: 50px;
  justify-content: space-between;
  position: relative;
  border-bottom: 1px solid #eaeaea;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.uploader-container .uploader-list .uploader-list-footer {
  border-top: 1px solid #eaeaea;
  height: 65px;
  justify-content: flex-end;
}

.uploader-container .uploader-list .uploader-list-main {
  width: 100%;
  height: calc(100% - 65px - 50px);
  overflow-y: scroll;
  overflow-x: hidden;
  padding: 10px 0;
  /* border: 1px solid; */
}
.uploader-container .uploader-list .uploader-list-main .task-ul {
  text-decoration: none;
}
.uploader-container .uploader-list .uploader-list-main .task-ul li {
  list-style: none;
}
.uploader-container .uploader-list .uploader-list-main .el-table {
  padding: 10px;
}
.uploader-container .uploader-list .uploader-list-main .el-table i {
  font-size: 30px;
  cursor: pointer;
}
.table-operate i + i {
  padding-left: 5px;
}
.table-operate i:hover {
  color: #5cb6ff;
}

.table-operate i {
  cursor: pointer;
  font-size: 22px;
  color: #2275d7;
}
.uploader-container .uploader-list .uploader-list-main .item-name {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  white-space: nowrap;
}
.uploader-container .uploader-list .uploader-list-main .item-name i {
  display: inline;
  padding-right: 5px;
}
.uploader-container .uploader-list .uploader-list-main .list-row {
  padding: 8px 10px;
  text-align: left;
  font-size: 16px;
  align-items: center;
}
.uploader-container .uploader-list .uploader-list-main .list-row :hover {
  background-color: #f5f7fa;
}
#filePicker,
#dirPicker {
  visibility: hidden;
  position: absolute;
  width: 1px;
  height: 1px;
}
</style>
