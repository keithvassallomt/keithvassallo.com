<script setup>
// The phone's More tab: the screens that don't fit in the bottom bar
import { RouterLink } from 'vue-router';
import { session, signOut } from '../auth.js';
import Icon from '../Icon.vue';
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1 class="hd">More</h1>
    </div>
    <div class="card list">
      <RouterLink to="/lessons"><Icon name="pen" />Style lessons</RouterLink>
      <RouterLink to="/spend"><Icon name="wallet" />Spend</RouterLink>
      <RouterLink to="/settings"><Icon name="sliders" />Settings</RouterLink>
      <button type="button" @click="signOut"><Icon name="signout" />Sign out</button>
    </div>
    <p class="muted">Signed in as {{ session.email }}</p>
  </div>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  padding: 6px;
}

.list a,
.list button {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  text-align: left;
  cursor: pointer;
}

.adm .list a,
.list button {
  color: var(--body);
}

.list a:hover,
.list button:hover {
  background: var(--surface-hover);
}

.page > p {
  margin: 0;
}
</style>
