<script setup>
// Stands in for a screen a later stage of docs/blog-admin-plan.md builds
defineProps({
  title: { type: String, required: true },
  stage: { type: Number, required: true },
  summary: { type: String, required: true },
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1 class="hd">{{ title }}</h1>
    </div>
    <div class="card coming">
      <span class="chip" style="color: var(--yellow); background: rgba(242, 204, 96, 0.12)">Stage {{ stage }}</span>
      <p>{{ summary }}</p>
    </div>
  </div>
</template>

<style scoped>
.coming {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  max-width: 640px;
}

.coming p {
  margin: 0;
  color: var(--secondary);
}
</style>
