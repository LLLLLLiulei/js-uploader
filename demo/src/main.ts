import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/lib/theme-chalk/index.css'

const app = createApp(App).use(ElementPlus)
const instance = app.mount('#app')
console.log('🚀 ~ file: main.ts ~ line 23 ~ instance', instance)
