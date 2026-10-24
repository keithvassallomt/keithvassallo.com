<script setup>
// Settings. For now only access: the passkey and signing out. Models, the spending cap and
// notifications arrive with stages 5 and 6 of docs/blog-admin-plan.md.
import { addPasskey, session, signOut } from '../auth.js';
import Icon from '../Icon.vue';
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1 class="hd">Settings</h1>
    </div>

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

    <section class="card section">
      <h2 class="hd">Still to come</h2>
      <p class="sec">AI models and the monthly spending cap arrive in stage 5, notifications in stage 6.</p>
    </section>
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
  margin: 0;
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

.row .muted {
  font-size: 14px;
}
</style>
