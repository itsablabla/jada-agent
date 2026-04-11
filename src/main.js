import { createApp } from 'vue'
import App from './App.vue'

const appEl = document.getElementById('jada-agent-app')
if (appEl) {
    createApp(App).mount(appEl)
}
