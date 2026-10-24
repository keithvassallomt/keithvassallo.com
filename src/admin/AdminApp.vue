<script setup>
// The admin's frame: sign-in, then the navigation and whichever screen the address names.
// Mounted by src/pages/admin/index.astro.
import { onMounted, ref } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { session, signIn, startSession } from './auth.js';
import { api } from './api.js';
import Icon from './Icon.vue';
import './admin.css';

// Checked against the API, not just Cognito: only members of the admins group get in
const admin = ref(null);

onMounted(async () => {
  await startSession();
  if (session.status !== 'signed-in') return;
  try {
    await api('/me');
    admin.value = true;
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
      <nav class="side" aria-label="Admin">
        <RouterLink to="/" class="brand mono">~/admin</RouterLink>
        <RouterLink v-for="item in nav" :key="item.to" :to="item.to" class="side-link"><Icon :name="item.icon" />{{ item.label }}</RouterLink>
        <div class="side-foot muted">Signed in as {{ session.email }}</div>
      </nav>
      <main class="content">
        <RouterView />
      </main>
      <nav class="tabbar" aria-label="Admin">
        <RouterLink v-for="item in nav.filter((entry) => entry.phone)" :key="item.to" :to="item.to"><Icon :name="item.icon" />{{ item.label }}</RouterLink>
        <RouterLink to="/more"><Icon name="menu" />More</RouterLink>
      </nav>
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

@media (max-width: 760px) {
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
