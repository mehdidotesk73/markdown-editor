import { computed, reactive, watch } from 'vue'
import { DEFAULT_DARK, DEFAULT_LIGHT, THEMES, themeById, type ThemeInfo, type ThemeMode } from './themes'

// The app theme: one of the looks in lib/themes.ts (a stored look that no
// longer exists falls back to the default for its mode), applied as data-theme
// on <html> so every token in styles/vars.css switches at once. The viewer
// keeps a chosen dark look and a chosen light look; the Dark / Light button
// flips between them, and picking a look from its menu makes it the choice for
// its mode. A per-viewer preference, so localStorage is fine.

const KEY = 'md-editor:theme'
const OLD_KEY = 'md-editor:paper' // 'dark' | 'light' from the two-look days

interface ThemeState {
  current: string
  dark: string
  light: string
}

function load(): ThemeState {
  const fresh: ThemeState = { current: DEFAULT_DARK, dark: DEFAULT_DARK, light: DEFAULT_LIGHT }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<ThemeState>
      const dark = themeById(s.dark)?.mode === 'dark' ? s.dark! : DEFAULT_DARK
      const light = themeById(s.light)?.mode === 'light' ? s.light! : DEFAULT_LIGHT
      const current = themeById(s.current) ? s.current! : dark
      return { current, dark, light }
    }
    if (localStorage.getItem(OLD_KEY) === 'light') return { ...fresh, current: DEFAULT_LIGHT }
  } catch {
    /* storage blocked or bad JSON */
  }
  return fresh
}

const state = reactive<ThemeState>(load())
const info = computed<ThemeInfo>(() => themeById(state.current) ?? THEMES[0])

function apply(t: ThemeInfo) {
  document.documentElement.dataset.theme = t.id
  // Browser chrome (mobile address bar) follows the page background.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg)
}
apply(info.value) // at import time, before the first paint

watch(
  state,
  (s) => {
    apply(info.value)
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* storage blocked */
    }
  },
  { deep: true },
)

/** Switch to a look; it becomes the chosen look for its mode. */
function setTheme(id: string) {
  const t = themeById(id)
  if (!t) return
  state[t.mode] = t.id
  state.current = t.id
}

export function useTheme() {
  return {
    /** The look in use. */
    theme: info,
    /** 'dark' or 'light'. */
    mode: computed<ThemeMode>(() => info.value.mode),
    /** The chosen look for each mode. */
    chosen: state,
    setTheme,
    /** Dark ↔ light: the chosen look of the other mode. */
    toggleTheme: () => (state.current = info.value.mode === 'dark' ? state.light : state.dark),
  }
}
