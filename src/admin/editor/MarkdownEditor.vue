<script setup>
// The Markdown editor: CodeMirror, with a formatting toolbar, the site's palette, and the
// writing guide's failing checks marked on their lines. Images pasted, dropped or picked are
// handed to the parent (`files`), which uploads them and calls insertImage.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderText } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import Icon from '../Icon.vue';

const props = defineProps({
  modelValue: { type: String, required: true },
  problems: { type: Array, default: () => [] },
  busy: { type: String, default: '' },
  readOnly: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue', 'files', 'scroll']);

const host = ref(null);
const picker = ref(null);
const locked = new Compartment();
let view = null;

const highlight = HighlightStyle.define([
  { tag: tags.heading, color: '#eef1f5', fontWeight: '600' },
  // Markdown's own marks: ##, **, `, >, list bullets, link brackets
  { tag: tags.processingInstruction, color: '#f2a0d6' },
  { tag: tags.link, color: '#79c0ff' },
  { tag: tags.url, color: '#6e7786' },
  { tag: tags.monospace, color: '#b9e06f' },
  { tag: tags.labelName, color: '#ffa657' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700', color: '#eef1f5' },
  { tag: tags.quote, color: '#a3acb9' },
  { tag: tags.contentSeparator, color: '#f2a0d6' },
]);

const theme = EditorView.theme(
  {
    '&': { color: '#d5dae1', backgroundColor: 'transparent', fontSize: '14.5px', height: '100%' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: "'JetBrains Mono', ui-monospace, monospace", lineHeight: '1.7', overflow: 'auto' },
    '.cm-content': { padding: '16px 0 40vh', caretColor: '#8cd49c' },
    '.cm-line': { padding: '0 16px 0 6px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#8cd49c' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: '#264f78' },
    '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
    '.cm-lintRange-warning': { backgroundImage: 'none', backgroundColor: 'rgba(255, 123, 114, 0.1)' },
    '.cm-placeholder': { color: '#8a93a1' },
    '.cm-tooltip': { backgroundColor: '#1e2430', border: '1px solid #3a4352', color: '#eef1f5' },
  },
  { dark: true },
);

/** Images out of a paste or drop, if it has any; the event is the editor's otherwise. */
function takeImages(event, list) {
  const files = [...(list ?? [])].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return false;
  event.preventDefault();
  emit('files', files);
  return true;
}

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown(),
        syntaxHighlighting(highlight),
        theme,
        EditorView.lineWrapping,
        lintGutter(),
        placeholderText('Start writing. Paste or drop images straight in.'),
        locked.of(EditorState.readOnly.of(props.readOnly)),
        EditorView.contentAttributes.of({ 'aria-label': 'Post body, in Markdown', spellcheck: 'true', autocapitalize: 'sentences' }),
        EditorView.domEventHandlers({
          paste: (event) => takeImages(event, event.clipboardData?.files),
          drop: (event) => takeImages(event, event.dataTransfer?.files),
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString());
        }),
      ],
    }),
  });
  view.scrollDOM.addEventListener('scroll', () => emit('scroll'), { passive: true });
  showProblems();
});

onBeforeUnmount(() => view?.destroy());

// A new body from outside (a restored version, the other device's copy) replaces the text
watch(
  () => props.modelValue,
  (value) => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  },
);

function showProblems() {
  if (!view) return;
  const { doc } = view.state;
  const diagnostics = props.problems.flatMap((problem) =>
    (problem.lines ?? [])
      .filter((number) => number <= doc.lines)
      .map((number) => {
        const line = doc.line(number);
        return { from: line.from, to: line.to, severity: 'warning', message: problem.message };
      }),
  );
  view.dispatch(setDiagnostics(view.state, diagnostics));
}
watch(() => props.problems, showProblems);
watch(
  () => props.readOnly,
  (readOnly) => view?.dispatch({ effects: locked.reconfigure(EditorState.readOnly.of(readOnly)) }),
);

/** Puts `before` and `after` round the selection, or round `fallback` when nothing is selected. */
function wrap(before, after, fallback) {
  view.dispatch(
    view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to) || fallback;
      return {
        changes: { from: range.from, to: range.to, insert: `${before}${text}${after}` },
        range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
      };
    }),
  );
  view.focus();
}

/** Starts each selected line with `prefix`. */
function prefixLines(prefix) {
  const { state } = view;
  const lines = new Set();
  for (const range of state.selection.ranges) {
    for (let at = state.doc.lineAt(range.from).number; at <= state.doc.lineAt(range.to).number; at++) lines.add(at);
  }
  view.dispatch({ changes: [...lines].map((number) => ({ from: state.doc.line(number).from, insert: prefix })) });
  view.focus();
}

/** Inserts a block of text on its own lines at the cursor, selecting `select` within it. */
function insertBlock(text, select = null) {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lead = from === line.from ? '' : '\n\n';
  const insert = `${lead}${text}\n`;
  const start = select ? from + lead.length + text.indexOf(select) : from + insert.length;
  view.dispatch({
    changes: { from, to, insert },
    selection: select ? EditorSelection.range(start, start + select.length) : EditorSelection.cursor(start),
  });
  view.focus();
}

const insertImage = (name) => insertBlock(`![Describe the image](./${name})`, 'Describe the image');

const tools = [
  { label: 'Heading', icon: 'heading', run: () => prefixLines('## ') },
  { label: 'Bold', icon: 'bold', run: () => wrap('**', '**', 'bold text') },
  { label: 'Italic', icon: 'italic', run: () => wrap('_', '_', 'italic text') },
  { label: 'Link', icon: 'link', run: () => wrap('[', '](https://)', 'link text') },
  { label: 'Inline code', icon: 'code', run: () => wrap('`', '`', 'code') },
  { label: 'Code block', icon: 'codeblock', run: () => insertBlock('```text\ncode\n```', 'code') },
  { label: 'List', icon: 'list', run: () => prefixLines('- ') },
  { label: 'Callout', icon: 'callout', run: () => insertBlock('> [!NOTE]\n> Callout text', 'Callout text') },
  { label: 'Keyboard key', text: 'kbd', run: () => wrap('<kbd>', '</kbd>', 'Ctrl') },
  { label: 'Highlight', text: 'mark', run: () => wrap('<mark>', '</mark>', 'highlighted') },
];

function picked(event) {
  const files = [...event.target.files];
  event.target.value = '';
  if (files.length) emit('files', files);
}

/** Puts the cursor at the start of a line and scrolls to it. */
function goToLine(number) {
  if (!view || number > view.state.doc.lines) return;
  const { from } = view.state.doc.line(number);
  view.dispatch({ selection: EditorSelection.cursor(from), effects: EditorView.scrollIntoView(from, { y: 'center' }) });
  view.focus();
}

/** Where a line starts, in the scroller's own coordinates, for keeping the preview in step. */
function lineTop(number) {
  const { scrollDOM } = view;
  const documentStart = view.documentTop - scrollDOM.getBoundingClientRect().top + scrollDOM.scrollTop;
  return documentStart + view.lineBlockAt(view.state.doc.line(Math.min(number, view.state.doc.lines)).from).top;
}

defineExpose({ insertImage, goToLine, lineTop, scroller: () => view?.scrollDOM, focus: () => view?.focus() });
</script>

<template>
  <div class="md">
    <div class="toolbar" role="toolbar" aria-label="Formatting">
      <button v-for="tool in tools" :key="tool.label" type="button" class="tool" :class="{ word: tool.text }" :aria-label="tool.label" :title="tool.label" :disabled="readOnly" @click="tool.run">
        <Icon v-if="tool.icon" :name="tool.icon" /><span v-else class="mono">{{ tool.text }}</span>
      </button>
      <button type="button" class="tool image" aria-label="Add an image" title="Add an image" :disabled="readOnly" @click="picker.click()">
        <Icon name="image" />
      </button>
      <input ref="picker" type="file" accept="image/*" multiple hidden @change="picked" />
      <span v-if="busy" class="busy muted">{{ busy }}</span>
    </div>
    <div ref="host" class="host"></div>
  </div>
</template>

<style scoped>
.md {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
  flex: none;
}

.tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
  flex: none;
}

.tool.word {
  width: auto;
  padding: 0 8px;
  font-size: 12px;
}

.tool.image {
  color: var(--green);
}

.tool:hover:not(:disabled) {
  background: #1a2029;
  color: var(--text);
}

.tool:disabled {
  opacity: 0.4;
}

.busy {
  margin-left: auto;
  padding: 0 8px;
  font-size: 13px;
  white-space: nowrap;
}

.host {
  flex: 1;
  min-height: 0;
}

.host :deep(.cm-editor) {
  height: 100%;
}
</style>
