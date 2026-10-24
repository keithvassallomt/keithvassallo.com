<script setup>
// The preview: the post's HTML, as the API rendered it with the site's own pipeline, styled
// with the blog's prose.css. It sits in a sandboxed frame with scripts off, so nothing in a
// post (AI text comes partly from web pages) can run with the admin's session. The frame
// shares the admin's origin only so the fonts load and, later, so a selection can be read for
// revision notes.
import { onMounted, ref, watch } from 'vue';
import prose from '../../styles/prose.css?raw';

const props = defineProps({
  html: { type: String, default: '' },
  title: { type: String, default: '' },
});

const frame = ref(null);
let ready = false;

// BlogShell.astro's tokens, which prose.css reads
const TOKENS = `
:root {
  --blog-bg: #0b0d12; --blog-surface: #12161d; --blog-raised: #181d26; --blog-border: #262c37;
  --blog-text: #eef1f5; --blog-body: #d5dae1; --blog-secondary: #a3acb9; --blog-muted: #8a93a1;
  --c-green: #8cd49c; --c-orange: #ffa657; --c-cyan: #56d4dd; --c-purple: #d2a8ff; --c-blue: #79c0ff;
  --c-red: #ff7b72; --c-indigo: #a5a6ff; --c-yellow: #f2cc60; --c-pink: #f2a0d6; --c-lime: #b9e06f;
  --font-display: 'Bricolage Grotesque Variable', system-ui, sans-serif;
  --font-reading: 'Atkinson Hyperlegible Next Variable', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
html, body { margin: 0; background: var(--blog-bg); color: var(--blog-text); }
main { max-width: 720px; margin: 0 auto; padding: 28px 22px 80px; }
h1.preview-title { font-family: var(--font-display); color: var(--blog-text); font-size: 2.3rem; line-height: 1.15; letter-spacing: -0.015em; margin: 0 0 28px; }
h1.preview-title:empty { display: none; }
.prose img { max-width: 100%; height: auto; border-radius: 10px; }
.preview-missing { display: inline-block; padding: 8px 12px; border: 1px dashed var(--c-red); border-radius: 8px; color: var(--c-red); font-size: 0.9em; }
@media (max-width: 600px) { .prose { font-size: 1.125rem; } h1.preview-title { font-size: 1.9rem; } }
`;

function skeleton() {
  // The admin's own stylesheets bring the fonts' @font-face rules
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => node.outerHTML).join('\n');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><base target="_blank">${styles}<style>${TOKENS}\n${prose}</style></head><body><main><h1 class="preview-title"></h1><article class="prose"></article></main></body></html>`;
}

function show() {
  const doc = frame.value?.contentDocument;
  if (!ready || !doc) return;
  doc.querySelector('.preview-title').textContent = props.title;
  doc.querySelector('.prose').innerHTML = props.html;
}

onMounted(() => {
  frame.value.addEventListener('load', () => {
    ready = true;
    show();
  });
  frame.value.srcdoc = skeleton();
});

watch(() => [props.html, props.title], show);

defineExpose({ frame });
</script>

<template>
  <iframe ref="frame" class="preview" title="Preview of the post" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>
</template>

<style scoped>
.preview {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #0b0d12;
}
</style>
