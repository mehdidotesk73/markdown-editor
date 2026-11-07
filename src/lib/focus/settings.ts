import { reactive, watch } from 'vue'
import type { Scale } from './segment'
import { MAX_LAG } from './focal'

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
  /** How many distinct units (of the current scale) the focus lags behind the cursor's path. */
  lag: number
}

/** Decay slider range per scale, in words (the slider is logarithmic). */
export const DECAY_RANGE: Record<Scale, { min: number; max: number }> = {
  word: { min: 0.3, max: 40 },
  sentence: { min: 1, max: 300 },
  paragraph: { min: 2, max: 1000 },
  section: { min: 5, max: 3000 },
}
export const LAG_RANGE = { min: 0, max: MAX_LAG }

// Defaults the user settled on by trial in the app (sections: about 3 units).
export const DEFAULT_DECAY: Record<Scale, number> = { word: 1, sentence: 12, paragraph: 30, section: 150 }
// Earlier defaults: a stored value still equal to one of these was never tuned, so it moves to the new default.
const PREVIOUS_DEFAULT: Partial<Record<Scale, number>> = { word: 2, sentence: 15 }

// v3: the attention-share model (decay per scale, lag in units). From
// earlier versions only on/off, panel and scale carry over.
const KEY = 'md-editor:focus:v3'
const OLD_KEYS = ['md-editor:focus:v2', 'md-editor:focus']
const DEFAULTS: FocusSettings = { enabled: true, panel: true, scale: 'sentence', decay: { ...DEFAULT_DECAY }, lag: 0 }

function load(): FocusSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      // `distance` (a shift in document order) was replaced by `lag` (along the cursor's path).
      const { distance: _old, ...s } = JSON.parse(raw) as Partial<FocusSettings> & { distance?: number }
      const decay = { ...DEFAULT_DECAY, ...(s.decay ?? {}) }
      for (const k of Object.keys(PREVIOUS_DEFAULT) as Scale[]) if (decay[k] === PREVIOUS_DEFAULT[k]) decay[k] = DEFAULT_DECAY[k]
      return { ...DEFAULTS, ...s, decay }
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
