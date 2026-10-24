<script setup>
// One post in the editor. Every change saves itself two seconds after you stop typing, and is
// kept on this device first, so a dropped connection or a closed tab loses nothing. A save
// that another device beat to it shows both sides instead of overwriting either.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';
import { siteData, slugify, ukEndOfDay } from '../site.js';
import { postProblems, slugFormatProblem } from '../../lib/post-checks.mjs';
import { imageName, prepareImage, uploadImage } from '../editor/images.js';
import MarkdownEditor from '../editor/MarkdownEditor.vue';
import PreviewFrame from '../editor/PreviewFrame.vue';
import DetailsPanel from '../editor/DetailsPanel.vue';
import ChecksPanel from '../editor/ChecksPanel.vue';
import HistoryPanel from '../editor/HistoryPanel.vue';
import JobBanner from '../editor/JobBanner.vue';
import PublishDialog from '../editor/PublishDialog.vue';
import Dialog from '../Dialog.vue';
import Icon from '../Icon.vue';

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();

const FIELDS = ['title', 'slug', 'slugTouched', 'description', 'category', 'tags', 'cover', 'coverAlt', 'share', 'notes', 'body'];
const BACKUP = `kv-admin-draft-${props.id}`;

const post = reactive({ title: '', slug: '', slugTouched: false, description: '', category: '', tags: [], cover: null, coverAlt: '', share: {}, notes: '', body: '' });
const meta = reactive({ status: 'draft', source: 'by-hand', version: 0, updated: null, liveSlug: null, publishedVersion: null, scheduledFor: null, job: null, repoChanged: false });
const loaded = ref(false);
const loadError = ref('');
const site = ref(null);
const otherSlugs = ref(new Set());
const images = ref([]);
const localCover = ref(null);

const saveState = ref('saved');
const saveError = ref('');
const conflict = ref(null);
const leftover = ref(null);
let lastSaved = '';
let timer = null;
let saving = null;
let again = false;

const html = ref('');
const previewError = ref('');
const busy = ref('');
const panel = ref('details');
const pane = ref('write');
const phone = ref(false);
const editor = ref(null);
const history = ref(null);
const menuOpen = ref(false);
const dialog = ref(null);
const acting = ref(false);
const actionError = ref('');
const confirmTitle = ref('');
const pinUntil = ref('');
const pinned = ref(null);
const dismissed = ref(null);

const fields = () => JSON.stringify(Object.fromEntries(FIELDS.map((key) => [key, post[key]])));

function apply(data) {
  // Copied through JSON: the conflicting copy arrives wrapped in Vue's proxies
  for (const key of FIELDS) post[key] = JSON.parse(JSON.stringify(data[key] ?? post[key]));
  meta.version = data.version;
  meta.updated = data.updated;
  applyStatus(data);
  lastSaved = fields();
}

/** Status only, leaving the text alone: a job finishing mustn't touch what's being typed. */
function applyStatus(data) {
  Object.assign(meta, {
    status: data.status,
    source: data.source,
    liveSlug: data.liveSlug ?? null,
    publishedVersion: data.publishedVersion ?? null,
    scheduledFor: data.scheduledFor ?? null,
    job: data.job ?? null,
    repoChanged: !!data.repoChanged,
  });
}

// ---- keeping a copy on this device ---------------------------------------------------
const storage = {
  read: () => {
    try {
      return JSON.parse(localStorage.getItem(BACKUP) || 'null');
    } catch {
      return null;
    }
  },
  write: (value) => {
    try {
      localStorage.setItem(BACKUP, JSON.stringify(value));
    } catch {
      // Out of space or private mode: the server copy is still being saved
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(BACKUP);
    } catch {
      // Nothing to clear
    }
  },
};

// ---- saving ----------------------------------------------------------------------------
async function save() {
  clearTimeout(timer);
  if (conflict.value || meta.status === 'bin') return;
  if (saving) {
    again = true;
    return;
  }
  const snapshot = fields();
  if (snapshot === lastSaved) {
    saveState.value = 'saved';
    return;
  }
  saveState.value = 'saving';
  saving = api(`/posts/${props.id}`, { method: 'PUT', body: { ...JSON.parse(snapshot), version: meta.version } });
  try {
    const result = await saving;
    meta.version = result.version;
    meta.updated = result.updated;
    lastSaved = snapshot;
    saveError.value = '';
    if (fields() === snapshot) {
      storage.clear();
      saveState.value = 'saved';
    } else {
      again = true;
    }
  } catch (error) {
    if (error.status === 409 && error.data?.current) {
      conflict.value = error.data.current;
      saveState.value = 'conflict';
    } else if (!error.status) {
      saveState.value = 'offline';
      timer = setTimeout(save, 10_000);
    } else {
      saveState.value = 'error';
      saveError.value = error.message;
    }
  } finally {
    saving = null;
    if (again) {
      again = false;
      save();
    }
  }
}

watch(fields, (now) => {
  if (!loaded.value || now === lastSaved) return;
  saveState.value = saveState.value === 'conflict' ? 'conflict' : 'unsaved';
  storage.write({ baseVersion: meta.version, fields: now, at: new Date().toISOString() });
  clearTimeout(timer);
  timer = setTimeout(save, 2000);
});

// The slug follows the title until you change it yourself
watch(
  () => post.title,
  (title) => {
    if (loaded.value && !post.slugTouched) post.slug = slugify(title);
  },
);

function useTheirs() {
  apply(conflict.value);
  conflict.value = null;
  storage.clear();
  saveState.value = 'saved';
}

function keepMine() {
  meta.version = conflict.value.version;
  conflict.value = null;
  save();
}

function useLeftover() {
  Object.assign(post, JSON.parse(leftover.value.fields));
  leftover.value = null;
}

function dropLeftover() {
  storage.clear();
  leftover.value = null;
}

const saveLabel = computed(() => {
  const time = meta.updated ? new Date(meta.updated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  return {
    saved: time ? `Saved ${time}` : 'Saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving',
    offline: 'Offline. Kept on this device, retrying',
    conflict: 'Changed on another device',
    error: `Not saved: ${saveError.value}`,
  }[saveState.value];
});

// Save straight away when the tab is hidden, which is when a phone may close it
const flush = () => document.visibilityState === 'hidden' && save();
const warn = (event) => {
  if (['unsaved', 'saving', 'offline'].includes(saveState.value)) event.preventDefault();
};

// ---- checks ----------------------------------------------------------------------------
const checked = ref([]);
let checkTimer = null;
function runChecks() {
  if (!site.value) return;
  const imageNames = new Set(images.value.map((image) => image.name));
  const repoSlugs = new Set(site.value.posts.map((entry) => entry.slug));
  const problems = postProblems(
    post,
    {
      categoryIds: new Set(site.value.categories.map((category) => category.id)),
      publishedSlugs: new Set(site.value.posts.filter((entry) => !entry.draft).map((entry) => entry.slug)),
      projectIds: new Set(site.value.projectIds),
      imageExists: (path) => imageNames.has(path.replace(/^\.\//, '')),
    },
    { requireShare: false },
  );
  const slugTaken = repoSlugs.has(post.slug) || otherSlugs.value.has(post.slug);
  const slugProblem = slugFormatProblem(post.slug) ?? (slugTaken ? `The slug "${post.slug}" is already taken. Choose another.` : null);
  if (post.cover && !post.coverAlt.trim()) problems.unshift({ message: 'The cover needs alt text.' });
  checked.value = slugProblem ? [{ message: slugProblem }, ...problems] : problems;
}
watch(fields, () => {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(runChecks, 300);
});

// ---- preview ---------------------------------------------------------------------------
const previewShown = computed(() => !phone.value || pane.value === 'preview');
let previewTimer = null;
async function renderPreview() {
  if (!previewShown.value || !loaded.value) return;
  const body = post.body;
  try {
    const result = await api(`/posts/${props.id}/preview`, { method: 'POST', body: { body } });
    if (body === post.body) html.value = result.html;
    previewError.value = '';
  } catch (error) {
    previewError.value = error.message;
  }
}
watch([() => post.body, previewShown], () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 600);
});

// ---- images ----------------------------------------------------------------------------
async function addImages(files) {
  for (const [index, file] of files.entries()) {
    busy.value = files.length > 1 ? `Uploading image ${index + 1} of ${files.length}` : 'Uploading image';
    try {
      const { blob, extension } = await prepareImage(file);
      const name = await uploadImage(props.id, blob, imageName(file, extension));
      images.value = [...images.value, { name }];
      editor.value.insertImage(name);
    } catch (error) {
      busy.value = `That image didn't upload: ${error.message}`;
      return;
    }
  }
  busy.value = '';
  renderPreview();
}

async function setCover(file) {
  busy.value = 'Uploading the cover';
  try {
    const { blob, extension } = await prepareImage(file);
    const name = await uploadImage(props.id, blob, `cover.${extension}`);
    if (localCover.value) URL.revokeObjectURL(localCover.value);
    localCover.value = URL.createObjectURL(blob);
    images.value = [...images.value.filter((image) => image.name !== name), { name }];
    post.cover = name;
    busy.value = '';
  } catch (error) {
    busy.value = `The cover didn't upload: ${error.message}`;
  }
}

const coverUrl = computed(() => {
  if (!post.cover) return null;
  if (localCover.value) return localCover.value;
  return images.value.find((image) => image.name === post.cover)?.url ?? null;
});

// ---- history and the bin ---------------------------------------------------------------
async function restore(version) {
  await save();
  try {
    const data = await api(`/posts/${props.id}/versions/${encodeURIComponent(version.id)}/restore`, { method: 'POST' });
    apply(data);
    images.value = data.images;
    storage.clear();
    saveState.value = 'saved';
    history.value?.load();
    renderPreview();
  } catch (error) {
    saveState.value = 'error';
    saveError.value = error.message;
  }
}

async function binIt() {
  menuOpen.value = false;
  if (!confirm(`Move "${post.title || 'Untitled'}" to the bin? It stays there for 30 days, and you can restore it until then.`)) return;
  await save();
  await api(`/posts/${props.id}`, { method: 'DELETE' });
  storage.clear();
  router.push('/');
}

async function unbin() {
  const data = await api(`/posts/${props.id}/restore`, { method: 'POST' });
  apply(data);
}

// ---- publishing ------------------------------------------------------------------------
const changed = computed(() => meta.liveSlug && meta.publishedVersion !== null && meta.version > meta.publishedVersion);
const jobActive = computed(() => ['queued', 'running'].includes(meta.job?.status));
const showJob = computed(() => meta.job && meta.job.id !== dismissed.value);
const chip = computed(() => {
  if (meta.status === 'bin') return { label: 'In the bin', style: 'color: var(--red); background: rgba(255,123,114,0.12)' };
  if (meta.status === 'scheduled') return { label: 'Scheduled', style: 'color: var(--yellow); background: rgba(242,204,96,0.12)' };
  if (meta.liveSlug) return { label: changed.value ? 'Live, with changes' : 'Live', style: 'color: var(--green); background: rgba(140,212,156,0.12)' };
  return { label: 'Draft', style: 'color: var(--secondary); background: rgba(138,147,161,0.14)' };
});
const scheduledLabel = computed(() => {
  if (!meta.scheduledFor) return '';
  const [day, time] = meta.scheduledFor.split('T');
  return `${new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
});

/** Waits until every edit so far is saved. */
async function settle() {
  clearTimeout(timer);
  for (let tries = 0; tries < 20 && saveState.value !== 'saved'; tries++) {
    if (['conflict', 'error'].includes(saveState.value)) throw new Error('Save the post first: it has changes that didn\u2019t save.');
    if (!saving) await save();
    if (saving) await saving.catch(() => {});
  }
}

async function act(run) {
  acting.value = true;
  actionError.value = '';
  try {
    await settle();
    const result = await run();
    if (result?.job) meta.job = result.job;
    else if (result?.id) applyStatus(result);
    dialog.value = null;
    menuOpen.value = false;
  } catch (error) {
    actionError.value = error.message;
  } finally {
    acting.value = false;
  }
}

const publish = (request) => act(() => api(`/posts/${props.id}/publish`, { method: 'POST', body: request }));
const unpublish = () => act(() => api(`/posts/${props.id}/unpublish`, { method: 'POST' }));
const deleteLive = () => act(() => api(`/posts/${props.id}/delete-live`, { method: 'POST', body: { title: confirmTitle.value } }));
const pin = () => act(() => api(`/posts/${props.id}/pin`, { method: 'POST', body: { until: ukEndOfDay(pinUntil.value) } }));
const unpin = () => act(() => api(`/posts/${props.id}/pin`, { method: 'DELETE' }));
const cancelSchedule = () => act(() => api(`/posts/${props.id}/schedule`, { method: 'DELETE' }));

function open(name) {
  menuOpen.value = false;
  actionError.value = '';
  confirmTitle.value = '';
  dialog.value = name;
}

async function jobFinished(job) {
  const data = await api(`/posts/${props.id}`).catch(() => null);
  if (data) applyStatus(data);
  if (job.status === 'done' && job.kind === 'pin') pinned.value = (await api('/settings').catch(() => ({}))).pin ?? pinned.value;
  if (job.status === 'done' && job.kind === 'delete') router.push('/');
}

async function repoChoice(use) {
  try {
    const data = await api(`/posts/${props.id}/repo`, { method: 'POST', body: { use } });
    if (use === 'repo') {
      apply(data);
      images.value = data.images;
      storage.clear();
      renderPreview();
    } else {
      applyStatus(data);
    }
    meta.repoChanged = false;
  } catch (error) {
    actionError.value = error.message;
  }
}

// ---- loading ---------------------------------------------------------------------------
let media = null;
const layout = () => (phone.value = media.matches);

onMounted(async () => {
  media = matchMedia('(max-width: 900px)');
  layout();
  media.addEventListener('change', layout);
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('beforeunload', warn);
  window.addEventListener('online', save);
  try {
    const [data, siteInfo, list, settings] = await Promise.all([api(`/posts/${props.id}`), siteData(), api('/posts'), api('/settings').catch(() => ({}))]);
    pinned.value = settings.pin ?? (siteInfo.pin?.slug ? siteInfo.pin : null);
    apply(data);
    images.value = data.images;
    site.value = siteInfo;
    otherSlugs.value = new Set(list.posts.filter((entry) => entry.id !== props.id && entry.slug).map((entry) => entry.slug));
    // Edits this device made but never managed to save
    const backup = storage.read();
    if (backup && backup.fields !== lastSaved) {
      if (backup.baseVersion === data.version) Object.assign(post, JSON.parse(backup.fields));
      else leftover.value = backup;
    }
    loaded.value = true;
    runChecks();
    renderPreview();
    if (lastSaved !== fields()) save();
  } catch (error) {
    loadError.value = error.status === 404 ? "This post doesn't exist, or has been emptied from the bin." : error.message;
  }
});

onBeforeUnmount(() => {
  save();
  media?.removeEventListener('change', layout);
  document.removeEventListener('visibilitychange', flush);
  window.removeEventListener('beforeunload', warn);
  window.removeEventListener('online', save);
  if (localCover.value) URL.revokeObjectURL(localCover.value);
});

const panes = computed(() => [
  ['write', 'Write'],
  ['preview', 'Preview'],
  ['details', 'Details'],
  ['checks', checked.value.length ? `Checks (${checked.value.length})` : 'Checks'],
  ['history', 'History'],
]);
const panels = computed(() => panes.value.slice(2));
const showPanel = (name) => (phone.value ? pane.value === name : panel.value === name);

function goToProblem(line) {
  if (phone.value) pane.value = 'write';
  requestAnimationFrame(() => editor.value?.goToLine(line));
}
</script>

<template>
  <div v-if="loadError" class="page">
    <p class="card notice" role="alert">{{ loadError }}</p>
    <RouterLink to="/">Back to posts</RouterLink>
  </div>

  <div v-else class="editor" :class="{ phone }">
    <header class="bar">
      <RouterLink to="/" class="btn back" aria-label="Back to posts"><Icon name="back" /><span class="wide">Posts</span></RouterLink>
      <span class="chip" :style="chip.style">{{ chip.label }}</span>
      <span class="state" :class="saveState" role="status">{{ loaded ? saveLabel : 'Loading' }}</span>
      <span class="grow"></span>
      <button type="button" class="btn ai" disabled title="Generate and Revise arrive in stage 5"><Icon name="sparkles" /><span class="wide">Generate</span></button>
      <button v-if="meta.liveSlug" type="button" class="btn btn-go" :disabled="!changed || jobActive || meta.status === 'bin'" :title="changed ? '' : 'No changes since it went live'" @click="open('publish')">
        <span class="wide">Update live post</span><span class="narrow">Update</span>
      </button>
      <button v-else type="button" class="btn btn-go" :disabled="jobActive || meta.status !== 'draft'" @click="open('publish')">Publish</button>
      <div class="menu-wrap">
        <button type="button" class="btn icon" aria-label="More actions" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><Icon name="more" /></button>
        <div v-if="menuOpen" class="card menu">
          <template v-if="meta.liveSlug">
            <button v-if="pinned?.slug === meta.liveSlug" type="button" :disabled="jobActive" @click="unpin"><Icon name="pin" />Unpin it</button>
            <button v-else type="button" :disabled="jobActive" @click="open('pin')"><Icon name="pin" />Pin it to the top</button>
            <a :href="`https://keithvassallo.com/blog/${meta.liveSlug}`" target="_blank" rel="noopener"><Icon name="external" />View it live</a>
            <button type="button" :disabled="jobActive" @click="open('unpublish')"><Icon name="restore" />Unpublish, back to drafts</button>
            <button type="button" class="danger" :disabled="jobActive" @click="open('delete')"><Icon name="trash" />Delete from the live site</button>
          </template>
          <button v-else-if="meta.status === 'scheduled'" type="button" @click="cancelSchedule"><Icon name="close" />Cancel the schedule</button>
          <button v-else-if="meta.status !== 'bin'" type="button" class="danger" @click="binIt"><Icon name="trash" />Move to the bin</button>
          <button v-else type="button" @click="unbin"><Icon name="restore" />Restore from the bin</button>
        </div>
      </div>
    </header>

    <div v-if="conflict" class="card banner warn" role="alert">
      <span><strong>This post changed on another device</strong> after this copy was opened. Keep one of them; the other stays in History.</span>
      <span class="actions">
        <button type="button" class="btn" @click="useTheirs">Use the other device's</button>
        <button type="button" class="btn btn-go" @click="keepMine">Keep this one</button>
      </span>
    </div>
    <div v-if="leftover" class="card banner" role="alert">
      <span><strong>Unsaved changes from this device</strong>, from {{ new Date(leftover.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) }}. The post has been saved elsewhere since.</span>
      <span class="actions">
        <button type="button" class="btn" @click="dropLeftover">Discard them</button>
        <button type="button" class="btn btn-go" @click="useLeftover">Use them</button>
      </span>
    </div>
    <div v-if="meta.status === 'bin'" class="card banner">
      <span><strong>This post is in the bin.</strong> Restore it to edit it again.</span>
      <span class="actions"><button type="button" class="btn btn-go" @click="unbin">Restore</button></span>
    </div>
    <div v-if="meta.status === 'scheduled'" class="card banner">
      <span><strong>Goes live {{ scheduledLabel }}.</strong> Edits until then go out with it.</span>
      <span class="actions"><button type="button" class="btn" :disabled="acting" @click="cancelSchedule">Cancel the schedule</button></span>
    </div>
    <div v-if="meta.repoChanged" class="card banner warn" role="alert">
      <span><strong>This post changed in the repo</strong> since the admin last wrote it, perhaps in VS Code.</span>
      <span class="actions">
        <button type="button" class="btn" @click="repoChoice('admin')">Keep this one</button>
        <button type="button" class="btn btn-go" @click="repoChoice('repo')">Load the repo's version</button>
      </span>
    </div>
    <p v-if="actionError && !dialog" class="card banner error-banner" role="alert">{{ actionError }}</p>
    <JobBanner v-if="showJob" :job="meta.job" :slug="meta.liveSlug ?? post.slug" @finished="jobFinished" @dismiss="dismissed = meta.job.id" />

    <nav v-if="phone" class="panes" aria-label="Editor views">
      <button v-for="[name, label] in panes" :key="name" type="button" :class="{ on: pane === name }" :aria-pressed="pane === name" @click="pane = name">{{ label }}</button>
    </nav>

    <div class="body">
      <section v-show="!phone || pane === 'write' || pane === 'preview'" class="work">
        <div v-show="!phone || pane === 'write'" class="writing">
          <input v-model="post.title" class="title hd" placeholder="Title" aria-label="Title" :readonly="meta.status === 'bin'" />
          <details class="card notes">
            <summary><Icon name="sparkles" />Notes for the AI <span class="muted">{{ post.notes.trim() ? '' : '· optional, used from stage 5' }}</span></summary>
            <textarea v-model="post.notes" class="inp" rows="3" placeholder="What you want written, or facts from your own experience. Never published." :readonly="meta.status === 'bin'"></textarea>
          </details>
          <div class="card pane-card">
            <MarkdownEditor ref="editor" v-model="post.body" :problems="checked" :busy="busy" :read-only="meta.status === 'bin'" @files="addImages" />
          </div>
        </div>
        <div v-show="!phone || pane === 'preview'" class="card pane-card previewing">
          <div class="pane-head"><span>Preview</span><span v-if="previewError" class="bad">{{ previewError }}</span><span v-else class="muted">The site's own rendering</span></div>
          <PreviewFrame :html="html" :title="post.title" />
        </div>
      </section>

      <aside v-show="!phone || panels.some(([name]) => name === pane)" class="side">
        <nav v-if="!phone" class="tabs" aria-label="Post panels">
          <button v-for="[name, label] in panels" :key="name" type="button" :class="{ on: panel === name }" :aria-pressed="panel === name" @click="panel = name">{{ label }}</button>
        </nav>
        <DetailsPanel v-if="showPanel('details') && loaded" :post="post" :categories="site?.categories ?? []" :cover-url="coverUrl" :busy="!!busy" @cover="setCover" @remove-cover="post.cover = null" />
        <ChecksPanel v-if="showPanel('checks')" :problems="checked" @go="goToProblem" />
        <HistoryPanel v-if="showPanel('history')" ref="history" :post-id="id" @restore="restore" />
      </aside>
    </div>

    <PublishDialog
      v-if="dialog === 'publish'"
      :post="post"
      :live="!!meta.liveSlug"
      :pinned="pinned"
      :problems="checked"
      :cover-url="coverUrl"
      :busy="acting"
      :error="actionError"
      @close="dialog = null"
      @publish="publish"
    />
    <Dialog v-if="dialog === 'unpublish'" title="Unpublish this post?" @close="dialog = null">
      <p>It comes off keithvassallo.com and goes back to your drafts, with everything in it kept. Links to it will stop working until you publish it again.</p>
      <p v-if="actionError" class="dialog-error">{{ actionError }}</p>
      <template #buttons>
        <button type="button" class="btn" @click="dialog = null">Cancel</button>
        <button type="button" class="btn btn-go" :disabled="acting" @click="unpublish">Unpublish</button>
      </template>
    </Dialog>
    <Dialog v-if="dialog === 'delete'" title="Delete from the live site?" @close="dialog = null">
      <p>It comes off keithvassallo.com and goes to the bin for 30 days. Links to it will break. Type the title to confirm.</p>
      <input v-model="confirmTitle" class="inp" :placeholder="post.title" aria-label="The post's title" />
      <p v-if="actionError" class="dialog-error">{{ actionError }}</p>
      <template #buttons>
        <button type="button" class="btn" @click="dialog = null">Cancel</button>
        <button type="button" class="btn danger-btn" :disabled="acting || confirmTitle !== post.title" @click="deleteLive">Delete it</button>
      </template>
    </Dialog>
    <Dialog v-if="dialog === 'pin'" title="Pin it to the top of the blog?" @close="dialog = null">
      <p>It shows first on the blog's listing, labelled Pinned.{{ pinned?.slug ? ` It replaces the current pin, ${pinned.slug}.` : '' }}</p>
      <label><span class="dialog-label">Pinned until (optional)</span><input v-model="pinUntil" class="inp" type="date" /></label>
      <p class="muted dialog-note">On that date the page's own script drops the pin, with no rebuild.</p>
      <p v-if="actionError" class="dialog-error">{{ actionError }}</p>
      <template #buttons>
        <button type="button" class="btn" @click="dialog = null">Cancel</button>
        <button type="button" class="btn btn-go" :disabled="acting" @click="pin">Pin it</button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--line-soft);
  flex: none;
}

.btn.back {
  background: transparent;
  border-color: transparent;
  color: var(--secondary);
  padding: 0 10px;
}

.btn.icon {
  width: 44px;
  padding: 0;
}

.btn.ai {
  background: var(--pink);
  border-color: var(--pink);
  color: var(--ground);
}

.state {
  font-size: 14px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.state.offline,
.state.conflict {
  color: var(--yellow);
}

.state.error {
  color: var(--red);
}

.grow {
  flex: 1;
}

.menu-wrap {
  position: relative;
}

.menu {
  position: absolute;
  right: 0;
  top: 50px;
  z-index: 20;
  min-width: 240px;
  padding: 6px;
  background: var(--surface-raised);
  border-color: var(--line-strong);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
}

.menu button {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--body);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.menu button:hover {
  background: #1a2029;
}

.menu .danger {
  color: var(--red);
}

.menu a {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  color: var(--body);
  font-weight: 700;
  text-decoration: none;
}

.menu a:hover {
  background: #1a2029;
}

.menu button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.error-banner {
  color: var(--red);
}

.danger-btn {
  color: var(--red);
  border-color: #5a2e2c;
  background: #1a1214;
}

.dialog-error {
  color: var(--red);
}

.dialog-label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
  margin-bottom: 6px;
}

.dialog-note {
  font-size: 13px;
}

.narrow {
  display: none;
}

.banner {
  margin: 12px 20px 0;
  padding: 12px 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  justify-content: space-between;
}

.banner.warn {
  border-color: #5a4a22;
  background: #1c1a12;
}

.banner strong {
  color: var(--text);
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.work {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 16px;
  padding: 18px 20px 20px;
}

.writing {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  width: 100%;
  border: 0;
  background: transparent;
  font-size: 28px;
  font-weight: 700;
  padding: 4px 0;
  outline: none;
}

.title::placeholder {
  color: var(--muted);
}

.notes {
  padding: 0 14px;
  border-color: #3a2e39;
}

.notes summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--pink);
  font-weight: 700;
  cursor: pointer;
}

.notes textarea {
  margin-bottom: 12px;
  resize: vertical;
}

.pane-card {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.previewing {
  flex: 1;
  min-width: 0;
}

.pane-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 0 14px;
  min-height: 49px;
  align-items: center;
  border-bottom: 1px solid var(--line);
  font-weight: 700;
  color: var(--text);
  font-size: 14px;
}

.pane-head .muted,
.pane-head .bad {
  font-weight: 400;
}

.bad {
  color: var(--red);
}

.side {
  flex: 0 0 360px;
  border-left: 1px solid var(--line-soft);
  overflow-y: auto;
}

.tabs,
.panes {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--line);
  padding: 0 8px;
  position: sticky;
  top: 0;
  background: var(--ground);
  z-index: 1;
}

.tabs button,
.panes button {
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--secondary);
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.tabs button.on,
.panes button.on {
  color: var(--text);
  border-bottom-color: var(--green);
}

.notice {
  margin: 0;
  padding: 16px 18px;
  color: var(--red);
}

/* Phone: one view at a time, chosen from the tabs under the bar */

.phone .bar {
  padding: 8px 8px 8px 4px;
  gap: 6px;
}

.phone .wide {
  display: none;
}

.phone .narrow {
  display: inline;
}

.phone .btn.ai {
  width: 44px;
  padding: 0;
}

.phone .panes {
  overflow-x: auto;
  flex: none;
}

.phone .body {
  flex-direction: column;
}

.phone .work {
  padding: 10px 12px 12px;
}

.phone .title {
  font-size: 22px;
}

.phone .side {
  flex: 1;
  border-left: 0;
}

.phone .banner {
  margin: 8px 12px 0;
}
</style>
