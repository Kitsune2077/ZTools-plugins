import { ref, watch } from 'vue'
import { useStorage } from '../../composables/useStorage'
import { setThemeName } from '../engine'
import type { ThemeName } from '../themes'

const { getItem, setItem } = useStorage()
const STORAGE_KEY = 'tetrisTheme'

export function useTheme() {
  const currentTheme = ref<ThemeName>('modern')

  function loadSavedTheme() {
    const saved = getItem(STORAGE_KEY) as ThemeName | null
    if (saved && ['neon', 'modern', 'retro'].includes(saved)) {
      currentTheme.value = saved
    }
  }

  function setTheme(name: ThemeName) {
    currentTheme.value = name
    document.body.className = 'theme-' + name
    setItem(STORAGE_KEY, name)
    setThemeName(name)
  }

  // Initialize
  loadSavedTheme()
  // Apply initial theme to body
  document.body.className = 'theme-' + currentTheme.value
  setThemeName(currentTheme.value)

  return {
    currentTheme,
    setTheme,
  }
}
