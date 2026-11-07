<script setup lang="ts">
// The app's one button. Every button in the chrome goes through it, so they all
// share one look: compact and matte — a flat, solid fill, a hairline border,
// small rounded corners. No gradients, blur, glow or sheen. Hover lifts the
// fill a shade; pressing darkens it.
//
//   size  tag      — footer pills: View logs, Reload latest, Copy log
//         compact  — top bar + pane controls
//         regular  — the default
//         large    — empty-state actions
//   tone  neutral, primary (the main action: a solid ink / sage fill),
//         ok (green text), attention (amber ● mark), danger (red text)
//   active  — on / selected (toggles): filled like primary
//
// Labels are text. Use `icon` only for plain Unicode marks that render as
// text everywhere (⇤ ⇥ ● ✕), never emoji: emoji render as pictures and
// clash with the matte look. An icon with no label makes a round button; give it an
// aria-label.
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
/* Matte: colours come from the --btn-* tokens in styles/vars.css, per theme.
   --c is the label colour; containers may set it (e.g. pane heads). */
.ui-btn {
  --c: var(--btn-text);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  border: 1px solid var(--btn-border);
  border-radius: var(--btn-radius);
  background: var(--btn-bg);
  color: var(--c);
  font-family: inherit;
  font-weight: 550;
  line-height: 1;
  letter-spacing: 0.005em;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}
.glyph {
  font-size: 1.1em;
  line-height: 1;
}

.ui-btn:not(:disabled):hover {
  background: var(--btn-bg-hover);
  border-color: var(--btn-border-hover);
}
.ui-btn:not(:disabled):active {
  background: var(--btn-bg-press);
}
.ui-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.ui-btn:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}

/* sizes — compact throughout */
.sz-tag {
  height: 1.3rem;
  padding: 0 0.5rem;
  font-size: 0.7rem;
}
.sz-compact {
  height: 1.55rem;
  padding: 0 0.6rem;
  font-size: 0.78rem;
}
.sz-regular {
  height: 1.8rem;
  padding: 0 0.8rem;
  font-size: 0.86rem;
}
.sz-large {
  height: 2.15rem;
  padding: 0 1.05rem;
  font-size: 0.95rem;
}
.square {
  padding: 0;
  aspect-ratio: 1;
}

/* tones */
/* Main action, and toggles that are on: a solid fill. */
.t-primary,
.t-neutral.active {
  --c: var(--btn-primary-text);
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-bg);
}
.t-primary:not(:disabled):hover,
.t-neutral.active:not(:disabled):hover {
  background: var(--btn-primary-hover);
  border-color: var(--btn-primary-hover);
}
.t-primary:not(:disabled):active,
.t-neutral.active:not(:disabled):active {
  background: var(--btn-primary-press);
}
.t-ok {
  --c: var(--ok);
}
/* Needs attention (unsaved): an ordinary button — only the ● mark is amber. */
.t-attention .glyph {
  color: var(--warn);
}
.t-danger {
  --c: var(--danger);
}
</style>
