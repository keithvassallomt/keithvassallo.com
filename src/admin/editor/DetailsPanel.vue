<script setup>
// The post's frontmatter: slug, description, category, tags, cover and share blurbs. Edits go
// straight into `post`, which the editor autosaves.
import { computed, ref } from 'vue';
import { shareRules } from '../../lib/share.ts';
import { SITE } from '../../lib/site.ts';
import { SHARE_KEYS } from '../../lib/post-checks.mjs';
import { slugify } from '../site.js';
import Icon from '../Icon.vue';

const props = defineProps({
  post: { type: Object, required: true },
  categories: { type: Array, default: () => [] },
  coverUrl: { type: String, default: null },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['cover', 'remove-cover', 'regenerate']);

const NETWORKS = { linkedin: 'LinkedIn', x: 'X', bluesky: 'Bluesky', threads: 'Threads', mastodon: 'Mastodon', facebook: 'Facebook' };

const tag = ref('');
const coverPicker = ref(null);

const rules = computed(() => shareRules(`${SITE.url}/blog/${props.post.slug || 'your-post'}`));
const blurb = (key) => {
  const text = props.post.share[key] ?? '';
  const rule = rules.value[key];
  const length = rule.length(text || props.post.description);
  return { length, limit: rule.limit, over: length > rule.limit, own: !!text.trim() };
};
const described = computed(() => props.post.description.length);

function setSlug(event) {
  props.post.slug = event.target.value;
  props.post.slugTouched = true;
}

function resetSlug() {
  props.post.slugTouched = false;
  props.post.slug = slugify(props.post.title);
}

function addTag() {
  const name = tag.value.replace(/,/g, '').trim();
  if (name && !props.post.tags.some((existing) => existing.toLowerCase() === name.toLowerCase())) props.post.tags.push(name);
  tag.value = '';
}

function tagKey(event) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    addTag();
  } else if (event.key === 'Backspace' && !tag.value && props.post.tags.length) {
    props.post.tags.pop();
  }
}

function setBlurb(key, value) {
  props.post.share = { ...props.post.share, [key]: value };
}

function pickedCover(event) {
  const [file] = event.target.files;
  event.target.value = '';
  if (file) emit('cover', file);
}
</script>

<template>
  <div class="details">
    <div class="field">
      <div class="label"><span>Cover</span><span class="muted">2:1, shown on cards and the post</span></div>
      <img v-if="coverUrl" :src="coverUrl" alt="" class="cover" />
      <div v-else class="cover empty muted">No cover</div>
      <div class="row">
        <button type="button" class="btn small" :disabled="busy" @click="coverPicker.click()"><Icon name="image" />{{ post.cover ? 'Replace' : 'Upload a cover' }}</button>
        <button type="button" class="btn small ai" :disabled="busy" @click="emit('regenerate')"><Icon name="sparkles" />{{ post.cover ? 'Regenerate' : 'Draw one' }}</button>
        <button v-if="post.cover" type="button" class="btn small quiet" :disabled="busy" @click="emit('remove-cover')">Remove</button>
      </div>
      <input ref="coverPicker" type="file" accept="image/*" hidden @change="pickedCover" />
    </div>

    <label v-if="post.cover" class="field">
      <span class="label"><span>Cover alt text</span></span>
      <textarea v-model="post.coverAlt" class="inp" rows="2" placeholder="What the image shows, for people who can't see it"></textarea>
    </label>

    <div class="field">
      <label class="label" for="details-slug"><span>Slug</span><button v-if="post.slugTouched" type="button" class="link" @click="resetSlug">Match the title</button></label>
      <input id="details-slug" class="inp mono" :value="post.slug" autocapitalize="none" spellcheck="false" @input="setSlug" />
      <span class="muted hint">keithvassallo.com/blog/{{ post.slug || '…' }}</span>
    </div>

    <label class="field">
      <span class="label">
        <span>Description</span>
        <span :class="described >= 120 && described <= 160 ? 'good' : 'bad'">{{ described }} / 120 to 160</span>
      </span>
      <textarea v-model="post.description" class="inp" rows="3" placeholder="One or two sentences for cards, search results and the feed"></textarea>
    </label>

    <label class="field">
      <span class="label"><span>Category</span></span>
      <select v-model="post.category" class="inp">
        <option value="" disabled>Choose one</option>
        <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
      </select>
    </label>

    <div class="field">
      <div class="label">
        <span>Tags</span>
        <span :class="post.tags.length >= 2 && post.tags.length <= 5 ? 'good' : 'bad'">{{ post.tags.length }} / 2 to 5</span>
      </div>
      <div class="tags">
        <span v-for="(name, index) in post.tags" :key="name" class="tag">
          {{ name }}<button type="button" :aria-label="`Remove the tag ${name}`" @click="post.tags.splice(index, 1)"><Icon name="close" /></button>
        </span>
        <input v-model="tag" class="tag-input" placeholder="Add a tag" aria-label="Add a tag" @keydown="tagKey" @blur="addTag" />
      </div>
    </div>

    <details class="field share">
      <summary class="label"><span>Share blurbs</span><span class="muted">optional, the description fills in</span></summary>
      <label v-for="key in SHARE_KEYS" :key="key" class="blurb">
        <span class="label">
          <span>{{ NETWORKS[key] }}</span>
          <span :class="blurb(key).over ? 'bad' : blurb(key).own ? 'good' : 'muted'">
            {{ blurb(key).length.toLocaleString('en-GB') }} / {{ blurb(key).limit.toLocaleString('en-GB') }}{{ blurb(key).own ? '' : ', the description' }}
          </span>
        </span>
        <textarea class="inp" rows="3" :value="post.share[key] ?? ''" @input="setBlurb(key, $event.target.value)"></textarea>
      </label>
    </details>
  </div>
</template>

<style scoped>
.details {
  padding: 18px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
}

.label .muted,
.label .good,
.label .bad {
  font-weight: 400;
}

.good {
  color: var(--green);
}

.bad {
  color: var(--red);
}

.hint,
.small-note {
  font-size: 13px;
}

.cover {
  width: 100%;
  aspect-ratio: 2 / 1;
  object-fit: cover;
  border-radius: 10px;
  display: block;
}

.cover.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--line-strong);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.btn.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 14px;
}

.btn.quiet {
  color: var(--secondary);
}

.btn.ai {
  color: var(--pink);
}

.link {
  border: 0;
  background: none;
  padding: 0;
  color: var(--green);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--ground);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 4px 0 12px;
  border-radius: 999px;
  background: #1a2029;
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}

.tag button {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.tag button .ic {
  width: 14px;
  height: 14px;
}

.tag-input {
  flex: 1;
  min-width: 120px;
  min-height: 32px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  outline: none;
}

.share summary {
  cursor: pointer;
  min-height: 32px;
  align-items: center;
}

.blurb {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}
</style>
