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
  <div class="tabbar-wrap">
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
  </div>
</template>

<style scoped>
/* Liquid-glass tab track (tokens in vars.css): a frosted pill holding the
   tabs; the active tab is a raised, accent-tinted glass bubble. */
.tabbar-wrap {
  padding: 0.15rem 0.5rem 0.35rem;
}

.tabbar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 0.3rem;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg);
  box-shadow: var(--glass-edge), var(--glass-shadow);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
.tabbar::-webkit-scrollbar {
  display: none;
}

.tab {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  max-width: 15rem;
  height: 2rem;
  padding: 0 0.3rem 0 0.85rem;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 0.84rem;
  cursor: pointer;
  user-select: none;
  transition:
    background 0.2s,
    color 0.2s,
    box-shadow 0.2s,
    transform 0.2s;
}
.tab:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
}
.tab.active {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent-blue) 45%, var(--glass-border-hover));
  background:
    radial-gradient(120% 140% at 50% 0%, rgba(255, 255, 255, 0.22), transparent 60%),
    linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 42%, transparent), color-mix(in srgb, var(--accent-blue) 20%, transparent));
  box-shadow:
    var(--glass-edge),
    0 6px 16px rgba(0, 0, 0, 0.4),
    0 0 18px color-mix(in srgb, var(--accent-blue) 30%, transparent);
  transform: translateY(-1px);
}
.tab:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 1px;
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
  width: 1.4rem;
  height: 1.4rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  font-size: 0.7rem;
}
.x:hover {
  background: rgba(255, 255, 255, 0.14);
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
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  margin-left: 0.15rem;
  padding: 0;
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  background: var(--glass-bg);
  box-shadow: var(--glass-edge);
  color: var(--text-muted);
  font-size: 1rem;
  transition:
    background 0.18s,
    color 0.18s,
    transform 0.12s;
}
.add:hover {
  color: var(--text);
  background: var(--glass-bg-hover);
  border-color: var(--glass-border-hover);
}
.add:active {
  transform: scale(0.94);
}
</style>
