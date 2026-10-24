<script setup>
// Ideas: notes/ideas.md in blog-private, which the research stage reads. Add one from the
// phone, edit or delete it, or start a draft from it. Each change is a commit there.
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '../api.js';
import Dialog from '../Dialog.vue';
import Icon from '../Icon.vue';

const router = useRouter();
const ideas = ref(null);
const file = ref('');
const title = ref('');
const details = ref('');
const editing = ref(null);
const deleting = ref(null);
const busy = ref(false);
const message = ref('');
const failed = ref(false);

function apply(result) {
  ideas.value = result.ideas;
  file.value = result.file;
}

const load = async () => apply(await api('/ideas'));

onMounted(() =>
  load().catch((error) => {
    failed.value = true;
    message.value = error.message;
  }),
);

async function run(task, done = '') {
  busy.value = true;
  message.value = '';
  try {
    const result = await task();
    if (result?.ideas) apply(result);
    failed.value = false;
    message.value = done;
    return true;
  } catch (error) {
    failed.value = true;
    message.value = error.message;
    // Something else changed the file: show it as it is now
    if (error.status === 409) await load().catch(() => {});
    return false;
  } finally {
    busy.value = false;
  }
}

async function add() {
  if (await run(() => api('/ideas', { method: 'POST', body: { title: title.value, details: details.value } }), 'Added.')) {
    title.value = '';
    details.value = '';
  }
}

const startEdit = (idea) => (editing.value = { id: idea.id, title: idea.title, details: idea.details });

async function saveEdit() {
  const { id, ...body } = editing.value;
  if (await run(() => api(`/ideas/${id}`, { method: 'PUT', body }), 'Saved.')) editing.value = null;
}

async function remove() {
  const { id } = deleting.value;
  deleting.value = null;
  await run(() => api(`/ideas/${id}`, { method: 'DELETE' }), 'Deleted. It’s still in the file’s history on GitHub.');
}

async function draft(idea) {
  busy.value = true;
  try {
    const { id } = await api(`/ideas/${idea.id}/draft`, { method: 'POST' });
    router.push(`/posts/${id}`);
  } catch (error) {
    failed.value = true;
    message.value = error.message;
    busy.value = false;
  }
}

function added(day) {
  if (!day) return 'Written by hand';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(Date.now() - 864e5));
  if (day === today) return 'Added today';
  if (day === yesterday) return 'Added yesterday';
  return `Added ${new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: day.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' })}`;
}
</script>

<template>
  <div class="page narrow">
    <div class="page-head">
      <h1 class="hd">Ideas</h1>
      <p>Anything you might want to write about. The weekly run and Generate both read these, and what you write here counts as your own experience.</p>
    </div>

    <form class="card add" @submit.prevent="add">
      <label>
        <span class="label">New idea</span>
        <input v-model="title" class="inp" placeholder="One line is enough" maxlength="200" />
      </label>
      <label>
        <span class="label">Details (optional)</span>
        <textarea v-model="details" class="inp" rows="2" placeholder="What happened, what you think, links"></textarea>
      </label>
      <div class="end">
        <button type="submit" class="btn btn-go" :disabled="busy || !title.trim()"><Icon name="plus" />Add idea</button>
      </div>
    </form>

    <p v-if="message" class="card note" :class="failed ? 'bad' : 'good'" role="status">{{ message }}</p>

    <p v-if="ideas === null && !failed" class="muted">Loading</p>
    <p v-else-if="ideas && !ideas.length" class="muted">No ideas yet.</p>

    <section v-if="ideas?.length" class="list">
      <div v-for="idea in ideas" :key="idea.id" class="card idea">
        <template v-if="editing?.id === idea.id">
          <form class="edit" @submit.prevent="saveEdit">
            <input v-model="editing.title" class="inp" maxlength="200" aria-label="The idea" />
            <textarea v-model="editing.details" class="inp" rows="3" aria-label="Details" placeholder="Details (optional)"></textarea>
            <div class="end">
              <button type="button" class="btn" :disabled="busy" @click="editing = null">Cancel</button>
              <button type="submit" class="btn btn-go" :disabled="busy || !editing.title.trim()">Save</button>
            </div>
          </form>
        </template>
        <template v-else>
          <span class="mark" :class="{ used: idea.used }"><Icon :name="idea.used ? 'check' : 'idea'" /></span>
          <div class="text">
            <strong>{{ idea.title }}</strong>
            <p v-if="idea.details" class="details">{{ idea.details }}</p>
            <div class="muted when">{{ added(idea.added) }}</div>
            <div v-if="idea.draft?.drafting" class="state">
              <span class="chip" style="color: var(--pink); background: rgba(242, 160, 214, 0.12)">Being drafted now</span>
              <RouterLink :to="`/posts/${idea.draft.id}`">See the run</RouterLink>
            </div>
            <div v-else-if="idea.used" class="state">
              <span class="chip" style="color: var(--secondary); background: rgba(138, 147, 161, 0.14)">Used</span>
              <RouterLink v-if="idea.draft" :to="`/posts/${idea.draft.id}`">{{ idea.draft.title || 'Untitled draft' }}</RouterLink>
              <span v-else class="muted">The draft has been deleted</span>
            </div>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-ai small" :disabled="busy" @click="draft(idea)">Draft this</button>
            <button type="button" class="iconbtn" :disabled="busy" aria-label="Edit the idea" @click="startEdit(idea)"><Icon name="pen" /></button>
            <button type="button" class="iconbtn" :disabled="busy" aria-label="Delete the idea" @click="deleting = idea"><Icon name="trash" /></button>
          </div>
        </template>
      </div>
    </section>

    <p class="muted foot">
      Saved privately in blog-private, never on the site. Draft this opens a new post with the idea in its notes for the AI.
      <a v-if="file" :href="file" target="_blank" rel="noopener">The file on GitHub</a>
    </p>

    <Dialog v-if="deleting" title="Delete this idea?" @close="deleting = null">
      <p>“{{ deleting.title }}” comes out of your ideas, so later runs won't see it. Git keeps the old version.</p>
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
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
  margin-bottom: 6px;
}

.end {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.idea {
  padding: 16px 18px;
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.mark {
  color: var(--yellow);
  padding-top: 2px;
}

.mark.used {
  color: var(--muted);
}

.text {
  flex: 1;
  min-width: 0;
}

.text strong {
  color: var(--text);
  font-size: 16px;
}

.details {
  margin: 4px 0 0;
  color: var(--secondary);
  font-size: 15px;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.when {
  font-size: 14px;
  margin-top: 4px;
}

.state {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
}

.actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.btn.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 14px;
  margin-right: 4px;
}

.iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
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

@media (max-width: 600px) {
  .idea {
    flex-wrap: wrap;
  }

  .text {
    flex-basis: calc(100% - 40px);
  }

  .actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
