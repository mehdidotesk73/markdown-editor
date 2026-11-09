<script setup lang="ts">
import { computed } from 'vue'
import UiButton from './ui/UiButton.vue'
import { ChevronDown, ChevronUp, Eye, EyeOff } from '@lucide/vue'
import {
  focusSettings as s,
  LAG_RANGE,
  SLIDER_STEPS,
  decayToSlider,
  sliderToDecay,
} from '../lib/focus/settings'
import type { Scale } from '../lib/focus/segment'

// The focus control, at the right of the Preview header: one button showing
// the focus state (eye / crossed-out eye), the label and a chevron. It opens a
// dropdown panel over the preview with the on/off toggle, scale, decay, lag and
// the live count; the chevron closes it again (it stays open while you move
// the cursor, so you can tune by eye). A focal point follows the cursor's path
// LAG units behind (lag 0 = live) and emits an attention field that decays
// with distance (DECAY, in words); the units holding 60% of the attention are
// in focus and underlined in the preview. Decay is remembered per scale.

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
  <div class="focus" @keydown.esc="s.panel = false">
    <UiButton
      size="compact"
      :icon-left="s.enabled ? Eye : EyeOff"
      :icon-right="s.panel ? ChevronUp : ChevronDown"
      :aria-expanded="s.panel"
      aria-controls="focus-panel"
      :title="`Focus is ${s.enabled ? 'on' : 'off'}${s.enabled ? ` — ${countLabel}` : ''}. ${s.panel ? 'Close' : 'Open'} the focus settings.`"
      @click="s.panel = !s.panel"
    >
      Focus
    </UiButton>

    <div v-if="s.panel" id="focus-panel" class="panel" role="group" aria-label="Focus settings">
      <div class="row">
        <UiButton
          size="tag"
          :active="s.enabled"
          :aria-pressed="s.enabled"
          :icon-left="s.enabled ? Eye : EyeOff"
          :aria-label="s.enabled ? 'Focus on — turn off' : 'Focus off — turn on'"
          :title="s.enabled ? 'Turn the focus off' : 'Turn the focus on'"
          @click="s.enabled = !s.enabled"
        />
        <label class="field">
          <span class="sr">Scale</span>
          <select id="focus-scale" v-model="s.scale" title="Which scale is underlined">
            <option v-for="o in scales" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
        <span class="count" aria-live="polite">{{ countLabel }}</span>
      </div>

      <label class="slider" :title="`How slowly attention fades with distance, in words (remembered for ${current.label})`">
        <span class="name">Decay</span>
        <input id="focus-decay" v-model.number="decayPos" type="range" min="0" :max="SLIDER_STEPS" step="1" />
        <span class="val">{{ s.decay[s.scale] }}<span class="unit">w</span></span>
      </label>

      <label class="slider" :title="`The focus follows your cursor's path this many ${current.many} behind (0 = live)`">
        <span class="name">Lag</span>
        <input id="focus-lag" v-model.number="s.lag" type="range" :min="LAG_RANGE.min" :max="LAG_RANGE.max" step="1" />
        <span class="val">{{ s.lag }}</span>
      </label>

      <p v-if="!supported" class="note">This browser can't draw the underline.</p>
    </div>
  </div>
</template>

<style scoped>
/* The panel drops down over the preview, anchored to the preview pane (which is
   position: relative), right-aligned under the header. */
.focus {
  display: flex;
}

.panel {
  position: absolute;
  z-index: 5;
  top: calc(2.5rem + 0.3rem);
  right: 0.5rem;
  width: 18rem;
  max-width: calc(100% - 1rem);
  display: grid;
  gap: 0.55rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--paper-border);
  border-radius: var(--radius);
  background: var(--paper-head);
  box-shadow: 0 8px 24px rgba(var(--shadow-rgb), 0.28);
  font-size: 0.74rem;
  color: var(--paper-muted);
  container-type: inline-size;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.field {
  display: inline-flex;
  min-width: 0;
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

.slider {
  display: grid;
  grid-template-columns: 3.4rem minmax(0, 1fr) 2.8rem;
  align-items: center;
  gap: 0.5rem;
}
.slider .name {
  font-weight: 600;
  letter-spacing: 0.02em;
}
.slider input {
  width: 100%;
  min-width: 0;
  accent-color: var(--paper-text);
  cursor: pointer;
}
.slider .val {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--paper-text);
}
/* Narrow panel (phone): name and value on one line, the slider full width below. */
@container (max-width: 14rem) {
  .slider {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 0.15rem;
  }
  .slider input {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
.unit {
  margin-left: 0.1em;
  color: var(--paper-muted);
  font-weight: 400;
}

.count {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--paper-text);
  white-space: nowrap;
}
.note {
  margin: 0;
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
