import { createApp } from 'vue'
import App from './App.vue'

const appEl = document.getElementById('jada-agent-app')
if (appEl) {
    // Force full-width: Nextcloud's core CSS constrains #jada-agent-app inside
    // the flex #content container.  Inline styles beat any external specificity.
    appEl.style.cssText = 'width:100%!important;flex:1 1 100%!important;min-width:0;height:calc(100vh - 50px);margin:0;padding:0;background:#0d0d14;'
    createApp(App).mount(appEl)
}
