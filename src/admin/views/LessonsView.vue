<script setup>
// Style lessons: instructions/keith-feedback.md in blog-private, which every draft and
// revision reads. Revisions add to it; here Keith reads, edits, deletes and adds lessons, each
// change a commit there.
import { onMounted, ref } from 'vue';
import { api } from '../api.js';
import Dialog from '../Dialog.vue';
import Icon from '../Icon.vue';

const sections = ref(null);
const history = ref('');
const text = ref('');
const editing = ref(null);
const deleting = ref(null);
const busy = ref(false);
const message = ref('');
const failed = ref(false);

function apply(result) {
  sections.value = result.sections;
  history.value = result.history;
}

const load = async () => apply(await api('/lessons'));

onMounted(() =>
  load().catch((error) => {
    failed.value = true;
    message.value = error.message;
  }),
);

async function run(task, done) {
  busy.value = true;
  message.value = '';
  try {
    apply(await task());
    failed.value = false;
    message.value = done;
    return true;
  } catch (error) {
    failed.value = true;
    message.value = error.message;
    if (error.status === 409) await load().catch(() => {});
    return false;
  } finally {
    busy.value = false;
  }
}

async function add() {
  if (await run(() => api('/lessons', { method: 'POST', body: { text: text.value } }), 'Added. The next run reads it.')) text.value = '';
}

async function saveEdit() {
  const { id, text: lesson } = editing.value;
  if (await run(() => api(`/lessons/${id}`, { method: 'PUT', body: { text: lesson } }), 'Saved.')) editing.value = null;
}

async function remove() {
  const { id } = deleting.value;
  deleting.value = null;
  await run(() => api(`/lessons/${id}`, { method: 'DELETE' }), 'Deleted. The change history can bring it back.');
}

function heading(section) {
  if (section.source === 'revise') return `From your revision of “${section.title}”`;
  if (section.source === 'keith') return 'Added by you';
  return section.title ? `${section.title[0].toUpperCase()}${section.title.slice(1)}` : 'Lessons';
}

const day = (date) => (date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
</script>

<template>
  <div class="page narrow">
    <div class="page-head">
      <h1 class="hd">Style lessons</h1>
      <p>What the AI has learned from your feedback. Every draft and revision reads these, on top of the voice guide.</p>
    </div>

    <form class="card add" @submit.prevent="add">
      <label class="grow">
        <span class="label">Add a lesson yourself</span>
        <input v-model="text" class="inp" placeholder="For example, a phrase you never want to see again" maxlength="1000" />
      </label>
      <button type="submit" class="btn btn-go" :disabled="busy || !text.trim()"><Icon name="plus" />Add</button>
    </form>

    <p v-if="message" class="card note" :class="failed ? 'bad' : 'good'" role="status">{{ message }}</p>

    <p v-if="sections === null && !failed" class="muted">Loading</p>
    <p v-else-if="sections && !sections.length" class="muted">No lessons yet. Revisions add them as they learn how you write.</p>

    <section v-for="section in sections ?? []" :key="section.heading" class="card group">
      <div class="grp">
        <strong>{{ heading(section) }}</strong>
        <span class="muted small">{{ day(section.date) }}{{ section.source === 'revise' ? ' · added by Revise' : '' }}</span>
      </div>
      <div v-for="lesson in section.lessons" :key="lesson.id" class="lesson">
        <form v-if="editing?.id === lesson.id" class="edit" @submit.prevent="saveEdit">
          <textarea v-model="editing.text" class="inp" rows="3" maxlength="1000" aria-label="The lesson"></textarea>
          <div class="end">
            <button type="button" class="btn" :disabled="busy" @click="editing = null">Cancel</button>
            <button type="submit" class="btn btn-go" :disabled="busy || !editing.text.trim()">Save</button>
          </div>
        </form>
        <template v-else>
          <span class="words">{{ lesson.text }}</span>
          <button type="button" class="iconbtn" :disabled="busy" aria-label="Edit the lesson" @click="editing = { ...lesson }"><Icon name="pen" /></button>
          <button type="button" class="iconbtn" :disabled="busy" aria-label="Delete the lesson" @click="deleting = lesson"><Icon name="trash" /></button>
        </template>
      </div>
    </section>

    <p class="muted foot">
      Saved as commits in blog-private, so a deleted lesson can always be brought back.
      <a v-if="history" :href="history" target="_blank" rel="noopener">Change history</a>
    </p>

    <Dialog v-if="deleting" title="Delete this lesson?" @close="deleting = null">
      <p>“{{ deleting.text }}”</p>
      <p class="muted">Later drafts and revisions won't read it. The change history keeps it.</p>
      <template #buttons>
        <button type="button" class="btn" @click="deleting = null">Keep it</button>
        <button type="button" class="btn danger-btn" @click="remove">Delete it</button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 940px;
}

.add {
  padding: 18px 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
}

.grow {
  flex: 1 1 360px;
}

.label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
  margin-bottom: 6px;
}

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

.group {
  overflow: hidden;
}

.grp {
  padding: 14px 18px 10px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  align-items: baseline;
}

.grp strong {
  color: var(--text);
}

.small {
  font-size: 13px;
}

.lesson {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 8px 8px 18px;
  border-top: 1px solid var(--line-soft);
}

.words {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex: none;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--secondary);
  cursor: pointer;
}

.iconbtn:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.iconbtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.edit {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 10px 6px 0;
}

.end {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.foot {
  margin: 0;
  font-size: 14px;
}

.danger-btn {
  color: var(--red);
  border-color: #5a2e2c;
  background: #1a1214;
}
</style>
