<template>
  <aside class="right-prompt" role="complementary" aria-label="WordBird chat panel">
    <header class="prompt-header">
      <div class="prompt-title">WordBird</div>
    </header>

    <section class="prompt-body">
      <!-- Conversation body is empty -->
    </section>

    <footer class="prompt-footer">
      <div class="prompt-input-outer">
        <div class="prompt-input-wrapper">
          <textarea
            rows="4"
            aria-label="Chat input"
          ></textarea>
        </div>
      </div>
    </footer>
  </aside>
</template>

<script setup lang="ts">
// Visual placeholder only; no interactive behavior is required.
</script>

<style scoped>
.right-prompt {
  width: var(--prompt-width, 340px);
  min-width: 300px;
  max-width: 450px;
  display: flex;
  flex-direction: column;
  background: var(--editorBgColor);
  border-left: 1px solid var(--color-border, rgba(128, 128, 128, 0.2));
  overflow: hidden;
  box-sizing: border-box;
}

.prompt-header {
  padding: 12px var(--spacing-4);
  border-bottom: 1px solid var(--color-border, rgba(128, 128, 128, 0.2));
  background: var(--dialogBgColor, var(--editorBgColor));
}

.prompt-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-primary, #409eff);
  letter-spacing: 0.05em;
  text-align: center;
}

.prompt-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-4);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  background: var(--editorBgColor);
}

.message {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-primary, #409eff);
}

.message.user .message-label {
  color: var(--color-secondary, #909399);
}

.message-text {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-text, #303133);
}

.prompt-footer {
  padding: var(--spacing-3) var(--spacing-4) var(--spacing-4);
  border-top: 1px solid var(--color-border, rgba(128, 128, 128, 0.15));
  background: var(--dialogBgColor, var(--editorBgColor));
}

.prompt-input-outer {
  display: flex;
  flex-direction: column;
}

.prompt-input-wrapper {
  display: flex;
  background: var(--inputBgColor, rgba(128, 128, 128, 0.05));
  border: 1px solid var(--color-border, rgba(128, 128, 128, 0.25));
  border-radius: 8px; /* Rounded rectangle box */
  padding: 8px var(--spacing-3);
  box-sizing: border-box;
}

.prompt-input-wrapper textarea {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text, #303133);
  resize: vertical;
  min-height: 60px;
  outline: none;
  font-family: inherit;
  font-size: 0.85rem;
  line-height: 1.4;
}

.prompt-input-wrapper textarea::placeholder {
  color: var(--color-secondary, #c0c4cc);
}
</style>