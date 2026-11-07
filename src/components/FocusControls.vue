<script setup lang="ts">
import { computed } from 'vue'
import UiButton from './ui/UiButton.vue'
import { ChevronDown, ChevronRight, Eye, EyeOff } from '@lucide/vue'
import {
  focusSettings as s,
  DISTANCE_RANGE,
  SLIDER_STEPS,
  decayToSlider,
  sliderToDecay,
} from '../lib/focus/settings'
import type { Scale } from '../lib/focus/segment'

// The focus controls, under the preview's header. A focal point sits DISTANCE
// units behind the cursor and emits an attention field that decays with
// distance (DECAY, in words); the units holding 60% of the attention are in
// focus and underlined in the preview. Decay is remembered per scale, so each
// scale can be tuned on its own. Opening or closing this panel only shows or
// hides the controls; the On / Off switch decides whether the focus runs.

const props = defineProps<{ supported: boolean; count: number }>()

const scales: { value: Scale; label: string; one: string; many: string }[] = [
  { value: 'word', label: 'Words', one: 'word', many: 'words' },
  { value: 'sentence', label: 'Sentences', one: 'sentence', many: 'sentences' },
  { value: 'paragraph', label: 'Paragraphs', one: 'paragraph', many: 'paragraphs' },
  { value: 'section', label: 'Sections', one: 'section', many: 'sections' },
]
const current = computed(() => scales.find((x) => x.value === s.scale) ?? scales[1])

/** The decay slider is logarithmic: its position maps to σ in words for the current scale. */
const decayPos = computed({
  get: () => decayToSlider(s.scale, s.decay[s.scale]),
  set: (p: number) => {
    s.decay[s.scale] = sliderToDecay(s.scale, p)
  },
})

const countLabel = computed(() =>
  s.enabled ? `${props.count} ${props.count === 1 ? current.value.one : current.value.many} in focus` : 'Off',
)
</script>

<template>
  <div class="focus-bar" role="group" aria-label="Focus">
    <UiButton
      size="tag"
      :icon-right="s.panel ? ChevronDown : ChevronRight"
      :aria-expanded="s.panel"
      :title="s.panel ? 'Hide the focus controls (the focus keeps running)' : 'Show the focus controls'"
      @click="s.panel = !s.panel"
    >
      Focus
    </UiButton>

    <template v-if="s.panel">
      <UiButton
        size="tag"
        :active="s.enabled"
        :aria-pressed="s.enabled"
        :icon-left="s.enabled ? Eye : EyeOff"
        :title="s.enabled ? 'Turn the focus off' : 'Turn the focus on'"
        @click="s.enabled = !s.enabled"
      >
        {{ s.enabled ? 'On' : 'Off' }}
      </UiButton>

      <label class="field">
        <span class="sr">Scale</span>
        <select id="focus-scale" v-model="s.scale" title="Which scale is underlined">
          <option v-for="o in scales" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>

      <label class="field slider" :title="`How slowly attention fades with distance, in words (remembered for ${current.label})`">
        <span class="name">Decay</span>
        <input id="focus-decay" v-model.number="decayPos" type="range" min="0" :max="SLIDER_STEPS" step="1" />
        <span class="val">{{ s.decay[s.scale] }}<span class="unit">w</span></span>
      </label>

      <label class="field slider" :title="`How many ${current.many} the focal point sits behind the cursor`">
        <span class="name">Distance</span>
        <input
          id="focus-distance"
          v-model.number="s.distance"
          type="range"
          :min="DISTANCE_RANGE.min"
          :max="DISTANCE_RANGE.max"
          step="1"
        />
        <span class="val">{{ s.distance }}</span>
      </label>
    </template>

    <span class="count" aria-live="polite">{{ countLabel }}</span>
    <span v-if="s.panel && !supported" class="note">This browser can't draw the underline.</span>
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
  min-width: 0;
  max-width: 100%;
}

select {
  height: 1.3rem;
  padding: 0 0.35rem;
  border: 1px solid var(--btn-border);
  border-radius: var(--btn-radius);
  background: var(--btn-bg);
  color: var(--btn-text);
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
  min-width: 3rem;
  flex: 0 1 auto;
  accent-color: var(--paper-text);
  cursor: pointer;
}
.slider .val {
  min-width: 2.6em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--paper-text);
}

.note {
  font-style: italic;
}
.count {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--paper-text);
  white-space: nowrap;
}
.unit {
  margin-left: 0.1em;
  color: var(--paper-muted);
  font-weight: 400;
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
