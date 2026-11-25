<script setup lang="ts">
// The app's slider: a thin hairline track, the filled part in the text colour,
// a small round thumb, and the value printed beside it. Low profile, so it
// fits in a pane header. Colours are tokens, so every look applies.
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min: number
    max: number
    step?: number
    /** Shown beside the track, e.g. "125%". Defaults to the value. */
    display?: string
    /** Double-click the value to return to this. */
    reset?: number
    label: string
  }>(),
  { step: 1, display: undefined, reset: undefined },
)
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()

const pct = computed(() => ((props.modelValue - props.min) / (props.max - props.min)) * 100)
const onInput = (e: Event) => emit('update:modelValue', Number((e.target as HTMLInputElement).value))
const onReset = () => props.reset !== undefined && emit('update:modelValue', props.reset)
</script>

<template>
  <span class="ui-slider" :style="{ '--pct': `${pct}%` }">
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :aria-label="label"
      :aria-valuetext="display ?? String(modelValue)"
      @input="onInput"
    />
    <span
      class="value"
      :title="reset !== undefined ? `Double-click to reset to ${reset}` : undefined"
      @dblclick="onReset"
    >{{ display ?? modelValue }}</span>
  </span>
</template>

<style scoped>
.ui-slider {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}
input {
  -webkit-appearance: none;
  appearance: none;
  width: var(--slider-width, 3.25rem);
  min-width: 2rem;
  height: 1rem;
  margin: 0;
  background: transparent;
  cursor: pointer;
}
input:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
  border-radius: 2px;
}
/* Track: hairline, filled up to the thumb. */
input::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 3px;
  background: linear-gradient(to right, var(--btn-text) var(--pct), var(--btn-border) var(--pct));
}
input::-moz-range-track {
  height: 3px;
  border-radius: 3px;
  background: var(--btn-border);
}
input::-moz-range-progress {
  height: 3px;
  border-radius: 3px;
  background: var(--btn-text);
}
/* Thumb: a small disc with a ring of the pane's colour so it reads on the fill. */
input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4.5px;
  border-radius: 50%;
  background: var(--btn-text);
  border: 2px solid var(--paper-head, var(--btn-bg));
  box-shadow: 0 0 0 1px var(--btn-border);
  transition: transform 0.12s ease;
}
input::-moz-range-thumb {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--btn-text);
  border: 2px solid var(--paper-head, var(--btn-bg));
  box-shadow: 0 0 0 1px var(--btn-border);
}
input:hover::-webkit-slider-thumb,
input:active::-webkit-slider-thumb {
  transform: scale(1.15);
}
.value {
  min-width: 2.6rem;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: var(--paper-muted, var(--text));
  user-select: none;
}
@media (prefers-reduced-motion: reduce) {
  input::-webkit-slider-thumb {
    transition: none;
  }
}
</style>
