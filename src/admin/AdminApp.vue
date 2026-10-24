<script setup>
// The admin's frame: sign-in, then the navigation and whichever screen the address names.
// Mounted by src/pages/admin/index.astro.
import { onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { session, signIn, startSession } from './auth.js';
import { api } from './api.js';
import Icon from './Icon.vue';
import './admin.css';

// Checked against the API, not just Cognito: only members of the admins group get in
const admin = ref(null);
// The editor takes the whole screen, without the navigation
const route = useRoute();
// A missing GitHub token, or one about to expire, stops publishing and the AI jobs
const tokenWarning = ref(null);

function checkToken(github) {
  const days = github?.expires ? Math.ceil((Date.parse(github.expires) - Date.now()) / 864e5) : null;
  if (!github?.saved) tokenWarning.value = { text: 'The admin has no GitHub token yet, so it can’t publish or run the AI.', action: 'Add one in Settings' };
  else if (days !== null && days <= 0) tokenWarning.value = { text: 'The GitHub token has expired, so the admin can’t publish or run the AI.', action: 'Replace it in Settings' };
  else if (days !== null && days <= 14) tokenWarning.value = { text: `The GitHub token expires in ${days} ${days === 1 ? 'day' : 'days'}.`, action: 'Replace it in Settings' };
  else tokenWarning.value = null;
}

// After a visit to Settings, where a new token may have been saved
watch(
  () => route.path,
  async (path, before) => {
    if (before === '/settings' && tokenWarning.value) checkToken((await api('/me').catch(() => ({}))).github);
  },
);

// A notification that arrives while the admin is open, passed on by public/admin-sw.js
const toast = ref(null);
let toastTimer;
function showToast({ title, body, url }) {
  const target = url ? new URL(url, location.origin) : null;
  const inAdmin = target?.origin === location.origin && target.pathname.startsWith('/admin');
  toast.value = { title, body, to: inAdmin ? target.hash.slice(1) || '/' : null, href: inAdmin ? null : target?.href };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), 12000);
}

onMounted(async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'notification') showToast(event.data);
    });
    navigator.serviceWorker.startMessages();
  }
  await startSession();
  if (session.status !== 'signed-in') return;
  try {
    const me = await api('/me');
    admin.value = true;
    checkToken(me.github);
  } catch (error) {
    admin.value = false;
    session.error = error.status === 403 ? "This account is signed in, but it isn't an admin." : error.message;
  }
});

const nav = [
  { to: '/', label: 'Posts', icon: 'posts', phone: true },
  { to: '/weekly', label: 'Weekly', icon: 'calendar', phone: true },
  { to: '/ideas', label: 'Ideas', icon: 'idea', phone: true },
  { to: '/lessons', label: 'Style lessons', icon: 'pen' },
  { to: '/spend', label: 'Spend', icon: 'wallet' },
  { to: '/settings', label: 'Settings', icon: 'sliders' },
];
</script>

<template>
  <div class="adm">
    <div v-if="session.status === 'loading' || (session.status === 'signed-in' && admin === null)" class="gate">
      <p class="muted">Signing in</p>
    </div>

    <div v-else-if="session.status === 'signed-out' || admin === false" class="gate">
      <div class="card gate-card">
        <div class="mono" style="color: var(--green)">~/admin</div>
        <h1 class="hd">Blog admin</h1>
        <p class="sec">Only Keith's account can sign in.</p>
        <p v-if="session.error" class="gate-error" role="alert">{{ session.error }}</p>
        <button type="button" class="btn btn-go" @click="signIn">Sign in</button>
      </div>
    </div>

    <div v-else class="shell">
      <nav v-if="!route.meta.full" class="side" aria-label="Admin">
        <RouterLink to="/" class="brand mono">~/admin</RouterLink>
        <RouterLink v-for="item in nav" :key="item.to" :to="item.to" class="side-link"><Icon :name="item.icon" />{{ item.label }}</RouterLink>
        <div class="side-foot muted">Signed in as {{ session.email }}</div>
      </nav>
      <main class="content">
        <div v-if="tokenWarning && !route.meta.full && route.path !== '/settings'" class="token-warning" role="status">
          <Icon name="alert" /><span>{{ tokenWarning.text }}</span><RouterLink to="/settings">{{ tokenWarning.action }}</RouterLink>
        </div>
        <RouterView />
      </main>
      <nav v-if="!route.meta.full" class="tabbar" aria-label="Admin">
        <RouterLink v-for="item in nav.filter((entry) => entry.phone)" :key="item.to" :to="item.to"><Icon :name="item.icon" />{{ item.label }}</RouterLink>
        <RouterLink to="/more"><Icon name="menu" />More</RouterLink>
      </nav>
      <div v-if="toast" class="card toast" role="status">
        <div class="toast-text">
          <strong>{{ toast.title }}</strong>
          <span v-if="toast.body" class="muted">{{ toast.body }}</span>
        </div>
        <RouterLink v-if="toast.to" :to="toast.to" class="btn" @click="toast = null">Open</RouterLink>
        <a v-else-if="toast.href" :href="toast.href" class="btn" target="_blank" rel="noopener" @click="toast = null">Open</a>
        <button type="button" class="btn toast-close" aria-label="Dismiss" @click="toast = null"><Icon name="close" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}

.gate-card {
  width: 380px;
  max-width: 100%;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gate-card h1 {
  font-size: 30px;
}

.gate-card p {
  margin: 0 0 6px;
}

.gate-error {
  color: var(--red);
}

.shell {
  display: flex;
  min-height: 100vh;
}

.side {
  flex: 0 0 240px;
  padding: 24px 16px;
  border-right: 1px solid var(--line-soft);
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  color: var(--green);
  text-decoration: none;
  padding: 4px 12px 20px;
}

.side-link {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  text-decoration: none;
  font-weight: 700;
}

.adm .side-link {
  color: var(--secondary);
}

.adm .side-link:hover,
.adm .side-link.router-link-exact-active {
  background: var(--surface-hover);
  color: var(--text);
}

.side-foot {
  margin-top: auto;
  padding: 12px;
  border-top: 1px solid var(--line-soft);
  font-size: 14px;
  overflow-wrap: anywhere;
}

.content {
  flex: 1;
  min-width: 0;
}

.tabbar {
  display: none;
}

.token-warning {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
  margin: 16px 40px 0;
  padding: 12px 16px;
  border: 1px solid #5c4a1f;
  border-radius: 12px;
  background: #1d1a10;
  color: var(--yellow);
  font-weight: 700;
}

.token-warning a {
  margin-left: auto;
}

.toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 30;
  width: 420px;
  max-width: calc(100vw - 32px);
  padding: 14px 16px;
  display: flex;
  gap: 10px;
  align-items: center;
  background: var(--surface-raised);
  border-color: var(--line-strong);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.toast-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toast-text strong {
  color: var(--text);
}

.toast-text .muted {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toast-close {
  padding: 0 12px;
}

@media (max-width: 760px) {
  .token-warning {
    margin: 12px 16px 0;
  }

  .toast {
    left: 16px;
    right: 16px;
    bottom: calc(76px + env(safe-area-inset-bottom));
    width: auto;
  }

  .side {
    display: none;
  }

  .tabbar {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    border-top: 1px solid var(--line-soft);
    background: #0e1117;
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 10;
  }

  .tabbar a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 60px;
    text-decoration: none;
    font-size: 12px;
    font-weight: 700;
  }

  .adm .tabbar a {
    color: var(--muted);
  }

  .adm .tabbar a.router-link-exact-active {
    color: var(--text);
  }
}
</style>
