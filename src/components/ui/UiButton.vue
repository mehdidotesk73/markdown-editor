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
.ui-btn {
  /* The light the glass is lit with: hue, saturation, lightness. */
  --h: 222;
  --s: 30%;
  --l: 84%;
  --fill: 0.07; /* how much of that light tints the body */
  --c: hsl(var(--h) calc(var(--s) * 0.6) 90% / 0.9);

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
  text-shadow:
    0 0.05em 0.05em rgba(0, 0, 0, 0.45),
    0 -0.03em 0 rgba(255, 255, 255, 0.08);

  background-color: hsl(var(--h) var(--s) var(--body, 55%) / var(--fill));
  background-image: linear-gradient(hsl(0 0% 100% / 0.13), hsl(0 0% 100% / 0.02) 55%, hsl(0 0% 0% / 0.12));
  backdrop-filter: blur(12px) saturate(170%);
  -webkit-backdrop-filter: blur(12px) saturate(170%);
  box-shadow:
    /* hairline rim */
    0 0 0 0.06em hsl(var(--h) var(--s) var(--l) / 0.28),
    /* lit top edge, inside */
    0 0.12em 0.2em -0.02em hsl(0 0% 100% / 0.38) inset,
    0 -0.03em 0.15em hsl(var(--h) var(--s) var(--l) / 0.28) inset,
    /* glow pooling at the bottom, inside */
    0 -0.35em 0.9em -0.2em hsl(var(--h) var(--s) var(--l) / 0.22) inset,
    /* depth */
    0 -0.1em 0.25em rgba(0, 0, 0, 0.18),
    0 0.55em 1em -0.25em rgba(0, 0, 0, 0.55);
  transition:
    box-shadow 0.25s ease,
    background-color 0.25s ease,
    color 0.25s ease,
    translate 0.15s ease,
    backdrop-filter 0.25s ease;
}

/* Glow cast on the surface just below the button. */
.ui-btn::before {
  content: '';
  position: absolute;
  z-index: -1;
  top: 88%;
  left: 12%;
  width: 76%;
  height: 1.1em;
  border-radius: 50%;
  background: radial-gradient(closest-side, hsl(var(--h) var(--s) var(--l) / 0.28), hsl(var(--h) var(--s) var(--l) / 0));
  opacity: 0.55;
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
    hsl(0 0% 100% / 0.16) 22%,
    hsl(0 0% 100% / 0.16) 31%,
    transparent 31%,
    transparent 34%,
    hsl(0 0% 100% / 0.1) 34%,
    hsl(0 0% 100% / 0.1) 38%,
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
  --c: hsl(var(--h) calc(var(--s) * 0.6) 96% / 1);
  background-color: hsl(var(--h) var(--s) 58% / calc(var(--fill) + 0.06));
  box-shadow:
    0 0 0 0.06em hsl(var(--h) var(--s) var(--l) / 0.45),
    0 0.12em 0.2em -0.02em hsl(0 0% 100% / 0.5) inset,
    0 -0.03em 0.15em hsl(var(--h) var(--s) var(--l) / 0.4) inset,
    0 -0.4em 1em -0.2em hsl(var(--h) var(--s) var(--l) / 0.32) inset,
    0 -0.1em 0.25em rgba(0, 0, 0, 0.18),
    0 0.6em 1.2em -0.25em rgba(0, 0, 0, 0.6),
    0 0 1em -0.2em hsl(var(--h) var(--s) var(--l) / 0.3);
}
.ui-btn:not(:disabled):hover::before {
  opacity: 1;
}
.ui-btn:not(:disabled):hover::after {
  background-position: -45% 0;
}

/* Pressed: sinks a little, the inner light tightens. */
.ui-btn:not(:disabled):active {
  translate: 0 0.08em;
  backdrop-filter: blur(6px) saturate(170%);
  -webkit-backdrop-filter: blur(6px) saturate(170%);
  box-shadow:
    0 0 0 0.06em hsl(var(--h) var(--s) var(--l) / 0.45),
    0 0.15em 0.3em hsl(0 0% 0% / 0.3) inset,
    0 -0.3em 0.8em -0.2em hsl(var(--h) var(--s) var(--l) / 0.35) inset,
    0 0.25em 0.5em -0.15em rgba(0, 0, 0, 0.5);
}

.ui-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.ui-btn:focus-visible {
  outline: 2px solid hsl(186 80% 72%);
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

/* tones: the hue the glass is lit with */

/* Primary (and toggles that are on): a drop of pale, milky aqua glass with a
   glossy band across the top and light pooling at the bottom — the same
   material as the tab bar's bubble. Dark text, like ink seen through it. */
.t-primary,
.t-neutral.active {
  --h: 186;
  --s: 78%;
  --l: 74%;
  --c: hsl(196 62% 20%);
  text-shadow: 0 1px 0 hsl(0 0% 100% / 0.55);
  background-color: transparent;
  background-image:
    radial-gradient(90% 60% at 50% 6%, hsl(0 0% 100% / 0.85), hsl(0 0% 100% / 0) 70%),
    linear-gradient(180deg, hsl(188 70% 95% / 0.92), hsl(190 72% 84% / 0.86) 55%, hsl(186 78% 74% / 0.9));
  box-shadow:
    0 0 0 0.06em hsl(190 60% 92% / 0.85),
    0 0.06em 0.06em hsl(0 0% 100% / 0.9) inset,
    0 -0.4em 0.75em -0.25em hsl(180 85% 60% / 0.75) inset,
    0 0.2em 0.4em -0.1em hsl(0 0% 100% / 0.5) inset,
    0 0.55em 1em -0.3em rgba(0, 0, 0, 0.6),
    0 0 1.2em -0.2em hsl(185 90% 75% / 0.3);
}
.t-primary:not(:disabled):hover,
.t-neutral.active:not(:disabled):hover {
  --c: hsl(196 70% 14%);
  background-color: transparent;
  background-image:
    radial-gradient(90% 60% at 50% 6%, hsl(0 0% 100% / 0.95), hsl(0 0% 100% / 0) 70%),
    linear-gradient(180deg, hsl(186 80% 96% / 0.96), hsl(188 80% 86% / 0.92) 55%, hsl(184 85% 72% / 0.95));
  box-shadow:
    0 0 0 0.06em hsl(188 80% 94% / 0.95),
    0 0.06em 0.06em hsl(0 0% 100% / 1) inset,
    0 -0.45em 0.8em -0.25em hsl(180 90% 58% / 0.85) inset,
    0 0.2em 0.4em -0.1em hsl(0 0% 100% / 0.6) inset,
    0 0.6em 1.2em -0.3em rgba(0, 0, 0, 0.6),
    0 0 1.4em -0.1em hsl(185 90% 75% / 0.45);
}
.t-primary:not(:disabled):active,
.t-neutral.active:not(:disabled):active {
  box-shadow:
    0 0 0 0.06em hsl(188 80% 94% / 0.95),
    0 0.12em 0.25em hsl(196 60% 20% / 0.3) inset,
    0 -0.35em 0.7em -0.25em hsl(180 90% 58% / 0.8) inset,
    0 0.25em 0.5em -0.15em rgba(0, 0, 0, 0.5);
}
/* the streak reads darker on pale glass */
.t-primary::after,
.t-neutral.active::after {
  mix-blend-mode: soft-light;
  filter: brightness(1.6);
}
.t-ok {
  --h: 158;
  --s: 64%;
  --l: 62%;
  --fill: 0.16;
  --c: hsl(158 70% 72%);
}
.t-attention {
  --h: 40;
  --s: 100%;
  --l: 60%;
  --body: 50%;
  --fill: 0.24;
  --c: hsl(42 100% 64%);
}
.t-danger {
  --h: 0;
  --s: 90%;
  --l: 72%;
  --fill: 0.16;
  --c: hsl(0 90% 78%);
}
.t-ok:not(:disabled):hover,
.t-attention:not(:disabled):hover,
.t-danger:not(:disabled):hover {
  --c: hsl(var(--h) var(--s) 82%);
}

@media (prefers-reduced-motion: reduce) {
  .ui-btn::after {
    display: none;
  }
}
</style>
