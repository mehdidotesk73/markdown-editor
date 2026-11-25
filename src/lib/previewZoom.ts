import { ref, watch } from 'vue'

// The preview's zoom: scales the rendered text from its base size (everything
// in .md-body is sized in em, so headings, code and formulas follow). A
// per-viewer preference, so localStorage is fine.

const KEY = 'md-editor:preview-zoom'
export const ZOOM_STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200] as const
export const DEFAULT_ZOOM = 100

/** The next step up (dir 1) or down (dir -1) from any zoom, clamped to the ends. */
export function stepZoom(current: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
  return [...ZOOM_STEPS].reverse().find((z) => z < current) ?? ZOOM_STEPS[0]
}

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    if ((ZOOM_STEPS as readonly number[]).includes(v)) return v
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
