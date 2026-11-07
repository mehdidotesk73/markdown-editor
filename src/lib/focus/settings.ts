import { reactive, watch } from 'vue'
import type { Scale } from './segment'

// Focus settings: a per-viewer preference, so localStorage is fine.

export interface FocusSettings {
  /** The focus runs (and underlines) whether or not its controls are showing. */
  enabled: boolean
  /** Whether the controls panel under the Preview heading is open. */
  panel: boolean
  /** Which scale the focus underlines. */
  scale: Scale
  /** The field's decay length σ, in words — one per scale, tuned separately. */
  decay: Record<Scale, number>
  /** How many units of the current scale the focal point sits behind the cursor. */
  distance: number
}

/** Decay slider range per scale, in words (the slider is logarithmic). */
export const DECAY_RANGE: Record<Scale, { min: number; max: number }> = {
  word: { min: 0.3, max: 40 },
  sentence: { min: 1, max: 300 },
  paragraph: { min: 2, max: 1000 },
  section: { min: 5, max: 3000 },
}
export const DISTANCE_RANGE = { min: 0, max: 20 }

// Each default holds about 3 units in focus on typical prose.
export const DEFAULT_DECAY: Record<Scale, number> = { word: 2, sentence: 15, paragraph: 30, section: 150 }

// v3: the attention-share model (decay per scale, distance in units). From
// earlier versions only on/off, panel and scale carry over.
const KEY = 'md-editor:focus:v3'
const OLD_KEYS = ['md-editor:focus:v2', 'md-editor:focus']
const DEFAULTS: FocusSettings = { enabled: true, panel: true, scale: 'sentence', decay: { ...DEFAULT_DECAY }, distance: 0 }

function load(): FocusSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<FocusSettings>
      return { ...DEFAULTS, ...s, decay: { ...DEFAULT_DECAY, ...(s.decay ?? {}) } }
    }
    for (const k of OLD_KEYS) {
      const old = localStorage.getItem(k)
      if (!old) continue
      const o = JSON.parse(old) as Partial<FocusSettings>
      return {
        ...DEFAULTS,
        enabled: o.enabled ?? true,
        panel: o.panel ?? true,
        scale: o.scale ?? 'sentence',
        decay: { ...DEFAULT_DECAY },
      }
    }
  } catch {
    /* storage blocked or bad JSON: defaults */
  }
  return { ...DEFAULTS, decay: { ...DEFAULT_DECAY } }
}

export const focusSettings = reactive<FocusSettings>(load())

watch(focusSettings, (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage blocked */
  }
})

/** Log-slider helpers: position 0..1000 ↔ decay in words for a scale. */
export const SLIDER_STEPS = 1000
export function decayToSlider(scale: Scale, v: number): number {
  const { min, max } = DECAY_RANGE[scale]
  return Math.round((Math.log(v / min) / Math.log(max / min)) * SLIDER_STEPS)
}
export function sliderToDecay(scale: Scale, p: number): number {
  const { min, max } = DECAY_RANGE[scale]
  const v = min * Math.pow(max / min, p / SLIDER_STEPS)
  return v < 10 ? Math.round(v * 10) / 10 : Math.round(v)
}
