<template>
  <!-- Width is governed by the flex layout (this sits in .editor-area, the
       flex sibling of the Biscuit panel, so its width already excludes both
       the sidebar AND Biscuit). The old manual `max-width: calc(100vw -
       sidebar)` ignored the Biscuit panel, so with many tabs the editor grew
       into Biscuit's space and pushed it off-screen with no way back. -->
  <div class="editor-with-tabs">
    <tabs v-show="showTabBar" />
    <div class="container">
      <!-- Inline diff highlighting is applied directly to Muya blocks via CSS classes -->
      <editor
        :markdown="markdown"
        :cursor="cursor"
        :text-direction="textDirection"
        :platform="platform"
      />
      <source-code
        v-if="sourceCode"
        :markdown="markdown"
        :muya-index-cursor="muyaIndexCursor"
        :text-direction="textDirection"
      />
    </div>
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import TabNotifications from './notifications.vue'

defineProps<{
  markdown: string
  // `cursor` originates as `IFileState.cursor` which is `unknown`
  // (see src/shared/types/files.ts); align here instead of forcing every
  // caller to widen.
  cursor: unknown
  muyaIndexCursor?: unknown
  sourceCode: boolean
  showTabBar: boolean
  textDirection: string
  platform: string
}>()

</script>

<style scoped>
.editor-with-tabs {
  position: relative;
  height: 100%;
  flex: 1;
  /* Let the flex parent (.editor-area) size this; min-width:0 stops the
     editor's intrinsic content — long lines, code blocks, a wide tab strip —
     from forcing the column wider than its flex allocation and overflowing
     into the Biscuit panel. max-width:100% keeps it within .editor-area. */
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;

  overflow: hidden;
  background: var(--editorBgColor);
  & > .container {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    position: relative;
  }
}
</style>
