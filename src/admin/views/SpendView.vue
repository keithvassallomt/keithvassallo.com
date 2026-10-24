<script setup>
// What the AI runs cost, month by month, from each run's token counts and models.dev's prices
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../api.js';

const data = ref(null);
const error = ref('');
const month = ref(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).format(new Date()));

async function load() {
  try {
    data.value = await api(`/spend?month=${month.value}`);
    error.value = '';
  } catch (cause) {
    error.value = cause.message;
  }
}
onMounted(load);
watch(month, load);

const months = computed(() => {
  const list = [];
  const date = new Date();
  for (let i = 0; i < 12; i++) {
    const at = new Date(date.getFullYear(), date.getMonth() - i, 15);
    list.push({ value: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`, label: at.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) });
  }
  return list;
});
const KINDS = { generate: 'Generate', revise: 'Revise', cover: 'Cover' };
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const k = (value) => `${Math.round((value ?? 0) / 1000)}k`;
const money = (cost) => (cost?.total === null || cost?.total === undefined ? 'unknown' : `$${cost.total.toFixed(2)}`);
const partial = computed(() => data.value?.runs.some((run) => run.cost && !run.cost.complete));
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="page-head">
        <h1 class="hd">Spend</h1>
        <p>What the AI has cost, from each run's token counts and the prices on models.dev.</p>
      </div>
      <select v-model="month" class="inp month" aria-label="Month">
        <option v-for="option in months" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </div>

    <p v-if="error" class="card notice" role="alert">{{ error }}</p>
    <template v-else-if="data">
      <section class="card summary">
        <div class="hd total">
          {{ months.find((option) => option.value === data.month)?.label }}: <span class="good">${{ data.total.toFixed(2) }}</span> across
          {{ data.runs.length }} {{ data.runs.length === 1 ? 'run' : 'runs' }}.
        </div>
        <p v-if="data.cap" class="sec">Your monthly cap is ${{ data.cap }}. New runs stop once a month reaches it, the weekly one included.</p>
        <p v-else class="sec">No monthly cap yet. <RouterLink to="/settings">Set one in Settings</RouterLink> and new runs stop once a month reaches it.</p>
      </section>

      <section class="card table">
        <div class="row heading muted"><span>Date</span><span>Run</span><span>Model</span><span class="num">Tokens in (cached) / out</span><span class="num">Cost</span></div>
        <p v-if="!data.runs.length" class="empty muted">No AI runs this month.</p>
        <component :is="run.postId ? RouterLink : 'div'" v-for="run in data.runs" :key="run.id" :to="run.postId ? `/posts/${run.postId}` : undefined" class="row">
          <span>{{ day(run.created) }}</span>
          <span><span class="chip kind">{{ KINDS[run.kind] ?? run.kind }}</span> {{ run.title || 'Untitled' }}<span v-if="run.status !== 'done'" class="muted"> · {{ run.status }}</span></span>
          <span class="mono small">{{ run.model }}</span>
          <span class="num mono small">{{ k(run.usage?.inputTokens) }} ({{ k(run.usage?.cachedTokens) }}) / {{ k(run.usage?.outputTokens) }}</span>
          <span class="num">{{ money(run.cost) }}</span>
        </component>
      </section>
      <p class="muted note">
        Token costs use models.dev prices, including the higher rate some models charge for long requests.
        <template v-if="partial">Some runs leave out web searches or images, because their rates aren't set in Settings. </template>
        OpenAI's usage page is the final word.
      </p>
    </template>
    <p v-else class="muted">Loading</p>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
}

.month {
  width: auto;
  min-width: 190px;
}

.notice {
  margin: 0;
  padding: 16px 18px;
  color: var(--red);
}

.summary {
  padding: 22px 24px;
}

.total {
  font-size: 22px;
  line-height: 1.4;
}

.good {
  color: var(--green);
}

.summary p {
  margin: 8px 0 0;
}

.table {
  overflow-x: auto;
}

.row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr) 130px 190px 80px;
  gap: 14px;
  align-items: center;
  min-width: 700px;
  padding: 12px 18px;
  border-top: 1px solid var(--line-soft);
  color: inherit;
  text-decoration: none;
}

.adm a.row {
  color: inherit;
}

.adm a.row:hover {
  background: #151a22;
}

.heading {
  border-top: 0;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.small {
  font-size: 13px;
}

.kind {
  color: var(--pink);
  background: rgba(242, 160, 214, 0.12);
}

.empty {
  padding: 32px 18px;
  margin: 0;
  border-top: 1px solid var(--line-soft);
}

.note {
  font-size: 14px;
  margin: 0;
}
</style>
