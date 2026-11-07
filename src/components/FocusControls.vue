<script setup lang="ts">
import UiButton from './ui/UiButton.vue'
import { focusSettings as s, INTENSITY_RANGE, DISTANCE_RANGE } from '../lib/focus/settings'
import type { Scale } from '../lib/focus/segment'

// The focus shadow's controls, under the preview's header. The shadow trails
// the cursor; it underlines, in the preview, the run of words / sentences /
// paragraphs / sections held in focus around it.

defineProps<{ supported: boolean }>()

const scales: { value: Scale; label: string }[] = [
  { value: 'word', label: 'Words' },
  { value: 'sentence', label: 'Sentences' },
  { value: 'paragraph', label: 'Paragraphs' },
  { value: 'section', label: 'Sections' },
]
</script>

<template>
  <div class="focus-bar" role="group" aria-label="Focus shadow">
    <UiButton
      size="tag"
      :active="s.enabled"
      :title="s.enabled ? 'Hide the focus shadow' : 'Show the focus shadow'"
      @click="s.enabled = !s.enabled"
    >
      Shadow
    </UiButton>

    <template v-if="s.enabled">
      <label class="field">
        <span class="sr">Scale</span>
        <select v-model="s.scale" title="Which scale the shadow underlines">
          <option v-for="o in scales" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>

      <label class="field">
        <span class="sr">Length</span>
        <select
          v-model="s.mode"
          title="How paragraph and section lengths count: Linear = in words; Nested = paragraphs in sentences, sections in paragraphs"
        >
          <option value="linear">Linear</option>
          <option value="nested">Nested</option>
        </select>
      </label>

      <label class="field slider" title="How far the focus spreads, in words">
        <span class="name">Intensity</span>
        <input v-model.number="s.intensity" type="range" :min="INTENSITY_RANGE.min" :max="INTENSITY_RANGE.max" step="1" />
        <span class="val">{{ s.intensity }}</span>
      </label>

      <label class="field slider" title="How many words the shadow trails behind the cursor">
        <span class="name">Distance</span>
        <input v-model.number="s.distance" type="range" :min="DISTANCE_RANGE.min" :max="DISTANCE_RANGE.max" step="1" />
        <span class="val">{{ s.distance }}</span>
      </label>

      <span v-if="!supported" class="note">This browser can't draw the underline.</span>
    </template>
  </div>
</template>

<style scoped>
.focus-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
  padding: 0.4rem 0.8rem;
  border-bottom: 1px solid var(--paper-border);
  background: var(--paper-head);
  font-size: 0.74rem;
  color: var(--paper-muted);
}

.field {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

select {
  height: 1.6rem;
  padding: 0 0.5rem;
  border: 1px solid var(--paper-border);
  border-radius: 999px;
  background: var(--paper-bg);
  color: var(--paper-text);
  font: inherit;
  font-size: 0.74rem;
  cursor: pointer;
}
select:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 1px;
}

.slider .name {
  font-weight: 600;
  letter-spacing: 0.02em;
}
.slider input {
  width: 7.5rem;
  accent-color: var(--paper-text);
  cursor: pointer;
}
.slider .val {
  min-width: 1.8em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--paper-text);
}

.note {
  font-style: italic;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
