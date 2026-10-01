import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useArenaStore } from '@/stores/arena'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia).use(router)

/* 启动即从 localStorage 恢复（首次运行载入种子数据） */
useArenaStore(pinia).loadState()

app.mount('#app')