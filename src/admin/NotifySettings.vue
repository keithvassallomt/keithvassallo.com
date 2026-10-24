<script setup>
// Notifications: an email and a push to each allowed device when a job ends, for the events
// chosen here. The notifier Lambda does the sending.
import { onMounted, ref } from 'vue';
import { api } from './api.js';
import { currentSubscription, enablePush, pushSupported } from './push.js';
import Icon from './Icon.vue';

const EVENTS = [
  ['draft', 'A draft is ready'],
  ['revision', 'A revision or new cover is ready'],
  ['live', 'A post goes live or comes off'],
  ['failed', 'Something failed'],
  ['weekly', 'A week has no draft'],
];

const prefs = ref(null);
const here = ref(false);
const message = ref('');
const failed = ref(false);
const busy = ref(false);

async function load() {
  prefs.value = (await api('/settings')).notify;
  const subscription = await currentSubscription().catch(() => null);
  here.value = !!subscription;
}
onMounted(() => load().catch((error) => (message.value = error.message)));

async function run(task, done) {
  busy.value = true;
  message.value = '';
  try {
    const result = await task();
    if (result?.devices) prefs.value = result;
    failed.value = false;
    message.value = done;
  } catch (error) {
    failed.value = true;
    message.value = error.message;
  } finally {
    busy.value = false;
  }
}

const save = () => run(() => api('/settings/notify', { method: 'PUT', body: { email: prefs.value.email, push: prefs.value.push, events: prefs.value.events } }), 'Saved.');
const allow = () =>
  run(async () => {
    const result = await enablePush(prefs.value.vapidPublicKey);
    here.value = true;
    return result;
  }, 'This device will get notifications.');
const remove = (device) => run(() => api(`/push/${device.id}`, { method: 'DELETE' }), 'Removed.');
const test = () => run(() => api('/push/test', { method: 'POST', body: { push: true, email: false } }), 'Sent. It should arrive in a few seconds.');
const when = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<template>
  <section class="card section">
    <h2 class="hd">Notifications</h2>
    <p class="sec">When a job ends, an email and a notification on each device you allow here.</p>
    <p v-if="!prefs && !message" class="muted">Loading</p>
    <template v-if="prefs">
      <label class="row toggle">
        <span><strong>Email</strong><span class="muted">keith@vassallo.cloud</span></span>
        <input v-model="prefs.email" type="checkbox" @change="save" />
      </label>
      <label class="row toggle">
        <span><strong>Device notifications</strong><span class="muted">On the devices below</span></span>
        <input v-model="prefs.push" type="checkbox" @change="save" />
      </label>

      <div class="devices">
        <div v-for="device in prefs.devices" :key="device.id" class="row">
          <span><strong>{{ device.label }}</strong><span class="muted">Added {{ when(device.created) }}</span></span>
          <button type="button" class="btn small" :disabled="busy" @click="remove(device)">Remove</button>
        </div>
        <p v-if="!prefs.devices.length" class="muted none">No devices yet.</p>
        <div class="actions">
          <button v-if="pushSupported() && !here" type="button" class="btn btn-go" :disabled="busy" @click="allow"><Icon name="plus" />Allow on this device</button>
          <span v-else-if="here" class="good small-note">This device gets notifications.</span>
          <span v-else class="muted small-note">This browser can't show notifications. On an iPhone, add the admin to your home screen and open it from there.</span>
          <button v-if="prefs.devices.length" type="button" class="btn" :disabled="busy" @click="test">Send a test</button>
        </div>
        <p class="muted small-note">On a phone, install the admin from the browser's menu (Add to home screen) so notifications open it like an app.</p>
      </div>

      <fieldset class="events">
        <legend class="label">Tell me when</legend>
        <label v-for="[key, label] in EVENTS" :key="key"><input v-model="prefs.events[key]" type="checkbox" @change="save" />{{ label }}</label>
      </fieldset>
    </template>
    <p v-if="message" :class="failed ? 'bad' : 'good'" role="status">{{ message }}</p>
  </section>
</template>

<style scoped>
.section {
  padding: 22px 24px;
  max-width: 820px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section h2 {
  font-size: 21px;
}

.section p {
  margin: 0;
}

.row {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid var(--line-soft);
}

.row > span {
  display: flex;
  flex-direction: column;
}

.row strong {
  color: var(--text);
}

.row .muted {
  font-size: 14px;
}

.toggle {
  cursor: pointer;
}

.toggle input,
.events input {
  width: 20px;
  height: 20px;
  accent-color: var(--green);
}

.devices {
  border-top: 1px solid var(--line-soft);
  padding-top: 4px;
}

.devices .row:first-child {
  border-top: 0;
}

.none {
  padding: 8px 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
}

.btn.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 14px;
}

.events {
  border: 0;
  border-top: 1px solid var(--line-soft);
  margin: 0;
  padding: 12px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 22px;
}

.events label {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 40px;
  font-size: 14px;
}

.label {
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
  padding: 0;
  margin-bottom: 4px;
}

.small-note {
  font-size: 13px;
}

.good {
  color: var(--green);
}

.bad {
  color: var(--red);
}
</style>
