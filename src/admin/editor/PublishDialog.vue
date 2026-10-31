<script setup>
// Publishing a draft (now or at a set time), or updating a live post, with the option to pin
// it. "Check the build" runs the whole thing except the commit. A gap the AI left for Keith's
// own words stops both, as it does in the API.
import { computed, ref } from 'vue';
import { ukEndOfDay as endOfDay } from '../site.js';
import Dialog from '../Dialog.vue';
import Icon from '../Icon.vue';

const props = defineProps({
  post: { type: Object, required: true },
  live: { type: Boolean, default: false },
  pinned: { type: Object, default: null },
  problems: { type: Array, default: () => [] },
  gaps: { type: Number, default: 0 },
  coverUrl: { type: String, default: null },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['close', 'publish']);

const ukToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const when = ref('now');
const date = ref(ukToday);
const time = ref('09:00');
const pin = ref(props.pinned?.slug === props.post.slug && !!props.post.slug);
const pinUntil = ref(props.pinned?.slug === props.post.slug ? (props.pinned.until ?? '').slice(0, 10) : '');

const pinChanged = computed(() => pin.value !== (props.pinned?.slug === props.post.slug) || (pin.value && endOfDay(pinUntil.value) !== (props.pinned?.until ?? null)));

function submit(dryRun = false) {
  const request = { dryRun };
  if (!props.live && when.value === 'schedule') Object.assign(request, { when: 'schedule', at: `${date.value}T${time.value}` });
  if (pinChanged.value || (!props.live && pin.value)) request.pin = pin.value ? { until: endOfDay(pinUntil.value) } : null;
  emit('publish', request);
}

const label = computed(() => {
  if (props.live) return 'Update live post';
  if (when.value === 'schedule') {
    const day = new Date(`${date.value}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return `Schedule for ${day}, ${time.value}`;
  }
  return 'Publish now';
});
</script>

<template>
  <Dialog :title="live ? 'Update the live post' : 'Publish'" wide @close="emit('close')">
    <div class="post">
      <img v-if="coverUrl" :src="coverUrl" alt="" />
      <div>
        <strong class="hd">{{ post.title || 'Untitled' }}</strong>
        <div class="mono muted url">keithvassallo.com/blog/{{ post.slug }}</div>
      </div>
    </div>

    <fieldset v-if="!live" class="when">
      <legend class="label">When</legend>
      <label :class="{ on: when === 'now' }"><input v-model="when" type="radio" value="now" /><strong>Publish now</strong><span class="muted">Live in a few minutes</span></label>
      <label :class="{ on: when === 'schedule' }"><input v-model="when" type="radio" value="schedule" /><strong>Schedule</strong><span class="muted">Pick a date and time</span></label>
    </fieldset>
    <div v-if="!live && when === 'schedule'" class="pair">
      <label><span class="label">Date</span><input v-model="date" class="inp" type="date" :min="ukToday" /></label>
      <label><span class="label">Time (UK)</span><input v-model="time" class="inp" type="time" /></label>
    </div>
    <p v-if="!live && when === 'schedule'" class="muted note">It's built and goes live at that minute. Until then it isn't in the repo, the feed or the sitemap.</p>
    <p v-if="live" class="muted note">Publishes your changes since it went live, and sets its updated date to today.</p>

    <div class="card pin">
      <label class="switch">
        <input v-model="pin" type="checkbox" />
        <span><strong>Pin it to the top of the blog</strong><br /><span class="muted">{{ pinned?.slug && pinned.slug !== post.slug ? `Replaces the current pin, ${pinned.slug}` : 'One pinned post at a time' }}</span></span>
      </label>
      <label v-if="pin" class="until"><span class="label">Pinned until (optional)</span><input v-model="pinUntil" class="inp" type="date" :min="ukToday" /></label>
      <p v-if="pin" class="muted note">On that date the page's own script drops the pin, with no rebuild.</p>
    </div>

    <p v-if="gaps" class="error"><Icon name="alert" />{{ gaps === 1 ? 'A gap is' : `${gaps} gaps are` }} still waiting for your words. Fill {{ gaps === 1 ? 'it' : 'them' }} under For you first.</p>
    <p v-else-if="problems.length" class="warn"><Icon name="alert" />{{ problems.length }} {{ problems.length === 1 ? 'check fails' : 'checks fail' }}. You can still publish; the Checks tab lists {{ problems.length === 1 ? 'it' : 'them' }}.</p>
    <p v-else class="good"><Icon name="check" />Every check passes. The production build runs again before anything goes live.</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template #buttons>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="button" class="btn" :disabled="busy || gaps > 0" title="Runs everything except the commit" @click="submit(true)">Check the build</button>
      <button type="button" class="btn btn-go" :disabled="busy || gaps > 0 || (!live && when === 'schedule' && (!date || !time))" @click="submit(false)">{{ label }}</button>
    </template>
  </Dialog>
</template>

<style scoped>
.post {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 16px;
}

.post img {
  width: 110px;
  height: 55px;
  object-fit: cover;
  border-radius: 8px;
  flex: none;
}

.post strong {
  font-size: 18px;
}

.url {
  font-size: 13px;
  word-break: break-all;
}

.label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
  margin-bottom: 6px;
}

.when {
  border: 0;
  padding: 0;
  margin: 0 0 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.when legend {
  grid-column: 1 / -1;
}

.when label {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--ground);
  cursor: pointer;
}

.when label.on {
  border-color: var(--green);
  background: #1e2a22;
}

.when input {
  position: absolute;
  opacity: 0;
}

.when label:has(input:focus-visible) {
  outline: 2px solid var(--green);
}

.when strong {
  color: var(--text);
}

.when .muted {
  font-size: 13px;
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.note {
  font-size: 13px;
  margin: 8px 0 0;
}

.pin {
  margin-top: 14px;
  padding: 14px 16px;
  background: var(--ground);
}

.switch {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  cursor: pointer;
}

.switch input {
  width: 20px;
  height: 20px;
  margin-top: 2px;
  accent-color: var(--green);
}

.switch strong {
  color: var(--text);
}

.switch .muted {
  font-size: 13px;
}

.until {
  display: block;
  margin-top: 12px;
}

.warn,
.good,
.error {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
  margin: 16px 0 0;
}

.warn {
  color: var(--yellow);
}

.good {
  color: var(--green);
}

.error {
  color: var(--red);
}
</style>
