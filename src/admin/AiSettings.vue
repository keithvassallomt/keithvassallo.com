<script setup>
// Settings for the AI runs: the default model, which generations to offer, reasoning effort,
// the image model, the monthly cap and the rates for web searches and images
import { onMounted, ref } from 'vue';
import { api } from './api.js';
import { dollars, loadModels } from './models.js';

const data = ref(null);
const form = ref(null);
const newGeneration = ref('');
const message = ref('');
const failed = ref(false);
const saving = ref(false);

async function load(fresh = false) {
  data.value = await loadModels({ fresh });
  const { settings } = data.value;
  form.value = { ...settings, generations: [...settings.generations] };
}
onMounted(() => load().catch((error) => (message.value = error.message)));

function addGeneration() {
  const value = newGeneration.value.trim().toLowerCase();
  if (/^gpt-\d+(\.\d+)?$/.test(value) && !form.value.generations.includes(value)) form.value.generations.push(value);
  newGeneration.value = '';
}

const number = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

async function save() {
  saving.value = true;
  message.value = '';
  try {
    const { defaultModel, effort, imageModel, generations, cap, webSearchRate, imageRate } = form.value;
    await api('/settings/ai', {
      method: 'PUT',
      body: { defaultModel, effort, imageModel, generations, cap: number(cap), webSearchRate: number(webSearchRate), imageRate: number(imageRate) },
    });
    await load(true);
    failed.value = false;
    message.value = 'Saved.';
  } catch (error) {
    failed.value = true;
    message.value = error.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="card section">
    <h2 class="hd">AI models</h2>
    <p class="sec">From models.dev: OpenAI's models that reason, call tools and return structured output, newest of each tier in the generations you allow. The default is used for every run unless you pick another.</p>
    <p v-if="!form && !message" class="muted">Loading</p>
    <template v-if="form">
      <div class="generations">
        <span class="label">Allowed generations</span>
        <span v-for="(generation, index) in form.generations" :key="generation" class="chip mono gen">
          {{ generation }}<button type="button" :aria-label="`Remove ${generation}`" @click="form.generations.splice(index, 1)">×</button>
        </span>
        <input v-model="newGeneration" class="inp mono add" placeholder="gpt-7" aria-label="Add a generation" @keydown.enter.prevent="addGeneration" />
        <button type="button" class="btn small" @click="addGeneration">Add</button>
        <span v-if="data.newerGenerations.length" class="new">New on models.dev: {{ data.newerGenerations.join(', ') }}</span>
        <span v-else class="muted small-note">Nothing newer on models.dev yet</span>
      </div>

      <div class="models" role="radiogroup" aria-label="Default model">
        <div class="row heading muted"><span></span><span>Model</span><span class="num">Input</span><span class="num">Cached</span><span class="num">Output</span><span class="num">A run</span></div>
        <label v-for="model in data.models" :key="model.id" class="row" :class="{ on: form.defaultModel === model.id }">
          <input v-model="form.defaultModel" type="radio" :value="model.id" />
          <span class="mono">{{ model.id }}</span>
          <span class="num">${{ model.cost?.input }}</span>
          <span class="num">${{ model.cost?.cached }}</span>
          <span class="num">${{ model.cost?.output }}</span>
          <span class="num muted">{{ dollars(model.estimate?.generate) }}</span>
        </label>
      </div>
      <p class="muted small-note">Per million tokens. A run's estimate is a generated post, before web searches and the cover.</p>

      <div class="grid">
        <label><span class="label">Reasoning effort</span>
          <select v-model="form.effort" class="inp"><option v-for="effort in ['low', 'medium', 'high', 'xhigh', 'max']" :key="effort">{{ effort }}</option></select>
        </label>
        <label><span class="label">Image model</span>
          <select v-model="form.imageModel" class="inp"><option v-for="model in data.imageModels" :key="model">{{ model }}</option></select>
        </label>
        <label><span class="label">Monthly cap, dollars</span><input v-model="form.cap" class="inp" inputmode="decimal" placeholder="No cap" /></label>
        <label><span class="label">Web search, per 1,000</span><input v-model="form.webSearchRate" class="inp" inputmode="decimal" placeholder="OpenAI's rate" /></label>
        <label><span class="label">Cover image, each</span><input v-model="form.imageRate" class="inp" inputmode="decimal" placeholder="OpenAI's rate" /></label>
      </div>
      <p class="muted small-note">Once a month's runs reach the cap, new ones are refused until the 1st, the weekly one included. Without the two rates, run costs cover tokens only.</p>
      <div class="actions">
        <button type="button" class="btn btn-go" :disabled="saving" @click="save">Save</button>
      </div>
    </template>
    <p v-if="message" :class="failed ? 'bad' : 'good'" role="status">{{ message }}</p>
  </section>
</template>

<style scoped>
.section {
  padding: 22px 24px;
  max-width: 820px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section h2 {
  font-size: 21px;
}

.section p {
  margin: 0;
}

.label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
  margin-bottom: 6px;
}

.generations {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.generations .label {
  margin: 0 6px 0 0;
}

.gen {
  background: #1a2029;
  color: var(--text);
  height: 34px;
}

.gen button {
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
}

.add {
  width: 110px;
  min-height: 36px;
  padding: 6px 10px;
}

.btn.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 14px;
}

.new {
  color: var(--yellow);
  font-size: 13px;
}

.models {
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow-x: auto;
  background: var(--ground);
}

.row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 70px 70px 70px 100px;
  gap: 10px;
  align-items: center;
  min-width: 560px;
  padding: 10px 14px;
  border-top: 1px solid var(--line-soft);
  cursor: pointer;
}

.row.heading {
  border-top: 0;
  cursor: default;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.row.on {
  background: #13201a;
}

.row input {
  width: 18px;
  height: 18px;
  accent-color: var(--green);
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.small-note {
  font-size: 13px;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.good {
  color: var(--green);
}

.bad {
  color: var(--red);
}
</style>
