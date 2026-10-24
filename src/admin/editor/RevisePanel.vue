<script setup>
// Revising with the AI: notes on passages chosen in the preview, an overall request, and the
// model. The AI rewrites from the current text, so hand edits stay. The editor holds the
// request and choices, since this panel closes whenever another one opens.
import Icon from '../Icon.vue';
import ModelPicker from './ModelPicker.vue';

defineProps({
  highlights: { type: Array, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['remove', 'revise', 'close']);

const request = defineModel('request', { type: String, default: '' });
const learn = defineModel('learn', { type: Boolean, default: true });
const choice = defineModel('choice', { type: Object, default: () => ({}) });
</script>

<template>
  <div class="revise">
    <div class="head">
      <h2 class="hd">Revise</h2>
      <button type="button" class="close" aria-label="Stop revising" @click="emit('close')"><Icon name="close" /></button>
    </div>
    <p class="sec">Select any passage in the preview to add a note on it. The AI rewrites from the current text, so your own edits stay, and you see every change before it's kept.</p>

    <div class="notes">
      <span class="label">Your notes ({{ highlights.length }})</span>
      <p v-if="!highlights.length" class="muted empty">None yet. Select some text in the preview, then Add a note.</p>
      <div v-for="(item, index) in highlights" :key="index" class="card note">
        <span class="num">{{ index + 1 }}</span>
        <div>
          <div class="quote">"{{ item.quote }}"</div>
          <div>{{ item.note }}</div>
        </div>
        <button type="button" class="close" :aria-label="`Delete note ${index + 1}`" @click="emit('remove', index)"><Icon name="close" /></button>
      </div>
    </div>

    <label>
      <span class="label">Overall request (optional)</span>
      <textarea v-model="request" class="inp" rows="3" placeholder="For example: tighten the opening, and end on a verdict"></textarea>
    </label>

    <ModelPicker v-model="choice" kind="revise" :images="false" />

    <label class="learn">
      <input v-model="learn" type="checkbox" />
      <span><strong>Learn from this</strong><br /><span class="muted">General lessons about your voice go to Style lessons, for every later draft</span></span>
    </label>

    <p v-if="error" class="bad" role="alert">{{ error }}</p>
    <button
      type="button"
      class="btn btn-ai go"
      :disabled="busy || (!highlights.length && !request.trim()) || !choice.model"
      @click="emit('revise', { request, learn, choice })"
    >
      <Icon name="sparkles" />Revise{{ highlights.length ? ` with ${highlights.length} ${highlights.length === 1 ? 'note' : 'notes'}` : '' }}
    </button>
  </div>
</template>

<style scoped>
.revise {
  padding: 18px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.head h2 {
  font-size: 21px;
}

.sec {
  margin: 0;
  font-size: 14px;
}

.label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
  margin-bottom: 6px;
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty {
  margin: 0;
  font-size: 14px;
}

.note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  background: var(--ground);
  font-size: 14px;
}

.note > div {
  flex: 1;
  min-width: 0;
}

.quote {
  color: var(--muted);
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--pink);
  color: var(--ground);
  font-size: 12px;
  font-weight: 700;
  flex: none;
}

.close {
  display: inline-flex;
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  padding: 6px;
}

.learn {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
  cursor: pointer;
}

.learn input {
  width: 20px;
  height: 20px;
  margin-top: 1px;
  accent-color: var(--pink);
}

.learn strong {
  color: var(--text);
}

.bad {
  color: var(--red);
  margin: 0;
}

.go {
  width: 100%;
}
</style>
