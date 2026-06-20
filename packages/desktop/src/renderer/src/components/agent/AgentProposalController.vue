<template>
  <slot />
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useAgentStore } from '@/store/agent'

const agentStore = useAgentStore()

let unsubscribeApplyEdit: (() => void) | null = null

onMounted(() => {
  // Listen for apply-edit-in-renderer events from main process
  unsubscribeApplyEdit = window.electron.ai.onApplyEditInRenderer((request) => {
    agentStore.updateEditStatus(request.edit.id, 'applied')
  })
})

onBeforeUnmount(() => {
  unsubscribeApplyEdit?.()
})
</script>
