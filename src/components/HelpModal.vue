<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { renderMarkdown } from '../lib/markdown'

interface Props {
  open: boolean
  initialDoc?: string
}

const props = defineProps<Props>()
defineEmits<{ (e: 'close'): void }>()

// Every docs/concepts/*.md becomes a page of the Help modal, keyed by file
// name ("overview.md" → "overview"). Bundled at build time.
const files = import.meta.glob('../../docs/concepts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const docs: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, md]) => [path.split('/').pop()!.replace(/\.md$/, ''), md]),
)

const currentDoc = ref(props.initialDoc ?? 'overview')
watch(
  () => props.open,
  (o) => {
    if (o && props.initialDoc) currentDoc.value = props.initialDoc
  },
)

const docKeys = computed(() => Object.keys(docs))
const currentHtml = computed(() =>
  renderMarkdown(docs[currentDoc.value] ?? docs[docKeys.value[0]] ?? '# Help\n\nNo help pages yet.'),
)
</script>

<template>
  <div v-if="open" class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <button class="close-btn" @click="$emit('close')" aria-label="Close">✕</button>

      <div class="modal-body">
        <div class="doc-content">
          <div v-html="currentHtml" class="md-body"></div>
        </div>

        <div v-if="docKeys.length > 1" class="doc-tabs">
          <button
            v-for="key in docKeys"
            :key="key"
            :class="{ active: currentDoc === key }"
            class="tab-btn"
            @click="currentDoc = key"
          >
            {{ formatTabName(key) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
function formatTabName(key: string): string {
  return key
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.modal-content {
  position: relative;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 0.8rem;
  width: 100%;
  max-width: 46rem;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
}

.close-btn {
  position: absolute;
  top: 0.8rem;
  right: 0.8rem;
  z-index: 101;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0.25rem;
}

.close-btn:hover {
  color: var(--text);
}

.modal-body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
}

.doc-content {
  flex: 1;
  overflow: auto;
  padding: 1.5rem;
}

.doc-tabs {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--border);
  background: var(--bg-elev-2);
  overflow: auto;
}

.tab-btn {
  padding: 0.5rem 1rem;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
}

.tab-btn:hover {
  color: var(--text);
  border-color: var(--accent-blue);
}

.tab-btn.active {
  background: var(--accent-blue);
  color: var(--on-accent);
  border-color: var(--accent-blue);
}

@media (max-width: 30rem) {
  .modal-overlay {
    padding: 0;
  }

  .modal-content {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
  }

  .doc-content {
    padding: 1rem;
  }
}
</style>
