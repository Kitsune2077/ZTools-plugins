import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './main.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

const saved = localStorage.getItem('hushreader_config')
if (saved) {
  try {
    const cfg = JSON.parse(saved)
    const theme = cfg?.other?.theme
    if (theme) document.documentElement.setAttribute('data-theme', theme)
  } catch {}
}
