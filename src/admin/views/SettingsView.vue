<script setup>
// Settings: the GitHub token the admin starts its jobs with, the AI models and spending cap,
// notifications, and access (the passkey, signing out).
import { onMounted, ref } from 'vue';
import { api } from '../api.js';
import { addPasskey, session, signOut } from '../auth.js';
import Icon from '../Icon.vue';
import AiSettings from '../AiSettings.vue';
import NotifySettings from '../NotifySettings.vue';

const github = ref(null);
const loaded = ref(false);
const token = ref('');
const saving = ref(false);
const message = ref('');
const failed = ref(false);

const date = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const daysLeft = (iso) => Math.ceil((Date.parse(iso) - Date.now()) / 864e5);

onMounted(async () => {
  try {
    github.value = (await api('/settings')).github;
  } finally {
    loaded.value = true;
  }
});

async function saveToken() {
  saving.value = true;
  message.value = '';
  try {
    github.value = (await api('/settings/github-token', { method: 'PUT', body: { token: token.value } })).github;
    token.value = '';
    failed.value = false;
    message.value = 'Saved. The admin can publish now.';
  } catch (error) {
    failed.value = true;
    message.value = error.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1 class="hd">Settings</h1>
    </div>

    <section class="card section">
      <h2 class="hd">GitHub</h2>
      <p class="sec">Publishing and the AI run on GitHub Actions. The admin starts them, and saves your ideas and style lessons, with a token of yours. It's stored encrypted in AWS and never shown again.</p>
      <div class="row">
        <div>
          <strong>Token</strong>
          <div v-if="!loaded" class="muted">Checking</div>
          <div v-else-if="github" class="muted">
            {{ github.login }}'s, saved {{ date(github.saved) }}.
            <template v-if="github.expires">
              <span :class="{ bad: daysLeft(github.expires) <= 14 }">Expires {{ date(github.expires) }}, in {{ daysLeft(github.expires) }} days.</span>
            </template>
            <template v-else>Doesn't expire.</template>
          </div>
          <div v-else class="bad">None yet, so publishing can't start.</div>
        </div>
        <span v-if="github" class="chip" style="color: var(--green); background: rgba(140, 212, 156, 0.12)">Set</span>
      </div>
      <details class="how" :open="loaded && !github">
        <summary>{{ github ? 'Replace it' : 'Add one' }}</summary>
        <ol>
          <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">a new fine-grained token</a> on GitHub.</li>
          <li>Name it <span class="mono">blog admin</span>, and choose an expiry. A year is the longest.</li>
          <li>Under Repository access, choose Only select repositories: <span class="mono">keithvassallo.com</span> and <span class="mono">blog-private</span>.</li>
          <li>Under Permissions, set <strong>Actions</strong> and <strong>Contents</strong> to Read and write. Leave the rest.</li>
          <li>Generate it, copy it, and paste it here.</li>
        </ol>
        <div class="paste">
          <input v-model="token" class="inp mono" type="password" autocomplete="off" placeholder="github_pat_…" aria-label="GitHub token" />
          <button type="button" class="btn btn-go" :disabled="saving || !token.trim()" @click="saveToken">Save</button>
        </div>
      </details>
      <p v-if="message" :class="failed ? 'bad' : 'good'" role="status">{{ message }}</p>
    </section>

    <section class="card section">
      <h2 class="hd">Access</h2>
      <div class="row">
        <div>
          <strong>Sign-in</strong>
          <div class="muted">{{ session.email }}, the only account. Sign-up is off.</div>
        </div>
      </div>
      <div class="row">
        <div>
          <strong>Passkey</strong>
          <div class="muted">Sign in with your fingerprint, face or screen lock instead of the password. Add one on each device you use.</div>
        </div>
        <button type="button" class="btn" @click="addPasskey"><Icon name="key" />Add a passkey</button>
      </div>
      <div class="row">
        <div>
          <strong>Sign out</strong>
          <div class="muted">Ends the session on this device.</div>
        </div>
        <button type="button" class="btn" @click="signOut"><Icon name="signout" />Sign out</button>
      </div>
    </section>

    <AiSettings />

    <NotifySettings />
  </div>
</template>

<style scoped>
.section {
  padding: 22px 24px;
  max-width: 820px;
}

.section h2 {
  font-size: 21px;
  margin-bottom: 8px;
}

.section p {
  margin: 0 0 6px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-top: 1px solid var(--line-soft);
}

.row > div {
  flex: 1 1 280px;
}

.row strong {
  color: var(--text);
}

.row .muted,
.row .bad {
  font-size: 14px;
}

.bad {
  color: var(--red);
}

.good {
  color: var(--green);
}

.how {
  border-top: 1px solid var(--line-soft);
  padding-top: 12px;
}

.how summary {
  cursor: pointer;
  min-height: 36px;
  font-weight: 700;
  color: var(--green);
}

.how ol {
  margin: 8px 0 14px;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}

.paste {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}
</style>
