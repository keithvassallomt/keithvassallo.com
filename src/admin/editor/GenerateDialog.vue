<script setup>
// Starting a generate run. What the AI does depends on what the post already has: its notes
// for the AI, its body, both or neither.
import { computed, ref } from 'vue';
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
  neither: ['Neither', 'Picks a topic itself, like the weekly run'],
  notes: ['Notes only', 'Writes about your notes'],
  body: ['Body only', 'Keeps your draft and builds on it'],
  both: ['Both', 'Follows the notes, builds on the body'],
};
const mode = computed(() => {
  const notes = !!props.notes.trim();
  const body = !!props.body.trim();
  return notes && body ? 'both' : notes ? 'notes' : body ? 'body' : 'neither';
});
const explanation = computed(
  () =>
    ({
      neither: 'Nothing to go on yet, so it researches and picks a topic itself, as the weekly run does.',
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
    <ModelPicker v-model="choice" kind="generate" />
    <p class="muted note">A run takes several minutes. You can leave this page; the post is locked until it finishes.</p>
    <p v-if="error" class="bad" role="alert">{{ error }}</p>
    <template #buttons>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-ai" :disabled="busy || !choice.model" @click="emit('generate', choice)">Generate</button>
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

.bad {
  color: var(--red);
}
</style>
