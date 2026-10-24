<script setup>
// A modal dialog: the native <dialog>, so focus, Escape and the backdrop behave as expected
import { onMounted, ref } from 'vue';

defineProps({ title: { type: String, required: true }, wide: { type: Boolean, default: false } });
const emit = defineEmits(['close']);
const dialog = ref(null);

onMounted(() => dialog.value.showModal());
</script>

<template>
  <dialog ref="dialog" class="dialog card" :class="{ wide }" @close="emit('close')" @cancel.prevent="emit('close')">
    <h2 class="hd">{{ title }}</h2>
    <slot />
    <div class="buttons"><slot name="buttons" /></div>
  </dialog>
</template>

<style scoped>
.dialog {
  width: 460px;
  max-width: calc(100vw - 24px);
  max-height: calc(100dvh - 24px);
  overflow: auto;
  padding: 22px 24px;
  color: var(--body);
  background: var(--surface-raised);
  border-color: var(--line-strong);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
}

.dialog.wide {
  width: 560px;
}

.dialog::backdrop {
  background: rgba(5, 6, 9, 0.65);
}

.dialog h2 {
  font-size: 21px;
  margin-bottom: 14px;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 18px;
}
</style>
