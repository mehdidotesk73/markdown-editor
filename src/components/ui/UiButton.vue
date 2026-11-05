<script setup lang="ts">
// The app's one button. Every button in the chrome goes through it, so they all
// share the same "liquid glass" look: a translucent body lit by layered inner
// light (top edge, bottom glow), a soft glow cast on the surface below, and a
// light streak that sweeps across on hover. Pressing sinks it a little.
//
//   size  tag      — footer pills: View logs, Reload latest, Copy log
//         compact  — top bar + pane controls
//         regular  — the default
//         large    — empty-state actions
//   tone  neutral, primary (blue: the action), ok (green), attention (amber),
//         danger (red) — each sets the hue the glass is lit with
//   active  — on / selected (toggles): lit with the accent
//
// Labels are text. Use `icon` only for plain Unicode marks that render as
// text everywhere (⇤ ⇥ ● ✕), never emoji: emoji render as pictures and
// break the glass. An icon with no label makes a round button; give it an
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
/* Clear glass with internal light. The body is mostly see-through (the
   backdrop blurs through it), lightly tinted per tone. Light enters at the
   top — a specular highlight and a bright rim along the upper edge — and
   collects inside along the bottom edge, as it does in real glass.
   Per tone:  --tint   "H S% L%"  colour of the glass and its inner light
              --body   tint alpha of the body (0 = clear)
              --glow   alpha of the light collected at the bottom          */
.ui-btn {
  --tint: 30 20% 88%;
  --body: 0.05;
  --glow: 0.22;
  --spec: 0.42;
  --c: hsl(30 25% 96% / 0.92);

  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  border: 0;
  border-radius: 999px;
  color: var(--c);
  font-family: inherit;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);

  background:
    /* specular highlight across the top */
    radial-gradient(120% 75% at 50% -18%, hsl(0 0% 100% / var(--spec)), hsl(0 0% 100% / 0) 62%),
    /* light collected along the bottom */
    radial-gradient(95% 85% at 50% 128%, hsl(var(--tint) / var(--glow)), hsl(var(--tint) / 0) 62%),
    /* the (mostly clear) body */
    linear-gradient(180deg, hsl(var(--tint) / calc(var(--body) * 0.55)), hsl(var(--tint) / var(--body)));
  backdrop-filter: blur(14px) saturate(185%) brightness(1.1);
  -webkit-backdrop-filter: blur(14px) saturate(185%) brightness(1.1);
  box-shadow:
    /* rim: brightest along the top, catching light down the sides and bottom */
    inset 0 1px 0 hsl(0 0% 100% / 0.6),
    inset 1px 0 0 hsl(0 0% 100% / 0.16),
    inset -1px 0 0 hsl(0 0% 100% / 0.12),
    inset 0 -1px 0 hsl(var(--tint) / 0.38),
    /* internal glow rising from the bottom edge */
    inset 0 -0.55em 0.9em -0.45em hsl(var(--tint) / calc(var(--glow) * 1.4)),
    /* hairline outside, and depth */
    0 0 0 0.5px hsl(0 0% 100% / 0.22),
    0 0.6em 1.1em -0.4em rgba(0, 0, 0, 0.5);
  transition:
    box-shadow 0.25s ease,
    color 0.25s ease,
    translate 0.15s ease,
    --spec 0.25s ease,
    --glow 0.25s ease;
}

/* Light cast on the surface just below the button. */
.ui-btn::before {
  content: '';
  position: absolute;
  z-index: -1;
  top: 86%;
  left: 14%;
  width: 72%;
  height: 1.1em;
  border-radius: 50%;
  background: radial-gradient(closest-side, hsl(var(--tint) / 0.32), hsl(var(--tint) / 0));
  opacity: 0.5;
  filter: blur(2px);
  transition: opacity 0.25s ease;
  pointer-events: none;
}

/* A light streak, parked off to the right; it sweeps across on hover. */
.ui-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: linear-gradient(
    105deg,
    transparent 22%,
    hsl(0 0% 100% / 0.2) 22%,
    hsl(0 0% 100% / 0.2) 31%,
    transparent 31%,
    transparent 34%,
    hsl(0 0% 100% / 0.12) 34%,
    hsl(0 0% 100% / 0.12) 38%,
    transparent 38%
  );
  background-size: 400% 100%;
  background-position: 100% 0;
  transition: background-position 0.65s ease;
  pointer-events: none;
}

.label,
.glyph {
  position: relative;
  z-index: 1;
}
.glyph {
  font-size: 1.15em;
  line-height: 1;
}

.ui-btn:not(:disabled):hover {
  --spec: 0.58;
  --glow: calc(0.22 + 0.16);
  --c: #fff;
  box-shadow:
    inset 0 1px 0 hsl(0 0% 100% / 0.78),
    inset 1px 0 0 hsl(0 0% 100% / 0.22),
    inset -1px 0 0 hsl(0 0% 100% / 0.18),
    inset 0 -1px 0 hsl(var(--tint) / 0.55),
    inset 0 -0.6em 1em -0.45em hsl(var(--tint) / 0.6),
    0 0 0 0.5px hsl(0 0% 100% / 0.35),
    0 0.65em 1.2em -0.4em rgba(0, 0, 0, 0.55),
    0 0 1.1em -0.3em hsl(var(--tint) / 0.35);
}
.ui-btn:not(:disabled):hover::before {
  opacity: 1;
}
.ui-btn:not(:disabled):hover::after {
  background-position: -45% 0;
}

/* Pressed: sinks a little; the light inside tightens. */
.ui-btn:not(:disabled):active {
  translate: 0 0.08em;
  box-shadow:
    inset 0 1px 0 hsl(0 0% 100% / 0.4),
    inset 0 0.15em 0.35em hsl(0 0% 0% / 0.3),
    inset 0 -0.45em 0.8em -0.4em hsl(var(--tint) / 0.6),
    0 0 0 0.5px hsl(0 0% 100% / 0.3),
    0 0.25em 0.5em -0.15em rgba(0, 0, 0, 0.5);
}

.ui-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.ui-btn:focus-visible {
  outline: 2px solid var(--liquid-mint);
  outline-offset: 3px;
}

/* sizes */
.sz-tag {
  height: 1.6rem;
  padding: 0 0.7rem;
  font-size: 0.7rem;
  font-weight: 550;
}
.sz-compact {
  height: 2.05rem;
  padding: 0 0.95rem;
  font-size: 0.8rem;
}
.sz-regular {
  height: 2.45rem;
  padding: 0 1.1rem;
  font-size: 0.9rem;
}
.sz-large {
  height: 3rem;
  padding: 0 1.5rem;
  font-size: 1.02rem;
}
.square {
  padding: 0;
  aspect-ratio: 1;
}

/* tones */
/* Main action / toggles that are on: teal-tinted glass, mint light inside. */
.t-primary,
.t-neutral.active {
  --tint: 164 62% 56%;
  --body: 0.34;
  --glow: 0.6;
  --c: #fff;
}
.t-primary:not(:disabled):hover,
.t-neutral.active:not(:disabled):hover {
  --glow: 0.78;
}
.t-ok {
  --tint: 158 64% 60%;
  --body: 0.14;
  --glow: 0.4;
  --c: hsl(158 75% 76%);
}
.t-attention {
  --tint: 40 100% 60%;
  --body: 0.16;
  --glow: 0.42;
  --c: hsl(42 100% 68%);
}
.t-danger {
  --tint: 0 90% 66%;
  --body: 0.16;
  --glow: 0.42;
  --c: hsl(0 90% 80%);
}

@media (prefers-reduced-motion: reduce) {
  .ui-btn::after {
    display: none;
  }
}
</style>
