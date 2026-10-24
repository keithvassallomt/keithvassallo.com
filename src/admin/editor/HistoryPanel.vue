<script setup>
// Earlier versions of the post. Saving keeps one every ten minutes for 30 days; restores keep
// theirs for good. Restoring makes a version current and keeps what it replaced.
import { onMounted, ref } from 'vue';
import { api } from '../api.js';

const props = defineProps({ postId: { type: String, required: true } });
const emit = defineEmits(['restore']);

const versions = ref(null);
const error = ref('');

const when = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function load() {
  try {
    versions.value = (await api(`/posts/${props.postId}/versions`)).versions;
  } catch (cause) {
    error.value = cause.message;
  }
}

onMounted(load);
defineExpose({ load });
</script>

<template>
  <div class="history">
    <p class="sec intro">Restoring a version makes it the newest, and keeps the one it replaces, so nothing is lost.</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="!versions" class="muted">Loading</p>
    <p v-else-if="!versions.length" class="muted">No earlier versions yet. One is kept every ten minutes while you write.</p>
    <div v-for="(version, index) in versions" :key="version.id" class="card version">
      <div>
        <strong :class="{ ai: ['generated', 'revised'].includes(version.kind) }">{{ version.label }}</strong>
        <div class="muted meta">{{ when.format(new Date(version.at)) }}{{ version.expiresAt ? '' : ' · kept' }}</div>
      </div>
      <span v-if="index === 0 && version.kind === 'autosave'" class="muted latest">Latest</span>
      <button v-else type="button" class="btn small" @click="emit('restore', version)">Restore</button>
    </div>
  </div>
</template>

<style scoped>
.history {
  padding: 18px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.intro {
  margin: 0 0 4px;
  font-size: 14px;
}

.error {
  color: var(--red);
}

.version {
  padding: 12px 14px;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.version strong {
  color: var(--text);
}

.version strong.ai {
  color: var(--pink);
}

.meta,
.latest {
  font-size: 13px;
}

.btn.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 14px;
}
</style>
