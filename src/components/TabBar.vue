<script setup lang="ts">
import { isDirty, type Tab } from '../lib/useTabs'

defineProps<{ tabs: Tab[]; activeId: string | null }>()
defineEmits<{
  (e: 'activate', id: string): void
  (e: 'close', tab: Tab): void
  (e: 'new'): void
}>()

function title(t: Tab): string {
  const where =
    t.access === 'linked'
      ? 'Linked to a file on this computer'
      : t.access === 'needs-access'
        ? 'Linked — click Reconnect to allow access again'
        : 'Not saved to a file yet'
  return `${t.name}\n${where}${isDirty(t) ? '\nUnsaved changes' : ''}`
}
</script>

<template>
  <nav class="tabbar" role="tablist" aria-label="Open files">
    <div
      v-for="t in tabs"
      :key="t.id"
      class="tab"
      role="tab"
      tabindex="0"
      :aria-selected="t.id === activeId"
      :class="{ active: t.id === activeId, dirty: isDirty(t), unlinked: t.access === 'unlinked' }"
      :title="title(t)"
      @click="$emit('activate', t.id)"
      @keydown.enter="$emit('activate', t.id)"
      @auxclick.middle.prevent="$emit('close', t)"
    >
      <span v-if="t.access === 'needs-access'" class="mark warn" aria-label="needs access">⚠</span>
      <span class="name">{{ t.name }}</span>
      <button class="x" :aria-label="`Close ${t.name}`" @click.stop="$emit('close', t)">
        <span class="dot" aria-hidden="true">●</span>
        <span class="cross" aria-hidden="true">✕</span>
      </button>
    </div>
    <button class="add" aria-label="New tab" title="New file" @click="$emit('new')">＋</button>
  </nav>
</template>

<style scoped>
.tabbar {
  display: flex;
  align-items: flex-end;
  gap: 0.15rem;
  overflow-x: auto;
  scrollbar-width: thin;
  padding: 0 0.5rem;
  border-bottom: 1px solid var(--border);
}

.tab {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  max-width: 15rem;
  height: 2.1rem;
  padding: 0 0.3rem 0 0.75rem;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 0.45rem 0.45rem 0 0;
  color: var(--text-muted);
  font-size: 0.84rem;
  cursor: pointer;
  user-select: none;
  position: relative;
  top: 1px;
}
.tab:hover {
  color: var(--text);
  background: var(--bg-elev);
}
.tab.active {
  color: var(--text);
  background: var(--bg-elev);
  border-color: var(--border);
  box-shadow: inset 0 2px 0 var(--accent-blue);
}
.tab:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: -2px;
}
.tab.unlinked .name {
  font-style: italic;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mark.warn {
  color: var(--warn);
  font-size: 0.8rem;
}

.x {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border: 0;
  border-radius: 0.3rem;
  background: none;
  color: var(--text-muted);
  font-size: 0.72rem;
}
.x:hover {
  background: var(--bg-elev-2);
  color: var(--text);
}
.x .dot {
  display: none;
  color: var(--warn);
  font-size: 0.7rem;
}
/* Unsaved: amber dot in place of the ✕, which comes back on hover. */
.tab.dirty .x .dot {
  display: block;
}
.tab.dirty .x .cross {
  display: none;
}
.tab.dirty .x:hover .dot {
  display: none;
}
.tab.dirty .x:hover .cross {
  display: block;
}
.x .dot,
.x .cross {
  grid-area: 1 / 1;
}

.add {
  flex: 0 0 auto;
  align-self: center;
  width: 1.8rem;
  height: 1.8rem;
  margin-left: 0.2rem;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  background: none;
  color: var(--text-muted);
  font-size: 1rem;
}
.add:hover {
  color: var(--text);
  border-color: var(--border-strong);
  background: var(--bg-elev);
}
</style>
