<script setup>
// What the AI said about the post: why it chose the topic, the shortlist, its evidence and
// sources, its open questions, what it had to fix, a summary of its reasoning at each stage,
// and what the runs cost. Each part starts folded away.
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../api.js';

const props = defineProps({ postId: { type: String, required: true }, refresh: { type: Number, default: 0 } });

const notes = ref(null);
const error = ref('');
const loaded = ref(false);

async function load() {
  try {
    notes.value = await api(`/posts/${props.postId}/ai`);
    error.value = '';
  } catch (cause) {
    error.value = cause.message;
  } finally {
    loaded.value = true;
  }
}
onMounted(load);
watch(() => props.refresh, load);

const brief = computed(() => notes.value?.brief);
const verified = computed(() => brief.value?.evidence?.filter((item) => item.status === 'verified').length ?? 0);
const questions = computed(() => [...(brief.value?.questions_for_keith ?? []), ...(notes.value?.briefRun?.notesForKeith ?? [])]);
const runs = computed(() => [notes.value?.briefRun, notes.value?.latest].filter(Boolean).filter((run, index, all) => all.findIndex((other) => other.job === run.job) === index));
const money = (cost) => (cost?.total === null || cost?.total === undefined ? 'unknown' : `$${cost.total.toFixed(2)}${cost.complete ? '' : ' in tokens'}`);
const when = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const isUrl = (source) => /^https?:\/\//.test(source);
</script>

<template>
  <div class="notes">
    <p v-if="!loaded" class="muted">Loading</p>
    <p v-else-if="error" class="bad">{{ error }}</p>
    <p v-else-if="!brief && !notes?.latest" class="muted">No AI runs on this post yet. Generate it, or revise it, and the AI's notes appear here.</p>
    <template v-else>
      <p class="muted intro">Never published. Each part opens on its own.</p>

      <details v-if="brief">
        <summary>Why this topic<span>{{ brief.chosen?.working_title ?? brief.decision }}</span></summary>
        <p>{{ brief.reason }}</p>
        <template v-if="brief.chosen">
          <p><strong>Thesis.</strong> {{ brief.chosen.thesis }}</p>
          <p><strong>For.</strong> {{ brief.chosen.audience }}</p>
        </template>
      </details>

      <details v-if="brief?.shortlist?.length">
        <summary>Shortlist<span>{{ brief.shortlist.length }} candidates</span></summary>
        <ol>
          <li v-for="item in brief.shortlist" :key="item.title">
            <strong>{{ item.title }}</strong> · {{ item.editorial_category }} · {{ item.score }}
            <div class="muted">{{ item.central_question }}</div>
          </li>
        </ol>
      </details>

      <details v-if="brief?.evidence?.length">
        <summary>Evidence and sources<span>{{ brief.evidence.length }}, {{ verified }} verified</span></summary>
        <ul class="evidence">
          <li v-for="(item, index) in brief.evidence" :key="index">
            <span class="chip" :class="item.status === 'verified' ? 'ok' : 'maybe'">{{ item.status }}</span>
            {{ item.claim }}
            <a v-if="isUrl(item.source)" :href="item.source" target="_blank" rel="noopener">{{ new URL(item.source).hostname }}</a>
            <span v-else class="muted">({{ item.source }})</span>
          </li>
        </ul>
      </details>

      <details v-if="questions.length">
        <summary>Open questions<span>{{ questions.length }} for you</span></summary>
        <ul>
          <li v-for="question in questions" :key="question">{{ question }}</li>
        </ul>
      </details>

      <details v-for="run in runs" :key="`fix-${run.job}`" v-show="run.problems?.length || run.writingNotes?.length || run.attempts">
        <summary>Checks{{ runs.length > 1 ? ` (${run.kind ?? 'run'})` : '' }}<span>{{ run.attempts ? `${run.attempts} writing ${run.attempts === 1 ? 'attempt' : 'attempts'}` : '' }}{{ run.problems?.length ? `, ${run.problems.length} still failing` : '' }}</span></summary>
        <ul>
          <li v-for="note in run.writingNotes ?? []" :key="note">{{ note }}</li>
          <li v-for="problem in run.problems ?? []" :key="problem" class="bad">{{ problem }}</li>
          <li v-if="!run.problems?.length && !run.writingNotes?.length" class="muted">Everything passed, and the private-material check was clean.</li>
        </ul>
      </details>

      <details v-for="run in runs" :key="`how-${run.job}`" v-show="run.summaries && Object.keys(run.summaries).length">
        <summary>How it got here{{ runs.length > 1 ? ` (${run.kind ?? 'run'})` : '' }}<span>the model's own summaries</span></summary>
        <div v-for="(parts, stage) in run.summaries" :key="stage" class="stage">
          <strong>{{ stage }}</strong>
          <p v-for="(part, index) in parts" :key="index">{{ part }}</p>
        </div>
      </details>

      <details>
        <summary>Tokens and cost<span>{{ runs.map((run) => money(run.cost)).join(' + ') }}</span></summary>
        <ul>
          <li v-for="run in runs" :key="`cost-${run.job}`">
            <strong>{{ when(run.at) }}</strong>, {{ run.model }}: {{ money(run.cost) }}.
            {{ run.usage?.requests }} requests, {{ run.usage?.webSearches }} web searches, {{ run.usage?.images }} images.
            {{ Math.round((run.usage?.inputTokens ?? 0) / 1000) }}k tokens in ({{ Math.round((run.usage?.cachedTokens ?? 0) / 1000) }}k cached), {{ Math.round((run.usage?.outputTokens ?? 0) / 1000) }}k out.
          </li>
        </ul>
      </details>
    </template>
  </div>
</template>

<style scoped>
.notes {
  padding: 18px 20px 28px;
  display: flex;
  flex-direction: column;
  font-size: 14px;
}

.intro {
  margin: 0 0 8px;
}

details {
  border-top: 1px solid var(--line-soft);
}

summary {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: 700;
  color: var(--text);
}

summary span {
  margin-left: auto;
  font-weight: 400;
  color: var(--muted);
  text-align: right;
}

details p,
details ul,
details ol,
.stage {
  margin: 0 0 12px;
}

details ul,
details ol {
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.evidence {
  list-style: none;
  padding-left: 0;
}

.chip.ok {
  color: var(--green);
  background: rgba(140, 212, 156, 0.12);
  height: 22px;
}

.chip.maybe {
  color: var(--yellow);
  background: rgba(242, 204, 96, 0.12);
  height: 22px;
}

.stage strong {
  color: var(--text);
}

.stage p {
  margin: 4px 0 8px;
}

.bad {
  color: var(--red);
}
</style>
