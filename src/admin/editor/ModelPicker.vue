<script setup>
// Which model, reasoning effort and image model a run uses, with what it's likely to cost
import { computed, onMounted, ref } from 'vue';
import { dollars, loadModels } from '../models.js';

const props = defineProps({
  kind: { type: String, default: 'generate' },
  images: { type: Boolean, default: true },
});
const choice = defineModel({ type: Object, required: true });

const data = ref(null);
const error = ref('');

onMounted(async () => {
  try {
    data.value = await loadModels();
    const { settings } = data.value;
    choice.value = { model: settings.defaultModel, effort: settings.effort, imageModel: settings.imageModel, ...choice.value };
  } catch (cause) {
    error.value = cause.message;
  }
});

const selected = computed(() => data.value?.models.find((model) => model.id === choice.value.model));
const label = (model) => {
  const estimate = dollars(model.estimate?.[props.kind]);
  return `${model.id}${estimate ? ` · ${estimate} a run` : ''}${model.id === data.value.settings.defaultModel ? ' (default)' : ''}`;
};
</script>

<template>
  <div class="picker">
    <p v-if="error" class="bad">{{ error }}</p>
    <template v-else-if="data">
      <label>
        <span class="label">Model</span>
        <select v-model="choice.model" class="inp">
          <option v-for="model in data.models" :key="model.id" :value="model.id">{{ label(model) }}</option>
        </select>
      </label>
      <p class="muted note">Estimates from your past runs{{ kind === 'generate' ? ', before web searches and the cover' : '' }}. Prices from models.dev.</p>
      <details class="advanced">
        <summary>Advanced: reasoning {{ choice.effort }}{{ images ? ` · ${choice.imageModel}` : '' }}</summary>
        <div class="pair">
          <label>
            <span class="label">Reasoning effort</span>
            <select v-model="choice.effort" class="inp">
              <option v-for="effort in selected?.efforts ?? ['low', 'medium', 'high']" :key="effort" :value="effort">{{ effort }}</option>
            </select>
          </label>
          <label v-if="images">
            <span class="label">Image model</span>
            <select v-model="choice.imageModel" class="inp">
              <option v-for="model in data.imageModels" :key="model" :value="model">{{ model }}</option>
            </select>
          </label>
        </div>
      </details>
    </template>
    <p v-else class="muted">Loading the models</p>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary);
  margin-bottom: 6px;
}

.note {
  font-size: 13px;
  margin: 0;
}

.bad {
  color: var(--red);
}

.advanced {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0 12px;
}

.advanced summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
  font-weight: 700;
  color: var(--secondary);
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  padding-bottom: 12px;
}
</style>
