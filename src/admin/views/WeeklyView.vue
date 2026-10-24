<script setup>
// The weekly run: every Saturday at 09:00 UK time the AI drafts a post and leaves it in Posts.
// On or off, skip the next one, queue a topic for it, choose its model, or run one now.
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '../api.js';
import { loadModels } from '../models.js';

const router = useRouter();
const data = ref(null);
const models = ref([]);
const topic = ref('');
const model = ref('');
const busy = ref(false);
const message = ref('');
const failed = ref(false);

const longDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function apply(result) {
  data.value = result;
  topic.value = result.settings.topic ?? '';
  model.value = result.settings.model ?? '';
}

onMounted(async () => {
  try {
    const [weekly, list] = await Promise.all([api('/weekly'), loadModels().catch(() => ({ models: [] }))]);
    apply(weekly);
    models.value = list.models;
  } catch (error) {
    failed.value = true;
    message.value = error.message;
  }
});

async function change(body, done = 'Saved.') {
  busy.value = true;
  message.value = '';
  try {
    apply(await api('/weekly', { method: 'PUT', body }));
    failed.value = false;
    message.value = done;
  } catch (error) {
    failed.value = true;
    message.value = error.message;
  } finally {
    busy.value = false;
  }
}

async function runNow() {
  busy.value = true;
  message.value = '';
  try {
    const { id } = await api('/weekly/run', { method: 'POST' });
    router.push(`/posts/${id}`);
  } catch (error) {
    failed.value = true;
    message.value = error.message;
    busy.value = false;
  }
}

const OUTCOMES = {
  draft: ['Draft', 'var(--secondary)'],
  skip: ['No topic', 'var(--yellow)'],
  skipped: ['Skipped', 'var(--yellow)'],
  failed: ['Failed', 'var(--red)'],
  cancelled: ['Cancelled', 'var(--muted)'],
  running: ['Running', 'var(--pink)'],
};
const outcome = (run) => {
  if (run.status === 'skipped') return OUTCOMES.skipped;
  if (run.status === 'failed') return OUTCOMES.failed;
  if (run.status === 'cancelled') return OUTCOMES.cancelled;
  if (run.status !== 'done') return OUTCOMES.running;
  return run.outcome === 'skip' ? OUTCOMES.skip : OUTCOMES.draft;
};
const skipping = computed(() => !!data.value?.settings.skip);
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1 class="hd">Weekly run</h1>
      <p>Every Saturday at 09:00 UK time, the AI drafts a post and leaves it in Posts for you.</p>
    </div>
    <p v-if="message" class="card note" :class="failed ? 'bad' : 'good'" role="status">{{ message }}</p>

    <template v-if="data">
      <div class="two">
        <section class="card box">
          <label class="switch">
            <input type="checkbox" :checked="data.settings.enabled" :disabled="busy" @change="change({ enabled: $event.target.checked }, $event.target.checked ? 'The weekly run is on.' : 'The weekly run is off.')" />
            <span><strong>{{ data.settings.enabled ? 'On' : 'Off' }}</strong><br /><span class="muted">Turn it off to stop the weekly drafts until you turn it back on</span></span>
          </label>
          <div class="next">
            <span class="label">Next run</span>
            <div class="hd when">{{ data.settings.enabled ? `${longDay(data.next)}, 09:00` : 'None while it’s off' }}</div>
            <span v-if="skipping && data.settings.enabled" class="muted">Skipping {{ longDay(data.settings.skip) }}</span>
          </div>
          <div class="buttons">
            <button v-if="!skipping" type="button" class="btn" :disabled="busy || !data.settings.enabled" @click="change({ skip: 'next' }, 'The next run is skipped.')">Skip the next one</button>
            <button v-else type="button" class="btn" :disabled="busy" @click="change({ skip: null }, 'The skip is cancelled.')">Don't skip it</button>
            <button type="button" class="btn btn-ai" :disabled="busy" @click="runNow">Run it now</button>
          </div>
          <p class="muted small">Run it now starts a weekly-style draft straight away, with the queued topic if there is one. It doesn't change the schedule.</p>
        </section>

        <section class="card box">
          <h2 class="hd">For the next run</h2>
          <label>
            <span class="label">Topic (optional)</span>
            <textarea v-model="topic" class="inp" rows="4" placeholder="Leave it empty and the AI picks one from your projects, the news, teaching and your ideas. Anything you write counts as your notes."></textarea>
          </label>
          <label>
            <span class="label">Model</span>
            <select v-model="model" class="inp">
              <option value="">The default ({{ data.defaultModel }})</option>
              <option v-for="entry in models" :key="entry.id" :value="entry.id">{{ entry.id }}</option>
            </select>
          </label>
          <div class="buttons">
            <button type="button" class="btn btn-go" :disabled="busy || (topic === (data.settings.topic ?? '') && model === (data.settings.model ?? ''))" @click="change({ topic, model: model || null })">Save</button>
          </div>
          <p class="muted small">A queued topic is used once, then cleared. The research reads your ideas and avoids repeating the last run's category.</p>
        </section>
      </div>

      <section class="card runs">
        <h2 class="hd">Past runs</h2>
        <p v-if="!data.runs.length" class="muted">None yet.</p>
        <component :is="run.postId ? RouterLink : 'div'" v-for="run in data.runs" :key="run.id" class="run" :to="run.postId ? `/posts/${run.postId}` : undefined">
          <span class="date">{{ shortDay(run.created) }}</span>
          <span class="chip" :style="{ color: outcome(run)[1], background: 'rgba(138,147,161,0.12)' }">{{ outcome(run)[0] }}</span>
          <span class="what">{{ run.title || run.reason || run.error || 'Untitled' }}</span>
          <span class="mono muted small">{{ run.model ?? '' }}</span>
          <span class="cost">{{ run.cost?.total ? `$${run.cost.total.toFixed(2)}` : '' }}</span>
        </component>
      </section>
    </template>
    <p v-else-if="!message" class="muted">Loading</p>
  </div>
</template>

<style scoped>
.note {
  margin: 0;
  padding: 12px 16px;
}

.good {
  color: var(--green);
}

.bad {
  color: var(--red);
}

.two {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.box {
  flex: 1 1 340px;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.box h2,
.runs h2 {
  font-size: 20px;
}

.switch {
  display: flex;
  gap: 14px;
  align-items: center;
  cursor: pointer;
}

.switch input {
  width: 22px;
  height: 22px;
  accent-color: var(--green);
}

.switch strong {
  color: var(--text);
  font-size: 17px;
}

.next {
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--ground);
}

.label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
  margin-bottom: 6px;
}

.when {
  font-size: 24px;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.small {
  font-size: 13px;
  margin: 0;
}

.runs {
  padding: 18px 20px;
}

.run {
  display: grid;
  grid-template-columns: 110px 100px minmax(0, 1fr) 120px 70px;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--line-soft);
  color: inherit;
  text-decoration: none;
}

.adm a.run {
  color: inherit;
}

.what {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cost {
  text-align: right;
}

@media (max-width: 700px) {
  .run {
    grid-template-columns: 90px minmax(0, 1fr) 60px;
  }

  .run .chip,
  .run .mono {
    display: none;
  }
}
</style>
