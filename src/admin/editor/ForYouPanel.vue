<script setup>
// What the draft is waiting on from Keith (docs/blog-admin-plan.md, stage 9): the gaps the AI
// left for his own words, and its questions. A gap's text goes into the post word for word.
// Answers are part of the post, so they save as he types, and Revise with my answers sends
// them to the AI with any notes on passages and his changes to the notes for the AI.
import { computed, reactive } from 'vue';
import { findGaps } from '../../lib/post-checks.mjs';
import Icon from '../Icon.vue';
import ModelPicker from './ModelPicker.vue';

const props = defineProps({
  body: { type: String, required: true },
  locked: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  // Notes on passages waiting for the next revision, which go along too
  notes: { type: Number, default: 0 },
  // Whether the notes for the AI changed since a run last read them, which go along too
  notesChanged: { type: Boolean, default: false },
});
const emit = defineEmits(['fill', 'go', 'revise']);

const questions = defineModel('questions', { type: Array, required: true });
const choice = defineModel('choice', { type: Object, default: () => ({}) });

// Keyed by label, not line, so filling one gap doesn't lose what's typed in the next
const gaps = computed(() => {
  const seen = {};
  return findGaps(props.body).map((gap) => {
    seen[gap.label] = (seen[gap.label] ?? 0) + 1;
    return { ...gap, key: `${gap.label}#${seen[gap.label]}` };
  });
});
const drafts = reactive({});

function fill(gap) {
  emit('fill', { gap, text: drafts[gap.key] });
  delete drafts[gap.key];
}

const asked = computed(() => questions.value.filter((question) => !question.left));
const leftOut = computed(() => questions.value.filter((question) => question.left));
const ready = computed(() => questions.value.some((question) => question.answer.trim() || question.left));
const answered = computed(() => questions.value.filter((question) => question.answer.trim() && !question.left).length);
const sending = computed(() => {
  const parts = [`${answered.value} ${answered.value === 1 ? 'answer' : 'answers'}`];
  if (leftOut.value.length) parts.push(`${leftOut.value.length} left out`);
  if (props.notes) parts.push(`your ${props.notes} ${props.notes === 1 ? 'note' : 'notes'} on passages`);
  if (props.notesChanged) parts.push('your changes to the notes for the AI');
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
});
</script>

<template>
  <div class="foryou">
    <p class="sec intro">Only you can supply these, so the AI left them for you rather than make them up.</p>

    <section v-if="gaps.length" class="group" aria-labelledby="fy-gaps">
      <h2 id="fy-gaps" class="label">Gaps to fill ({{ gaps.length }})</h2>
      <p class="muted small">Publishing waits until they're filled. What you write goes into the post exactly as you type it.</p>
      <div v-for="gap in gaps" :key="gap.key" class="card item gap">
        <div class="top">
          <span class="chip yellow">Fill in</span>
          <strong>{{ gap.label }}</strong>
          <button type="button" class="where" @click="emit('go', gap.start)">Line {{ gap.start }}</button>
        </div>
        <label :for="`gap-${gap.key}`" class="sec">{{ gap.question }}</label>
        <textarea :id="`gap-${gap.key}`" v-model="drafts[gap.key]" class="inp" rows="3" placeholder="In your words" :readonly="locked"></textarea>
        <button type="button" class="btn put" :disabled="locked || !drafts[gap.key]?.trim()" @click="fill(gap)"><Icon name="check" />Put it in</button>
      </div>
    </section>

    <section v-if="questions.length" class="group" aria-labelledby="fy-questions">
      <h2 id="fy-questions" class="label">Questions ({{ asked.length }})</h2>
      <p class="muted small">Your answers save as you type. The AI takes them as your own words when you revise.</p>
      <div v-for="question in asked" :key="question.id" class="card item">
        <div class="top"><span class="chip pink">Question</span></div>
        <label :for="`q-${question.id}`" class="ask">{{ question.text }}</label>
        <textarea :id="`q-${question.id}`" v-model="question.answer" class="inp" rows="2" placeholder="Your answer" :readonly="locked"></textarea>
        <button type="button" class="link" :disabled="locked" @click="question.left = true">Leave it out</button>
      </div>
      <div v-for="question in leftOut" :key="question.id" class="left">
        <span class="muted">Left out: {{ question.text }}</span>
        <button type="button" class="link" :disabled="locked" @click="question.left = false">Answer after all</button>
      </div>

      <ModelPicker v-model="choice" kind="revise" :images="false" />
      <p v-if="error" class="bad" role="alert">{{ error }}</p>
      <button type="button" class="btn btn-ai go" :disabled="busy || locked || !ready || !choice.model" @click="emit('revise', { choice })">
        <Icon name="sparkles" />Revise with my answers
      </button>
      <p class="muted small">
        Sends {{ sending }}. You see every change before it's kept.
      </p>
    </section>

    <div v-if="!gaps.length && !questions.length" class="card passing"><Icon name="check" />Nothing is waiting for you.</div>
  </div>
</template>

<style scoped>
.foryou {
  padding: 18px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.intro,
.small {
  margin: 0;
  font-size: 14px;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.label {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
}

.item {
  padding: 14px 14px 12px;
  background: var(--ground);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
}

.gap {
  border-color: rgba(242, 204, 96, 0.35);
}

.top {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.top strong,
.ask {
  color: var(--text);
}

.ask {
  font-weight: 700;
}

.chip.yellow {
  color: var(--yellow);
  background: rgba(242, 204, 96, 0.12);
}

.chip.pink {
  color: var(--pink);
  background: rgba(242, 160, 214, 0.12);
}

.where,
.link {
  border: 0;
  background: none;
  padding: 4px 0;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--secondary);
  cursor: pointer;
}

.where {
  margin-left: auto;
}

.where:hover,
.link:hover:not(:disabled) {
  color: var(--text);
  text-decoration: underline;
}

.link {
  align-self: flex-start;
}

.put {
  align-self: flex-start;
  background: var(--yellow);
  border-color: var(--yellow);
  color: var(--ground);
}

.left {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  font-size: 14px;
}

.passing {
  padding: 14px 16px;
  display: flex;
  gap: 10px;
  align-items: center;
  color: var(--green);
}

.bad {
  color: var(--red);
  margin: 0;
}

.go {
  width: 100%;
}
</style>
