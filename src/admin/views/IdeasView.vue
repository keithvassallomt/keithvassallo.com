<script setup>
// Ideas: notes/ideas.md in blog-private, as a queue, oldest first (docs/blog-admin-plan.md,
// stage 9). The weekly run, and Generate on an empty post, take the one at the top, and an idea
// leaves the list once a post is made from it. Add one from the phone, or share a page to the
// installed admin from another app; move one to the top, edit or delete it, or draft it now.
// Each change is a commit there.
import { computed, nextTick, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';
import Dialog from '../Dialog.vue';
import Icon from '../Icon.vue';

const route = useRoute();
const router = useRouter();
const ideas = ref(null);
const file = ref('');
const weekly = ref(null);
const title = ref('');
const details = ref('');
const next = ref(false);
const shared = ref(false);
const titleInput = ref(null);
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

/** A page shared from another app (src/admin/share-target.js) fills in the new idea. */
function takeShare() {
  const { shared: from, title: sharedTitle = '', text = '', url = '' } = route.query;
  if (!from) return;
  // Android often puts the link in the text, so it only goes in once
  const link = url && !text.includes(url) ? url : '';
  title.value = String(sharedTitle || (!link && !/^https?:\/\//.test(text) ? text.split('\n')[0] : '')).slice(0, 200);
  details.value = [text && text !== title.value ? text : '', link].filter(Boolean).join('\n\n');
  shared.value = true;
  router.replace('/ideas');
  nextTick(() => titleInput.value?.focus());
}

onMounted(() => {
  takeShare();
  api('/weekly').then((result) => (weekly.value = result)).catch(() => {});
  load().catch((error) => {
    failed.value = true;
    message.value = error.message;
  });
});

/** What the next weekly run writes, for the banner. */
const nextRun = computed(() => {
  const settings = weekly.value?.settings;
  if (!settings) return null;
  const day = new Date(`${weekly.value.next}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  if (!settings.enabled) return { off: true };
  if (settings.topic?.trim()) return { day, topic: true };
  return { day, idea: ideas.value?.[0] ?? null };
});

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
  const body = { title: title.value, details: details.value, next: next.value };
  if (await run(() => api('/ideas', { method: 'POST', body }), next.value ? 'Added, at the top.' : 'Added, at the end of the queue.')) {
    title.value = '';
    details.value = '';
    next.value = false;
    shared.value = false;
  }
}

const makeNext = (idea) => run(() => api(`/ideas/${idea.id}`, { method: 'PUT', body: { next: true } }), `“${idea.title}” is next.`);

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
    // The editor opens with Generate ready, so the draft starts with one more tap
    router.push(`/posts/${id}?generate=1`);
  } catch (error) {
    failed.value = true;
    message.value = error.message;
    busy.value = false;
    if (error.status === 409) await load().catch(() => {});
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
      <p>Anything you might want to write about: a line, rough notes, links. Your ideas come before the AI's own: each weekly run writes the one at the top, and the AI only picks a topic itself when the queue is empty.</p>
    </div>

    <div v-if="nextRun" class="card banner" :class="{ off: nextRun.off }">
      <Icon name="calendar" />
      <span v-if="nextRun.off">The weekly run is off, so ideas wait until you draft them or turn it on.</span>
      <span v-else-if="nextRun.topic">{{ nextRun.day }}, 09:00: the weekly run writes the topic set on the Weekly page, then your ideas the weeks after.</span>
      <span v-else-if="nextRun.idea">{{ nextRun.day }}, 09:00: the weekly run writes <strong>{{ nextRun.idea.title }}</strong>.</span>
      <span v-else>{{ nextRun.day }}, 09:00: with no ideas queued, the AI picks a topic itself.</span>
      <RouterLink to="/weekly">Weekly settings</RouterLink>
    </div>

    <form class="card add" @submit.prevent="add">
      <p v-if="shared" class="shared"><Icon name="external" />Shared from another app. Add a line of your own if you like.</p>
      <label>
        <span class="label">New idea</span>
        <input ref="titleInput" v-model="title" class="inp" placeholder="One line is enough" maxlength="200" />
      </label>
      <label>
        <span class="label">Notes and links (optional)</span>
        <textarea v-model="details" class="inp" rows="3" placeholder="Paste links, rough notes, half a thought. If the AI needs your angle, it asks you."></textarea>
      </label>
      <div class="end">
        <label class="next"><input v-model="next" type="checkbox" />Write this one next</label>
        <button type="submit" class="btn btn-go" :disabled="busy || !title.trim()"><Icon name="plus" />Add idea</button>
      </div>
    </form>

    <p v-if="message" class="card note" :class="failed ? 'bad' : 'good'" role="status">{{ message }}</p>

    <p v-if="ideas === null && !failed" class="muted">Loading</p>
    <p v-else-if="ideas && !ideas.length" class="muted">No ideas queued. Until there are, the weekly run picks a topic itself.</p>

    <section v-if="ideas?.length" class="list" aria-labelledby="queue">
      <h2 id="queue" class="hd queue">Up next <span class="muted">{{ ideas.length }} waiting · oldest first, unless you move one up</span></h2>
      <div v-for="(idea, index) in ideas" :key="idea.id" class="card idea" :class="{ first: index === 0 }">
        <template v-if="editing?.id === idea.id">
          <form class="edit" @submit.prevent="saveEdit">
            <input v-model="editing.title" class="inp" maxlength="200" aria-label="The idea" />
            <textarea v-model="editing.details" class="inp" rows="3" aria-label="Notes and links" placeholder="Notes and links (optional)"></textarea>
            <div class="end">
              <button type="button" class="btn" :disabled="busy" @click="editing = null">Cancel</button>
              <button type="submit" class="btn btn-go" :disabled="busy || !editing.title.trim()">Save</button>
            </div>
          </form>
        </template>
        <template v-else>
          <span class="pos" :aria-label="`Number ${index + 1} in the queue`">{{ index + 1 }}</span>
          <div class="text">
            <strong>{{ idea.title }}</strong>
            <p v-if="idea.details" class="details">{{ idea.details }}</p>
            <div class="muted when">{{ added(idea.added) }}</div>
          </div>
          <div class="actions">
            <button v-if="index > 0" type="button" class="btn small" :disabled="busy" @click="makeNext(idea)">Make next</button>
            <button type="button" class="btn btn-ai small" :disabled="busy" @click="draft(idea)">Draft now</button>
            <button type="button" class="iconbtn" :disabled="busy" aria-label="Edit the idea" @click="startEdit(idea)"><Icon name="pen" /></button>
            <button type="button" class="iconbtn" :disabled="busy" aria-label="Delete the idea" @click="deleting = idea"><Icon name="trash" /></button>
          </div>
        </template>
      </div>
    </section>

    <p class="muted foot">
      Saved privately in blog-private, never on the site. Once an idea becomes a post, it leaves this list and its words go with the post. Draft now does that straight away and starts the AI on it, without waiting for Saturday.
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
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
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

.pos {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--line);
  color: var(--secondary);
  font-weight: 700;
  font-size: 14px;
  flex: none;
}

.first .pos {
  background: var(--green);
  color: var(--ground);
}

.queue {
  font-size: 20px;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.queue .muted {
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0;
}

.banner {
  padding: 14px 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  border-color: #2a3a2e;
  background: #111a15;
  color: var(--body);
}

.banner > .ic {
  color: var(--green);
}

.banner > span {
  flex: 1 1 300px;
}

.banner strong {
  color: var(--text);
}

.banner a {
  font-weight: 700;
  font-size: 14px;
}

.banner.off {
  border-color: var(--line);
  background: var(--surface);
}

.banner.off > .ic {
  color: var(--muted);
}

.shared {
  margin: 0;
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--green);
  font-size: 14px;
  font-weight: 700;
}

.next {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  margin-right: auto;
  cursor: pointer;
}

.next input {
  width: 20px;
  height: 20px;
  accent-color: var(--green);
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
