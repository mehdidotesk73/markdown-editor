import { reactive, watch } from 'vue'
import type { Scale } from './segment'
import type { Mode } from './wave'

// Focus-shadow settings: a per-viewer preference, so localStorage is fine.

export interface FocusSettings {
  enabled: boolean
  /** Which scale the shadow underlines. */
  scale: Scale
  /** How paragraph and section lengths are measured (see wave.ts). */
  mode: Mode
  /** How far the focus spreads, in words (the bell's width). */
  intensity: number
  /** How many words the shadow trails behind the cursor. */
  distance: number
}

export const INTENSITY_RANGE = { min: 1, max: 60 }
export const DISTANCE_RANGE = { min: 0, max: 200 }

const KEY = 'md-editor:focus'
const DEFAULTS: FocusSettings = { enabled: true, scale: 'sentence', mode: 'linear', intensity: 12, distance: 30 }

function load(): FocusSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<FocusSettings>
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

export const focusSettings = reactive<FocusSettings>(load())

watch(focusSettings, (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage blocked */
  }
})
