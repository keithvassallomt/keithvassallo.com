<script setup>
// The writing guide's checks on the post as it stands, the same rules the AI has to pass.
// A problem on a line of the body jumps there.
import Icon from '../Icon.vue';

defineProps({ problems: { type: Array, required: true } });
const emit = defineEmits(['go']);
</script>

<template>
  <div class="checks">
    <p class="sec intro">The writing guide's rules, the same ones the AI has to pass. They run as you type.</p>
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
    <div v-else class="card passing"><Icon name="check" />Every check passes.</div>
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
