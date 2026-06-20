<template>
  <div class="agent-diff-view" :class="{ 'agent-diff-view--compact': compact }">
    <div
      v-for="(line, index) in visibleLines"
      :key="`${line.type}-${index}`"
      class="agent-diff-view__line"
      :class="[`agent-diff-view__line--${line.type}`]"
    >
      <span class="agent-diff-view__marker">{{ markerFor(line.type) }}</span>
      <span class="agent-diff-view__text">{{ line.value }}</span>
    </div>
    <div v-if="lineCount > visibleLines.length" class="agent-diff-view__more">
      +{{ lineCount - visibleLines.length }} more diff lines
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { generateDiffLines, type DiffLine } from '@/services/agentDiff'

const props = withDefaults(
  defineProps<{
    oldContent: string
    newContent: string
    compact?: boolean
    maxLines?: number
  }>(),
  {
    compact: false,
    maxLines: 200
  }
)

const diffLines = computed<DiffLine[]>(() => generateDiffLines(props.oldContent, props.newContent))
const visibleLines = computed<DiffLine[]>(() => diffLines.value.slice(0, props.maxLines))
const lineCount = computed<number>(() => diffLines.value.length)

const markerFor = (type: DiffLine['type']): string => {
  if (type === 'added') return '+'
  if (type === 'removed') return '-'
  return ' '
}
</script>

<style scoped>
.agent-diff-view {
  width: 100%;
  overflow: auto;
  font-family: var(--code-font-family), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  border: 1px solid rgba(127, 127, 127, 0.25);
  border-radius: 8px;
  background: rgba(246, 248, 250, 0.92);
}

.agent-diff-view--compact {
  max-height: 240px;
}

.agent-diff-view__line {
  display: grid;
  grid-template-columns: 1.5em minmax(0, 1fr);
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-diff-view__line--added {
  background: rgba(46, 160, 67, 0.14);
}

.agent-diff-view__line--removed {
  background: rgba(218, 54, 51, 0.14);
}

.agent-diff-view__line--equal {
  color: rgba(127, 127, 127, 0.82);
}

.agent-diff-view__marker {
  user-select: none;
  text-align: right;
  padding-right: 0.5em;
  opacity: 0.75;
}

.agent-diff-view__text {
  min-width: 0;
}

.agent-diff-view__more {
  padding: 0.5em 0.75em;
  color: rgba(127, 127, 127, 0.85);
  border-top: 1px solid rgba(127, 127, 127, 0.2);
}
</style>
