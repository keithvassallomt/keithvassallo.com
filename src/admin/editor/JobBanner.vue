<script setup>
// Follows a site job (publish, update, unpublish, delete, pin) as it runs, from the job's
// record, which the site runner updates at each stage.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '../api.js';
import Icon from '../Icon.vue';

const props = defineProps({ job: { type: Object, required: true }, slug: { type: String, default: '' } });
const emit = defineEmits(['finished', 'dismiss']);

const STAGES = {
  publish: [['queued', 'Waiting to start'], ['preparing', 'Getting the post ready'], ['building', 'Checking the site builds'], ['committing', 'Committing to main'], ['deploying', 'Deploying'], ['live', 'Live']],
  unpublish: [['queued', 'Waiting to start'], ['preparing', 'Taking it out'], ['building', 'Checking the site builds'], ['committing', 'Committing to main'], ['deploying', 'Deploying'], ['live', 'Off the site']],
  pin: [['queued', 'Waiting to start'], ['preparing', 'Setting the pin'], ['building', 'Checking the site builds'], ['committing', 'Committing to main'], ['deploying', 'Deploying'], ['live', 'Done']],
};
STAGES.delete = STAGES.unpublish;
const TITLES = { publish: 'Publishing', unpublish: 'Unpublishing', delete: 'Deleting from the live site', pin: 'Changing the pin' };

const current = ref({ ...props.job });
let timer = null;

const steps = computed(() => {
  const list = STAGES[current.value.kind] ?? STAGES.publish;
  const shown = current.value.dryRun ? list.slice(0, 3) : list;
  const at = shown.findIndex(([stage]) => stage === current.value.stage);
  return shown.map(([stage, label], index) => ({
    label,
    state: current.value.status === 'done' ? 'done' : index < at ? 'done' : index === at ? (current.value.status === 'failed' ? 'failed' : 'now') : 'later',
  }));
});

const finished = computed(() => ['done', 'failed'].includes(current.value.status));

async function poll() {
  try {
    current.value = await api(`/jobs/${props.job.id}`);
  } catch {
    // Try again on the next tick
  }
  if (finished.value) emit('finished', current.value);
  else timer = setTimeout(poll, 3000);
}

onMounted(() => {
  if (!finished.value) poll();
});
onBeforeUnmount(() => clearTimeout(timer));
watch(
  () => props.job.id,
  () => {
    clearTimeout(timer);
    current.value = { ...props.job };
    if (!finished.value) poll();
  },
);
</script>

<template>
  <div class="card job" :class="current.status" role="status">
    <div class="top">
      <strong>
        <template v-if="current.status === 'failed'">{{ TITLES[current.kind] ?? 'The job' }} stopped</template>
        <template v-else-if="current.status === 'done' && current.dryRun">The build passed. Nothing was published.</template>
        <template v-else-if="current.status === 'done'">{{ current.kind === 'publish' ? 'Live' : 'Done' }}</template>
        <template v-else>{{ TITLES[current.kind] ?? 'Working' }}{{ current.dryRun ? ' (checking only)' : '' }}</template>
      </strong>
      <span class="links">
        <a v-if="current.status === 'done' && current.kind === 'publish' && !current.dryRun && slug" :href="`https://keithvassallo.com/blog/${slug}`" target="_blank" rel="noopener">View it<Icon name="external" /></a>
        <a v-if="current.runUrl" :href="current.runUrl" target="_blank" rel="noopener">Log</a>
        <button v-if="finished" type="button" class="close" aria-label="Dismiss" @click="emit('dismiss')"><Icon name="close" /></button>
      </span>
    </div>
    <ol v-if="!finished || current.status === 'failed'" class="steps">
      <li v-for="step in steps" :key="step.label" :class="step.state">
        <span class="dot"><Icon v-if="step.state === 'done'" name="check" /><Icon v-else-if="step.state === 'failed'" name="close" /></span>{{ step.label }}
      </li>
    </ol>
    <p v-if="current.status === 'failed'" class="error">{{ current.error }}</p>
  </div>
</template>

<style scoped>
.job {
  margin: 12px 20px 0;
  padding: 12px 16px;
  border-color: #3a4352;
}

.job.done {
  border-color: #2f5a3b;
  background: #121c16;
}

.job.failed {
  border-color: #5a2e2c;
  background: #1a1214;
}

.top {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.top strong {
  color: var(--text);
}

.links {
  display: flex;
  gap: 14px;
  align-items: center;
  font-weight: 700;
}

.links a {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.close {
  display: inline-flex;
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
}

.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  font-size: 14px;
  color: var(--muted);
}

.steps li {
  display: flex;
  gap: 6px;
  align-items: center;
}

.steps .dot {
  display: inline-flex;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  align-items: center;
  justify-content: center;
}

.steps .dot .ic {
  width: 12px;
  height: 12px;
}

.steps .done {
  color: var(--green);
}

.steps .done .dot {
  border-color: var(--green);
}

.steps .now {
  color: var(--text);
}

.steps .now .dot {
  border-color: var(--pink);
  background: var(--pink);
}

.steps .failed {
  color: var(--red);
}

.error {
  margin: 10px 0 0;
  color: var(--red);
  white-space: pre-wrap;
  font-size: 14px;
}
</style>
