<script setup lang="ts">
// The app's button (after PowerGIS's UiButton): one component so every button
// sizes its icon and label together.
//   size  compact — toolbar / pane controls;  regular — the default;  large — empty-state actions
//   tone  neutral, primary (blue: the action), ok (green), attention (amber), danger (red)
// An `icon` with no label makes a square button; give it an aria-label.
withDefaults(
  defineProps<{
    size?: 'compact' | 'regular' | 'large'
    tone?: 'neutral' | 'primary' | 'ok' | 'attention' | 'danger'
    icon?: string
    active?: boolean
    type?: 'button' | 'submit'
  }>(),
  { size: 'regular', tone: 'neutral', type: 'button' },
)
defineSlots<{ default?(): unknown }>()
</script>

<template>
  <button
    :type="type"
    class="ui-btn"
    :class="[`sz-${size}`, `t-${tone}`, { active, square: !!icon && !$slots.default }]"
  >
    <span v-if="icon" class="glyph" aria-hidden="true">{{ icon }}</span>
    <span v-if="$slots.default" class="label"><slot /></span>
  </button>
</template>

<style scoped>
.ui-btn {
  --c: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35em;
  border: 1px solid var(--border-strong);
  background: var(--bg-elev-2);
  color: var(--c);
  font-family: inherit;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.12s,
    background 0.12s,
    color 0.12s;
}
.ui-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.ui-btn:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 1px;
}
.glyph {
  font-size: 1.2em;
  line-height: 1;
}

.sz-compact {
  height: 1.9rem;
  padding: 0 0.55rem;
  border-radius: 0.4rem;
  font-size: 0.8rem;
}
.sz-regular {
  height: 2.3rem;
  padding: 0 0.75rem;
  border-radius: 0.45rem;
  font-size: 0.9rem;
}
.sz-large {
  height: 2.8rem;
  padding: 0 1rem;
  border-radius: 0.55rem;
  font-size: 1.02rem;
}
.square {
  padding: 0;
  aspect-ratio: 1;
}

.t-neutral {
  --c: var(--text-muted);
}
.t-neutral:not(:disabled):hover,
.t-neutral.active {
  --c: var(--text);
  border-color: var(--accent-blue);
}
.t-primary {
  border-color: var(--accent-blue);
  background: var(--accent-blue);
  --c: var(--on-accent);
}
.t-primary:not(:disabled):hover {
  background: color-mix(in srgb, var(--accent-blue) 85%, white);
}
.t-ok {
  --k: var(--ok);
}
.t-attention {
  --k: var(--warn);
}
.t-danger {
  --k: var(--danger);
}
.t-ok,
.t-attention,
.t-danger {
  --c: var(--k);
  border-color: color-mix(in srgb, var(--k) 55%, var(--border-strong));
}
.t-ok:not(:disabled):hover,
.t-attention:not(:disabled):hover,
.t-danger:not(:disabled):hover {
  background: color-mix(in srgb, var(--k) 16%, var(--bg-elev-2));
  border-color: var(--k);
}
</style>
