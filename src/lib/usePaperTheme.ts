import { ref, watch } from 'vue'

// The panel ("paper") theme: light or dark background inside the editor and
// preview panes only. The app chrome around them stays dark. A per-viewer
// convenience, so localStorage is fine.

export type PaperTheme = 'dark' | 'light'
const KEY = 'md-editor:paper'

function load(): PaperTheme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

const paper = ref<PaperTheme>(load())
watch(paper, (p) => {
  try {
    localStorage.setItem(KEY, p)
  } catch {
    /* storage blocked */
  }
})

export function usePaperTheme() {
  return {
    paper,
    togglePaper: () => (paper.value = paper.value === 'dark' ? 'light' : 'dark'),
  }
}
