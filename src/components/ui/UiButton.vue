<script setup lang="ts">
// The app's one button — every button in the chrome goes through it, so they
// all share the liquid-glass look (translucent, frosted, lit top edge) and
// size their icon and label together.
//   size  tag      — footer pills: View logs, Reload latest, Copy log
//         compact  — top bar + pane controls
//         regular  — the default
//         large    — empty-state actions
//   tone  neutral, primary (blue: the action), ok (green), attention (amber), danger (red)
//         — tones tint the glass rather than fill it
//   active  — on / selected (toggles): lit with the accent
// An `icon` with no label makes a round button; give it an aria-label.
withDefaults(
  defineProps<{
    size?: 'tag' | 'compact' | 'regular' | 'large'
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
  /* --k: the tint (accent) mixed into the glass; --c: text colour */
  --k: transparent;
  --c: var(--text);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35em;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background:
    linear-gradient(0deg, color-mix(in srgb, var(--k) 22%, transparent), color-mix(in srgb, var(--k) 22%, transparent)),
    var(--glass-bg);
  box-shadow: var(--glass-edge), var(--glass-shadow);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  color: var(--c);
  font-family: inherit;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.18s,
    border-color 0.18s,
    box-shadow 0.18s,
    color 0.18s,
    transform 0.12s;
}
.ui-btn:not(:disabled):hover {
  background:
    linear-gradient(0deg, color-mix(in srgb, var(--k) 30%, transparent), color-mix(in srgb, var(--k) 30%, transparent)),
    var(--glass-bg-hover);
  border-color: var(--glass-border-hover);
  box-shadow:
    var(--glass-edge),
    var(--glass-shadow),
    0 0 0 3px color-mix(in srgb, var(--k) 18%, transparent);
}
.ui-btn:not(:disabled):active {
  transform: scale(0.96);
}
.ui-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.ui-btn:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}
.glyph {
  font-size: 1.2em;
  line-height: 1;
}

/* sizes */
.sz-tag {
  height: 1.55rem;
  padding: 0 0.6rem;
  font-size: 0.7rem;
  font-weight: 550;
}
.sz-compact {
  height: 2rem;
  padding: 0 0.8rem;
  font-size: 0.8rem;
}
.sz-regular {
  height: 2.4rem;
  padding: 0 0.95rem;
  font-size: 0.9rem;
}
.sz-large {
  height: 2.9rem;
  padding: 0 1.25rem;
  font-size: 1.02rem;
}
.square {
  padding: 0;
  aspect-ratio: 1;
}

/* tones: tint the glass, colour the label */
.t-neutral {
  --c: color-mix(in srgb, var(--text) 82%, transparent);
}
.t-neutral:not(:disabled):hover,
.t-neutral.active {
  --c: var(--text);
}
.t-neutral.active,
.t-primary {
  --k: var(--accent-blue);
}
.t-primary {
  --c: var(--on-accent);
  border-color: color-mix(in srgb, var(--accent-blue) 55%, var(--glass-border));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 78%, white 6%), color-mix(in srgb, var(--accent-blue) 58%, transparent)),
    var(--glass-bg);
  box-shadow:
    var(--glass-edge),
    0 6px 20px color-mix(in srgb, var(--accent-blue) 30%, transparent);
}
.t-primary:not(:disabled):hover {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 88%, white 10%), color-mix(in srgb, var(--accent-blue) 68%, transparent)),
    var(--glass-bg-hover);
  border-color: color-mix(in srgb, var(--accent-blue) 70%, white 20%);
}
.t-ok {
  --k: var(--ok);
  --c: var(--ok);
}
.t-attention {
  --k: var(--warn);
  --c: var(--warn);
}
.t-danger {
  --k: var(--danger);
  --c: var(--danger);
}
.t-ok,
.t-attention,
.t-danger {
  border-color: color-mix(in srgb, var(--k) 40%, var(--glass-border));
}
</style>
