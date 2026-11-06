import { ref, watch } from 'vue'

// The app theme: 'dark' (Sage) or 'light' (Porcelain) — see styles/vars.css.
// Applied as data-theme on <html>, so every token switches at once. A
// per-viewer preference, so localStorage is fine. (The key predates the
// whole-app theme, when only the panels switched; kept so choices carry over.)

export type Theme = 'dark' | 'light'
const KEY = 'md-editor:paper'

function load(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
  // Browser chrome (mobile address bar) follows the page background.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f2f0eb' : '#141815')
}

const theme = ref<Theme>(load())
apply(theme.value) // at import time, before the first paint

watch(theme, (t) => {
  apply(t)
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* storage blocked */
  }
})

export function useTheme() {
  return {
    theme,
    toggleTheme: () => (theme.value = theme.value === 'dark' ? 'light' : 'dark'),
  }
}
