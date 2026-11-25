import { ref, watch } from 'vue'

// The preview's zoom: scales the rendered text from its base size (everything
// in .md-body is sized in em, so headings, code and formulas follow). A
// per-viewer preference, so localStorage is fine.

const KEY = 'md-editor:preview-zoom'
export const ZOOM = { min: 50, max: 200, step: 5 } as const
export const DEFAULT_ZOOM = 100

/** Any value → a valid zoom: on a step, within range (stored values may be stale). */
export function clampZoom(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_ZOOM
  return Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(v / ZOOM.step) * ZOOM.step))
}

function load(): number {
  try {
    const v = localStorage.getItem(KEY)
    if (v) return clampZoom(Number(v))
  } catch {
    /* storage blocked */
  }
  return DEFAULT_ZOOM
}

export const previewZoom = ref<number>(typeof localStorage === 'undefined' ? DEFAULT_ZOOM : load())

watch(previewZoom, (v) => {
  try {
    localStorage.setItem(KEY, String(v))
  } catch {
    /* storage blocked */
  }
})
