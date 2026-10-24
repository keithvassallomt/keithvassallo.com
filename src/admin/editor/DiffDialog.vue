<script setup>
// A finished revision: what changed, as a diff of the body, with Keep or Undo. Undo restores the
// version from just before the revision; both stay in History either way.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { unifiedMergeView } from '@codemirror/merge';
import Dialog from '../Dialog.vue';
import Icon from '../Icon.vue';

const props = defineProps({
  before: { type: String, required: true },
  after: { type: String, required: true },
  changes: { type: Array, default: () => [] },
  lessons: { type: Array, default: () => [] },
  problems: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['keep', 'undo']);

const host = ref(null);
let view = null;

const theme = EditorView.theme(
  {
    '&': { color: '#d5dae1', backgroundColor: '#0b0d12', fontSize: '14px' },
    '.cm-scroller': { fontFamily: "'JetBrains Mono', ui-monospace, monospace", lineHeight: '1.65' },
    '.cm-content': { padding: '12px 0' },
    '.cm-line': { padding: '0 14px' },
    '.cm-changedLine': { backgroundColor: 'rgba(140, 212, 156, 0.08)' },
    '.cm-changedText': { background: 'rgba(140, 212, 156, 0.28)' },
    '.cm-deletedChunk': { backgroundColor: 'rgba(255, 123, 114, 0.1)' },
    '.cm-deletedChunk del, .cm-deletedText': { textDecoration: 'line-through', background: 'rgba(255, 123, 114, 0.25)' },
    '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
    '.cm-collapsedLines': { background: '#151a22', color: '#8a93a1' },
  },
  { dark: true },
);

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.after,
      extensions: [
        unifiedMergeView({ original: props.before, mergeControls: false, highlightChanges: true, gutter: true, collapseUnchanged: { margin: 2, minSize: 6 } }),
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
        theme,
      ],
    }),
  });
});
onBeforeUnmount(() => view?.destroy());
</script>

<template>
  <Dialog title="The revision is ready" wide @close="emit('keep')">
    <div v-if="changes.length" class="changes">
      <strong>What changed</strong>
      <ul>
        <li v-for="change in changes" :key="change">{{ change }}</li>
      </ul>
    </div>
    <div ref="host" class="diff" aria-label="The body, with the revision's changes marked"></div>
    <p v-if="lessons.length" class="lessons"><Icon name="pen" />Saved {{ lessons.length }} {{ lessons.length === 1 ? 'lesson' : 'lessons' }} to Style lessons: {{ lessons.join(' ') }}</p>
    <p v-if="problems.length" class="warn"><Icon name="alert" />{{ problems.length }} {{ problems.length === 1 ? 'check still fails' : 'checks still fail' }}; see the Checks tab.</p>
    <p class="muted note">Undo puts back exactly what you had. Both versions stay in History.</p>
    <template #buttons>
      <button type="button" class="btn" :disabled="busy" @click="emit('undo')"><Icon name="restore" />Undo the revision</button>
      <button type="button" class="btn btn-go" :disabled="busy" @click="emit('keep')"><Icon name="check" />Keep</button>
    </template>
  </Dialog>
</template>

<style scoped>
.changes {
  margin-bottom: 12px;
  font-size: 14px;
}

.changes strong {
  color: var(--text);
}

.changes ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

.diff {
  max-height: 50dvh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.lessons,
.warn {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 14px;
  margin: 12px 0 0;
}

.lessons {
  color: var(--pink);
}

.warn {
  color: var(--yellow);
}

.note {
  font-size: 13px;
  margin: 10px 0 0;
}
</style>
