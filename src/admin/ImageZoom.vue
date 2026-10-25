<script setup>
// An image that opens full screen when clicked: fitted to the screen at first, then at its actual
// size on a click on the image, to look closely or pan around. Escape, the close button or a click
// outside the image closes it. The slot is what's shown on the page, usually the same image.
import { ref } from 'vue';
import Icon from './Icon.vue';

defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: '' },
  label: { type: String, default: 'Show the image full size' },
});

const dialog = ref(null);
const actual = ref(false);

function open() {
  actual.value = false;
  dialog.value.showModal();
}

// The dialog fills the screen, so a click beside the image lands on the dialog itself
function clicked(event) {
  if (event.target === dialog.value) dialog.value.close();
}
</script>

<template>
  <button type="button" class="zoom-open" :aria-label="label" :title="label" @click="open"><slot /></button>
  <dialog ref="dialog" class="zoom" :class="{ actual }" @click="clicked">
    <img :src="src" :alt="alt" :title="actual ? 'Fit to the screen' : 'Show at actual size'" @click="actual = !actual" />
    <button type="button" class="zoom-close" aria-label="Close" @click="dialog.close()"><Icon name="close" /></button>
  </dialog>
</template>

<style scoped>
.zoom-open {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: none;
  cursor: zoom-in;
}

.zoom-open:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 2px;
}

.zoom {
  width: 100vw;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 16px;
  border: 0;
  background: transparent;
  overflow: auto;
}

.zoom[open] {
  display: flex;
}

.zoom::backdrop {
  background: rgba(5, 6, 9, 0.92);
}

/* Auto margins centre the image while it fits, and let it scroll from the edge once it doesn't */
.zoom img {
  display: block;
  margin: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 10px;
  cursor: zoom-in;
}

.zoom.actual img {
  max-width: none;
  max-height: none;
  border-radius: 0;
  cursor: zoom-out;
}

.zoom-close {
  position: fixed;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface-raised);
  color: var(--text);
  cursor: pointer;
}
</style>
