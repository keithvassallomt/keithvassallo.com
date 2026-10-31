<script setup>
// Starting a generate run. What the AI does depends on what the post already has: its notes
// for the AI, its body, both or neither. With neither, it writes Keith's next idea, unless he
// would rather it picked a topic itself.
import { computed, onMounted, ref } from 'vue';
import { api } from '../api.js';
import Dialog from '../Dialog.vue';
import ModelPicker from './ModelPicker.vue';

const props = defineProps({
  notes: { type: String, default: '' },
  body: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['close', 'generate']);

const choice = ref({});
const MODES = {
  neither: ['Neither', 'Writes your next idea, or picks a topic itself'],
  notes: ['Notes only', 'Writes about your notes'],
  body: ['Body only', 'Keeps your draft and builds on it'],
  both: ['Both', 'Follows the notes, builds on the body'],
};
const mode = computed(() => {
  const notes = !!props.notes.trim();
  const body = !!props.body.trim();
  return notes && body ? 'both' : notes ? 'notes' : body ? 'body' : 'neither';
});
// The idea at the top of the queue, which an empty post takes
const nextIdea = ref(null);
const useIdea = ref(true);
onMounted(async () => {
  if (mode.value !== 'neither') return;
  nextIdea.value = (await api('/ideas').catch(() => ({ ideas: [] }))).ideas[0] ?? null;
});

const explanation = computed(
  () =>
    ({
      neither: nextIdea.value && useIdea.value
        ? 'It writes the idea at the top of your queue, which then leaves the list. If your idea doesn’t say what you think, it asks before it writes.'
        : 'Nothing to go on yet, so it researches and picks a topic itself.',
      notes: 'It writes about your notes. Facts in them count as yours, so it can write about them in the first person.',
      body: 'It treats what you have written as your rough draft: it keeps your words where they work, and researches, expands and finishes it.',
      both: 'It follows your notes and builds on what you have written, keeping your words where they work.',
    })[mode.value],
);
</script>

<template>
  <Dialog title="Generate a post" wide @close="emit('close')">
    <p class="sec">{{ explanation }}</p>
    <div class="modes">
      <div v-for="(text, name) in MODES" :key="name" class="mode" :class="{ on: mode === name }">
        <strong>{{ text[0] }}{{ mode === name ? ' (this one)' : '' }}</strong>
        <span>{{ text[1] }}</span>
      </div>
    </div>
    <label v-if="mode === 'neither' && nextIdea" class="idea">
      <input v-model="useIdea" type="checkbox" />
      <span><strong>Write my next idea</strong><br /><span class="muted">{{ nextIdea.title }}</span></span>
    </label>
    <ModelPicker v-model="choice" kind="generate" />
    <p class="muted note">A run takes several minutes. You can leave this page; the post is locked until it finishes.</p>
    <p v-if="error" class="bad" role="alert">{{ error }}</p>
    <template #buttons>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-ai" :disabled="busy || !choice.model" @click="emit('generate', { ...choice, idea: useIdea })">Generate</button>
    </template>
  </Dialog>
</template>

<style scoped>
.sec {
  margin: 0 0 12px;
}

.modes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 16px;
  font-size: 13px;
}

.mode {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--ground);
  color: var(--muted);
}

.mode strong {
  color: var(--text);
}

.mode.on {
  border-color: var(--pink);
  background: #2a1f2a;
  color: var(--secondary);
}

.mode.on strong {
  color: var(--pink);
}

.note {
  font-size: 13px;
  margin: 12px 0 0;
}

.idea {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 16px;
  font-size: 14px;
  cursor: pointer;
}

.idea input {
  width: 20px;
  height: 20px;
  margin-top: 1px;
  accent-color: var(--pink);
}

.idea strong {
  color: var(--text);
}

.bad {
  color: var(--red);
}
</style>
