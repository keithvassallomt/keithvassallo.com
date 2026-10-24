<script setup>
// Opens a post that is on main: copies it into the admin the first time, then goes to its editor
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const props = defineProps({ slug: { type: String, required: true } });
const router = useRouter();
const error = ref('');

onMounted(async () => {
  try {
    const { id } = await api('/posts/import', { method: 'POST', body: { slug: props.slug } });
    router.replace(`/posts/${id}`);
  } catch (cause) {
    error.value = cause.message;
  }
});
</script>

<template>
  <div class="page">
    <p v-if="error" class="card notice" role="alert">{{ error }}</p>
    <p v-else class="muted">Opening {{ slug }}</p>
    <RouterLink v-if="error" to="/">Back to posts</RouterLink>
  </div>
</template>

<style scoped>
.notice {
  margin: 0;
  padding: 16px 18px;
  color: var(--red);
}
</style>
