<script setup>
// A run that stopped before writing to ask Keith for his angle (docs/blog-admin-plan.md,
// stage 9): his idea, what the research found, the angles it suggests and its questions.
// Write it starts the writing with his answers, reusing the research. Let the AI choose writes
// now with its own pick, and asks on the draft whether it got his view right.
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api.js';
import { PALETTE } from '../site.js';
import ModelPicker from './ModelPicker.vue';

const props = defineProps({
  postId: { type: String, required: true },
  ask: { type: Object, required: true },
  notes: { type: String, default: '' },
  categories: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['answer']);

const angle = ref(null);
const own = ref('');
const replies = reactive({});
const choice = ref({});

const ownPicked = computed(() => angle.value === 'own');
const ready = computed(() => (ownPicked.value ? !!own.value.trim() : angle.value !== null));

function category(id) {
  const found = props.categories.find((entry) => entry.id === id);
  const color = PALETTE[found?.color] ?? '#a3acb9';
  return { name: found?.name ?? id, style: { color, background: `color-mix(in srgb, ${color} 12%, transparent)` } };
}

/** The idea's text with its links made clickable. */
const idea = computed(() =>
  props.notes
    .trim()
    .split(/(https?:\/\/[^\s)]+)/)
    .filter(Boolean)
    .map((part) => (/^https?:\/\//.test(part) ? { href: part, text: part.replace(/^https?:\/\/(www\.)?/, '') } : { text: part })),
);

// What the research found, from the run's notes
const evidence = ref(null);
onMounted(async () => {
  try {
    evidence.value = (await api(`/posts/${props.postId}/ai`)).brief?.evidence ?? [];
  } catch {
    evidence.value = [];
  }
});
const verified = computed(() => evidence.value?.filter((item) => item.status === 'verified').length ?? 0);
const isUrl = (source) => /^https?:\/\//.test(source);
// Worked out here because templates can't see the browser's URL: using it there blanked the panel
const host = (source) => {
  try {
    return new URL(source).hostname;
  } catch {
    return source;
  }
};

function pick(option, question) {
  replies[question.id] = replies[question.id] === option ? '' : option;
}

function write() {
  emit('answer', {
    answers: { angle: ownPicked.value ? null : angle.value, own: ownPicked.value ? own.value : '', replies: { ...replies } },
    choice: choice.value,
  });
}

const choose = () => emit('answer', { answers: { choose: true, replies: { ...replies } }, choice: choice.value });
</script>

<template>
  <div class="ask-page">
    <section class="card lead">
      <h2 class="hd">Your angle, before it writes</h2>
      <p>{{ ask.why }}</p>
      <p class="sec">So the AI stopped here rather than guess. Pick an angle, answer whatever else you like, and it writes the post. You get a notification when the draft is ready.</p>
    </section>

    <details class="card fold" open>
      <summary>Your idea</summary>
      <p class="idea"><template v-for="(part, index) in idea" :key="index"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></p>
    </details>

    <details class="card fold">
      <summary>What it found<span v-if="evidence" class="muted">{{ evidence.length }} {{ evidence.length === 1 ? 'source' : 'sources' }}, {{ verified }} verified</span></summary>
      <ul class="evidence">
        <li v-for="(item, index) in evidence ?? []" :key="index">
          <span class="chip" :class="item.status === 'verified' ? 'ok' : 'maybe'">{{ item.status }}</span>
          {{ item.claim }}
          <a v-if="isUrl(item.source)" :href="item.source" target="_blank" rel="noopener">{{ host(item.source) }}</a>
          <span v-else class="muted">({{ item.source }})</span>
        </li>
      </ul>
    </details>

    <section class="card question" aria-labelledby="ask-angle">
      <h2 id="ask-angle" class="hd">What's your angle?</h2>
      <div role="radiogroup" aria-labelledby="ask-angle" class="angles">
        <button
          v-for="(option, index) in ask.angles"
          :key="index"
          type="button"
          role="radio"
          class="angle"
          :class="{ on: angle === index }"
          :aria-checked="angle === index"
          @click="angle = index"
        >
          <span class="dot" aria-hidden="true"></span>
          <span class="text">
            <span class="title"><strong>{{ option.title }}</strong><span class="chip" :style="category(option.category).style">{{ category(option.category).name }}</span></span>
            <span class="sec">{{ option.summary }}</span>
          </span>
        </button>
        <button type="button" role="radio" class="angle" :class="{ on: ownPicked }" :aria-checked="ownPicked" @click="angle = 'own'">
          <span class="dot" aria-hidden="true"></span>
          <span class="text"><strong>My own angle</strong><span class="sec">A line or two, and the AI builds the post around it.</span></span>
        </button>
      </div>
      <label v-if="ownPicked">
        <span class="label">Your angle</span>
        <textarea v-model="own" class="inp" rows="3" placeholder="Say it the way you'd say it to a friend"></textarea>
      </label>
    </section>

    <section v-for="question in ask.questions" :key="question.id" class="card question">
      <label :for="`ask-${question.id}`" class="hd q">{{ question.text }}</label>
      <span class="muted small">Optional. What you write counts as your own words.</span>
      <div v-if="question.options?.length" class="options">
        <button v-for="option in question.options" :key="option" type="button" class="option" :class="{ on: replies[question.id] === option }" :aria-pressed="replies[question.id] === option" @click="pick(option, question)">{{ option }}</button>
      </div>
      <textarea :id="`ask-${question.id}`" v-model="replies[question.id]" class="inp" rows="2" :placeholder="question.options?.length ? 'Or in your own words' : 'Your answer'"></textarea>
    </section>

    <section class="card go">
      <ModelPicker v-model="choice" kind="generate" />
      <p v-if="error" class="bad" role="alert">{{ error }}</p>
      <div class="buttons">
        <button type="button" class="btn btn-ai" :disabled="busy || !ready || !choice.model" @click="write">Write it</button>
        <button type="button" class="btn" :disabled="busy || !choice.model" @click="choose">Let the AI choose</button>
      </div>
      <p class="muted small">Write it reuses the research, so it costs less than a full run. Let the AI choose takes the angle it thinks is strongest, and asks you on the draft whether it got your view right.</p>
    </section>
  </div>
</template>

<style scoped>
.ask-page {
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
  padding: 20px 20px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lead {
  padding: 18px 20px;
  border-color: #4a4226;
  background: #17150f;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lead h2 {
  font-size: 21px;
}

.lead p {
  margin: 0;
}

.fold {
  padding: 0 18px;
}

.fold summary {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: 700;
  color: var(--text);
}

.fold summary .muted {
  font-weight: 400;
  font-size: 14px;
}

.idea {
  margin: 0 0 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.evidence {
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
}

.chip.ok {
  color: var(--green);
  background: rgba(140, 212, 156, 0.12);
}

.chip.maybe {
  color: var(--yellow);
  background: rgba(242, 204, 96, 0.12);
}

.question {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.question h2,
.q {
  font-size: 19px;
}

.angles {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.angle {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  width: 100%;
  min-height: 44px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--ground);
  color: var(--body);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.angle.on {
  border-color: var(--pink);
}

.dot {
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 50%;
  border: 2px solid #4e5665;
  flex: none;
}

.angle.on .dot {
  border-color: var(--pink);
  background: radial-gradient(circle, var(--pink) 0 5px, transparent 6px);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: 14px;
}

.text strong {
  color: var(--text);
  font-size: 16px;
}

.title {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.title .chip {
  height: 22px;
  font-size: 12px;
}

.label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
  margin-bottom: 6px;
}

.small {
  margin: 0;
  font-size: 14px;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option {
  flex: 1 1 140px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--ground);
  color: var(--secondary);
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}

.option.on {
  background: var(--line);
  border-color: #4e5665;
  color: var(--text);
}

.go {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.bad {
  color: var(--red);
  margin: 0;
}
</style>
