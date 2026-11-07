import { reactive, watch } from 'vue'
import type { Scale } from './segment'
import type { Mode } from './wave'

// Focus-shadow settings: a per-viewer preference, so localStorage is fine.

export interface FocusSettings {
  /** The shadow runs (and underlines) whether or not its controls are showing. */
  enabled: boolean
  /** Whether the controls panel under the Preview heading is open. */
  panel: boolean
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

// v2: new defaults (intensity 15, distance 0). From v1 only the on/off, scale
// and mode carry over, so the new slider defaults reach everyone once.
const KEY = 'md-editor:focus:v2'
const OLD_KEY = 'md-editor:focus'
const DEFAULTS: FocusSettings = {
  enabled: true,
  panel: true,
  scale: 'sentence',
  mode: 'linear',
  intensity: 15,
  distance: 0,
}

function load(): FocusSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<FocusSettings>) }
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? '{}') as Partial<FocusSettings>
    const { enabled, scale, mode } = { ...DEFAULTS, ...old }
    return { ...DEFAULTS, enabled, scale, mode }
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
