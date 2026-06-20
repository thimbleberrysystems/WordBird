# Inline Diff Display Implementation

## Overview

WordBird now displays LLM edit proposals as **inline diff highlighting** directly in the editor, similar to VSCode's source control diff view. Changes are highlighted with colored backgrounds, and a compact control bar appears at the top of the editor.

## How It Works

### 1. **Edit Proposal Generation (Main Process)**

When the LLM calls the `write_file` tool:

**File**: `packages/desktop/src/main/services/ai/AgentToolHandlers.ts`

```typescript
const proposeProjectFileEdit = async(args, context) => {
  const oldContent = await readTextFile(filePath)
  const nextContent = replaceLineRange(oldContent, newdata, start, end)
  
  return {
    edit: {
      id: crypto.randomUUID(),
      filePath: relativePath,
      start,
      end,
      newContent: nextContent,
      reason
    },
    oldContent,
    originalPath: filePath
  }
}
```

### 2. **Send Proposal to Renderer (IPC)**

**File**: `packages/desktop/src/main/services/ai/LangGraphManager.ts`

```typescript
async executeTool(call: IAgentToolCall): Promise<IAgentToolResult> {
  const result = await this._agentToolService.execute(call, { projectRoot })
  
  // If this is a write_file tool that returned an edit proposal, emit it to renderer
  if (result.ok && this._agentToolService.isEditProposalPayload(result.data)) {
    const proposal = result.data
    mainWindow.webContents.send('mt::ai:edit-proposal', proposal)
  }
  
  return result
}
```

### 3. **Renderer Receives & Stores**

**File**: `packages/desktop/src/preload/index.ts`

```typescript
ipcRenderer.on('mt::ai:edit-proposal', (event, proposal) => {
  const agentStore = useAgentStore()
  agentStore.addPendingEdit(proposal, proposal.oldContent, proposal.originalPath)
})
```

### 4. **Diff State Management (Pinia Store)**

**File**: `packages/desktop/src/renderer/src/store/agent.ts`

```typescript
export const useAgentStore = defineStore('agent', () => {
  const pendingEdits = ref<AgentEditReview[]>([])
  const diffState = ref<IBlockDiffState[]>([])
  
  function addPendingEdit(proposal, oldContent, originalPath): void {
    pendingEdits.value.push({
      ...proposal,
      oldContent,
      originalPath,
      diff: generateUnifiedDiff(oldContent, proposal.newContent),
      status: 'pending'
    })
  }
  
  function setDiffState(states: IBlockDiffState[]): void {
    diffState.value = states
  }
})
```

### 5. **Inline Diff Highlighting (Muya Integration)**

The diff highlighting is applied directly to Muya blocks:

**File**: `packages/muyajs/lib/contentState/index.js`

```javascript
class ContentState {
  constructor(muya, options) {
    // Diff state for agentic edit proposals
    this.diffState = new Map() // blockKey -> IBlockDiffState[]
  }
  
  setDiffState(diffState) {
    this.diffState = new Map(diffState)
    this.render()
  }
  
  clearDiffState() {
    this.diffState.clear()
    this.render()
  }
}
```

**File**: `packages/muyajs/lib/parser/render/renderBlock/renderLeafBlock.js`

```javascript
// Check for diff state and add CSS classes for agentic edit proposals
const diffStates = this.muya.contentState.diffState?.get(key) || []
if (diffStates.length > 0) {
  const changeTypes = diffStates.map((d) => d.changeType)
  if (changeTypes.includes('added')) {
    selector += `.${CLASS_OR_ID.AG_DIFF_ADDED}`
  } else if (changeTypes.includes('removed')) {
    selector += `.${CLASS_OR_ID.AG_DIFF_REMOVED}`
  } else if (changeTypes.includes('modified')) {
    selector += `.${CLASS_OR_ID.AG_DIFF_MODIFIED}`
  }
}
```

### 6. **CSS Styling**

**File**: `packages/muyajs/themes/default.css`

```css
/* Agentic diff highlighting for inline edit proposals */
.ag-diff-added {
  background-color: rgba(46, 160, 67, 0.14);  /* Green */
}

.ag-diff-removed {
  background-color: rgba(218, 54, 51, 0.14);  /* Red */
}

.ag-diff-modified {
  background-color: rgba(255, 193, 7, 0.14);  /* Amber */
}
```

### 7. **Control Bar UI**

**File**: `packages/desktop/src/renderer/src/components/agent/AgentInlineProposal.vue`

The control bar displays:
- ✏️ Icon with count of pending edits
- File path
- **Apply All** button (green)
- **Reject All** button (red)
- **Show/Hide Diff** toggle

```vue
<template>
  <div v-if="visibleProposals.length > 0" class="agent-inline-proposals">
    <!-- Compact header -->
    <div class="agent-inline-proposal__header">
      <div class="agent-inline-proposal__summary">
        <span class="agent-inline-proposal__icon">✏️</span>
        <div class="agent-inline-proposal__info">
          <strong>{{ visibleProposals.length }} pending edit(s)</strong>
          <span class="agent-inline-proposal__range">
            in {{ visibleProposals[0].filePath }}
          </span>
        </div>
      </div>
      <div class="agent-inline-proposal__actions">
        <el-button type="success" @click="applyAllEdits">Apply All</el-button>
        <el-button type="danger" @click="rejectAllEdits">Reject All</el-button>
        <el-button type="text" @click="toggleDiffView">
          {{ showDiffView ? 'Hide' : 'Show' }} Diff
        </el-button>
      </div>
    </div>
    
    <!-- Optional detailed diff view -->
    <div v-if="showDiffView" class="agent-inline-proposal__details">
      <AgentDiffView 
        v-for="proposal in visibleProposals" 
        :key="proposal.id"
        :old-content="proposal.oldContent" 
        :new-content="proposal.newContent" 
        compact 
      />
    </div>
  </div>
</template>
```

## User Experience Flow

1. **LLM proposes edit** → Control bar appears at top of editor
2. **Changes highlighted inline** → Added lines (green), removed lines (red)
3. **User reviews changes** → Can toggle detailed diff view
4. **User takes action**:
   - **Apply All**: Commits all changes, clears highlighting
   - **Reject All**: Discards all changes, clears highlighting
   - **Show/Hide Diff**: Toggles detailed unified diff view

## Key Features

### ✅ Inline Highlighting
- Changes are highlighted directly in the editor content
- Uses Muya's block rendering system
- Color-coded: green (added), red (removed), amber (modified)

### ✅ Compact Control Bar
- Minimal UI at the top of the editor
- Shows edit count and file path
- Quick Apply/Reject buttons
- Toggle for detailed diff view

### ✅ VSCode-like Experience
- Similar to VSCode's source control diff view
- Changes are visible in context
- Easy to review and accept/reject

### ✅ Persistent State
- Edits remain pending until explicitly applied or rejected
- Diff state is tracked per block
- Can be cleared programmatically

## Files Modified

| File | Purpose |
|------|---------|
| `packages/desktop/src/renderer/src/components/agent/AgentInlineProposal.vue` | Updated control bar UI |
| `packages/desktop/src/renderer/src/services/agentEdit.ts` | Added `rejectAgentEdit` async support |
| `packages/desktop/src/renderer/src/components/editorWithTabs/index.vue` | Updated container styling |
| `packages/muyajs/lib/contentState/index.js` | Diff state tracking |
| `packages/muyajs/lib/parser/render/renderBlock/renderLeafBlock.js` | CSS class application |
| `packages/muyajs/themes/default.css` | Diff color styles |

## Usage Example

```typescript
// When LLM calls write_file tool:
{
  "id": "edit-123",
  "filePath": "src/chapter-1.md",
  "start": 12,
  "end": 18,
  "newContent": "Elara stepped into the moonlit garden...",
  "reason": "Tightened the prose and removed redundant description."
}

// Renderer displays:
// ┌─────────────────────────────────────────────────────┐
// │ ✏️ 1 pending edit in src/chapter-1.md      [Apply] [Reject] │
// └─────────────────────────────────────────────────────┘
//
// [Normal content...]
// Some old text here...                    ← Gray (unchanged)
// ~~This line will be removed~~            ← Red background (removed)
// Elara stepped into the moonlit garden... ← Green background (added)
// More new content...                      ← Green background (added)
// [Normal content...]
```

## Future Enhancements

1. **Per-edit accept/reject**: Allow accepting/rejecting individual edits instead of all-at-once
2. **Navigation**: Jump between different edited regions
3. **Sidebar diff view**: Optional sidebar showing all changes (like VSCode)
4. **Undo support**: Integrate with Muya's undo/redo stack
5. **Source-code mode**: Apply similar highlighting in CodeMirror
