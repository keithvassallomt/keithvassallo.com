<script setup>
// The preview: the post's HTML, as the API rendered it with the site's own pipeline, styled
// with the blog's prose.css. It sits in a sandboxed frame with scripts off, so nothing in a
// post (AI text comes partly from web pages) can run with the admin's session. The frame
// shares the admin's origin so the fonts load, and so the admin can read a selection for a
// revision note and mark the passages that have one.
import { onMounted, ref, watch } from 'vue';
import prose from '../../styles/prose.css?raw';

const props = defineProps({
  html: { type: String, default: '' },
  title: { type: String, default: '' },
  /** Passages to mark, for revision notes */
  marks: { type: Array, default: () => [] },
});
const emit = defineEmits(['selection']);

const frame = ref(null);
let ready = false;
let selectionTimer = null;

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
::highlight(notes) { background-color: rgba(242, 160, 214, 0.28); color: #eef1f5; }
::selection { background: #264f78; }
@media (max-width: 600px) { .prose { font-size: 1.125rem; } h1.preview-title { font-size: 1.9rem; } }
`;

function skeleton() {
  // The admin's own stylesheets bring the fonts' @font-face rules
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => node.outerHTML).join('\n');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><base target="_blank">${styles}<style>${TOKENS}\n${prose}</style></head><body><main><h1 class="preview-title"></h1><article class="prose"></article></main></body></html>`;
}

const doc = () => (ready ? frame.value?.contentDocument : null);

/** Ranges covering each passage, found across the article's text even when it spans formatting. */
function rangesFor(quotes) {
  const document = doc();
  const article = document?.querySelector('.prose');
  if (!article) return [];
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let text = '';
  while (walker.nextNode()) {
    nodes.push({ node: walker.currentNode, start: text.length });
    text += walker.currentNode.data;
  }
  const squash = (value) => value.replace(/\s+/g, ' ');
  const flat = squash(text);
  // Map positions in the whitespace-squashed text back to the real text
  const map = [];
  for (let i = 0, j = 0; i < text.length; i++) {
    if (/\s/.test(text[i]) && /\s/.test(text[i - 1] ?? '')) continue;
    map[j++] = i;
  }
  const at = (index) => {
    const position = map[index] ?? text.length;
    const entry = nodes.findLast((item) => item.start <= position);
    return { node: entry.node, offset: Math.min(position - entry.start, entry.node.data.length) };
  };
  return quotes.flatMap((quote) => {
    const index = flat.indexOf(squash(quote.trim()));
    if (index < 0 || !nodes.length) return [];
    const start = at(index);
    const end = at(index + squash(quote.trim()).length - 1);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    return [range];
  });
}

function mark() {
  const view = doc()?.defaultView;
  if (!view?.CSS?.highlights || !view.Highlight) return;
  view.CSS.highlights.set('notes', new view.Highlight(...rangesFor(props.marks)));
}

function show() {
  const document = doc();
  if (!document) return;
  document.querySelector('.preview-title').textContent = props.title;
  document.querySelector('.prose').innerHTML = props.html;
  mark();
}

/** Tells the parent what is selected, and where, so it can offer to add a note. */
function selectionChanged() {
  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    const selection = doc()?.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!text || !selection.rangeCount) return emit('selection', null);
    const box = selection.getRangeAt(0).getBoundingClientRect();
    const outer = frame.value.getBoundingClientRect();
    emit('selection', { text, top: outer.top + box.top, bottom: outer.top + box.bottom, left: outer.left + box.left + box.width / 2 });
  }, 200);
}

onMounted(() => {
  frame.value.addEventListener('load', () => {
    ready = true;
    frame.value.contentDocument.addEventListener('selectionchange', selectionChanged);
    show();
  });
  frame.value.srcdoc = skeleton();
});

watch(() => [props.html, props.title], show);
watch(() => props.marks, mark, { deep: true });

defineExpose({
  clearSelection: () => doc()?.getSelection()?.removeAllRanges(),
});
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
