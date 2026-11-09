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

// v4: the focus starts hidden (off) with its panel closed. Earlier versions
// carry over scale, decay and lag, but not on/off or the panel, so the new
// defaults reach everyone once.
const KEY = 'md-editor:focus:v4'
const OLD_KEYS = ['md-editor:focus:v3', 'md-editor:focus:v2', 'md-editor:focus']
const DEFAULTS: FocusSettings = { enabled: false, panel: false, scale: 'sentence', decay: { ...DEFAULT_DECAY }, lag: 0 }

type Stored = Partial<FocusSettings> & { distance?: number }

/** Decay from storage: missing scales get defaults; values still at an earlier default move to the new one. */
function storedDecay(d: Partial<Record<Scale, number>> | undefined): Record<Scale, number> {
  const decay = { ...DEFAULT_DECAY, ...(d ?? {}) }
  for (const k of Object.keys(PREVIOUS_DEFAULT) as Scale[]) if (decay[k] === PREVIOUS_DEFAULT[k]) decay[k] = DEFAULT_DECAY[k]
  return decay
}

function load(): FocusSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Stored
      return {
        enabled: s.enabled ?? DEFAULTS.enabled,
        panel: s.panel ?? DEFAULTS.panel,
        scale: s.scale ?? DEFAULTS.scale,
        decay: storedDecay(s.decay),
        lag: s.lag ?? DEFAULTS.lag,
      }
    }
    for (const k of OLD_KEYS) {
      const old = localStorage.getItem(k)
      if (!old) continue
      const o = JSON.parse(old) as Stored
      // v3 had per-scale decay and lag; v1/v2 had neither (their sliders meant something else).
      const v3 = k === 'md-editor:focus:v3'
      return {
        ...DEFAULTS,
        scale: o.scale ?? DEFAULTS.scale,
        decay: v3 ? storedDecay(o.decay) : { ...DEFAULT_DECAY },
        lag: v3 ? (o.lag ?? 0) : 0,
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
