<script setup>
// The writing guide's checks on the post as it stands, the same rules the AI has to pass.
// A problem on a line of the body jumps there. Gaps left for Keith's words come first, since
// they stop the post being published.
import Icon from '../Icon.vue';

defineProps({ problems: { type: Array, required: true }, gaps: { type: Array, default: () => [] } });
const emit = defineEmits(['go']);
</script>

<template>
  <div class="checks">
    <p class="sec intro">The writing guide's rules, the same ones the AI has to pass. They run as you type.</p>
    <div v-if="gaps.length" class="card gaps">
      <strong>{{ gaps.length }} {{ gaps.length === 1 ? 'gap' : 'gaps' }} to fill</strong>
      <button v-for="gap in gaps" :key="`${gap.start}-${gap.label}`" type="button" class="problem" @click="emit('go', gap.start)">
        <Icon name="pen" />
        <span><span class="where">Line {{ gap.start }}: </span>a gap for you, "{{ gap.label }}"</span>
      </button>
      <span class="muted note">Publishing waits until they're filled, so a gap can never reach the site.</span>
    </div>
    <div v-if="problems.length" class="card failing">
      <strong>{{ problems.length }} to fix</strong>
      <component
        :is="problem.lines ? 'button' : 'div'"
        v-for="problem in problems"
        :key="problem.message"
        class="problem"
        :type="problem.lines ? 'button' : undefined"
        @click="problem.lines && emit('go', problem.lines[0])"
      >
        <Icon name="alert" />
        <span>
          <span v-if="problem.lines" class="where">{{ problem.lines.length === 1 ? 'Line' : 'Lines' }} {{ problem.lines.slice(0, 4).join(', ') }}{{ problem.lines.length > 4 ? '…' : '' }}: </span>{{ problem.message }}
        </span>
      </component>
    </div>
    <div v-else class="card passing"><Icon name="check" />{{ gaps.length ? 'Every other check passes.' : 'Every check passes.' }}</div>
  </div>
</template>

<style scoped>
.checks {
  padding: 18px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.intro {
  margin: 0;
  font-size: 14px;
}

.failing {
  padding: 14px 16px;
  border-color: #4a2a2a;
  background: #1a1214;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.failing strong {
  color: var(--red);
}

.gaps {
  padding: 14px 16px;
  border-color: #4a4226;
  background: #17150f;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gaps strong {
  color: var(--yellow);
}

.gaps .note {
  font-size: 14px;
}

.problem {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  border: 0;
  padding: 4px 0;
  background: none;
  color: var(--body);
  font: inherit;
  font-size: 14px;
  text-align: left;
}

button.problem {
  cursor: pointer;
}

button.problem:hover .where {
  text-decoration: underline;
}

.problem .ic {
  color: var(--red);
  margin-top: 2px;
}

.where {
  color: var(--text);
  font-weight: 700;
}

.passing {
  padding: 14px 16px;
  display: flex;
  gap: 10px;
  align-items: center;
  color: var(--green);
  font-weight: 700;
}
</style>
