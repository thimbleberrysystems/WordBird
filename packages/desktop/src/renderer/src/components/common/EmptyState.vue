<template>
  <div
    class="empty-state"
    :class="{ 'empty-state--small': small }"
  >
    <div
      v-if="icon"
      class="empty-state__icon"
    >
      {{ icon }}
    </div>
    <div class="empty-state__title">
      {{ title }}
    </div>
    <div
      v-if="hint"
      class="empty-state__hint"
    >
      {{ hint }}
    </div>
    <button
      v-if="actionLabel"
      class="empty-state__action"
      @click="$emit('action')"
    >
      {{ actionLabel }}
    </button>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * The one empty-state shape for every view: what this is, how it fills
 * up, and (at most) one action — usually "Ask Biscuit to …", which makes
 * every empty view double as onboarding.
 */
defineProps<{
  icon?: string
  title: string
  hint?: string
  actionLabel?: string
  /** Compact variant for sidebar sections. */
  small?: boolean
}>()

defineEmits<{ action: [] }>()
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 20px;
  text-align: center;
  color: var(--editorColor50);
  user-select: none;
}

.empty-state__icon {
  font-size: 26px;
  opacity: 0.8;
}

.empty-state__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--editorColor80, var(--editorColor));
}

.empty-state__hint {
  font-size: 12.5px;
  line-height: 1.5;
  max-width: 340px;
  color: var(--editorColor50);
}

.empty-state__action {
  margin-top: 4px;
  font: inherit;
  font-size: 12.5px;
  padding: 5px 14px;
  border-radius: 14px;
  border: 1px solid var(--themeColor);
  color: var(--themeColor);
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    background: var(--themeColor);
    color: var(--buttonFontColor, #fff);
  }
}

.empty-state--small {
  padding: 8px 12px;
  gap: 4px;
  & .empty-state__icon {
    font-size: 16px;
  }
  & .empty-state__title {
    font-size: 12px;
  }
  & .empty-state__hint {
    font-size: 11.5px;
  }
  & .empty-state__action {
    font-size: 11.5px;
    padding: 3px 10px;
  }
}
</style>
