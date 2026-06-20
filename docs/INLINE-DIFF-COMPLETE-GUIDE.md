# Inline Diff Implementation - Complete Guide

## 🎯 Overview

This document explains how the inline diff display works in WordBird when LLM edits files.

## 🎨 How Diff is Displayed

### **Method: CSS Class Injection**

The diff is displayed by **injecting CSS classes into existing Muya blocks**, NOT by:
- ❌ Modifying the actual file
- ❌ Adding phantom blocks
- ❌ Changing the markdown content

### **Technical Flow**

```
1. LLM proposes edit (via tool call)
   ↓
2. Main process sends proposal via IPC
   ↓
3. Renderer maps line range to Muya blocks
   ↓
4. Renderer calls muya.contentState.setDiffState()
   ↓
5. Muya adds CSS classes to blocks (.ag-diff-added/removed/modified)
   ↓
6. Browser renders with colored backgrounds
```

## 📁 Key Files

| File | Purpose |
|------|---------|
| `LangGraphManager.ts` | Main process: handles LLM communication |
| `AgentToolService.ts` | Tool execution and LangChain integration |
| `AgentToolHandlers.ts` | Safe file operation handlers |
| `editor.vue` | Renderer: receives proposals, applies diff state |
| `AgentProposalController.vue` | Renderer: updates store, handles apply events |
| `agentEditorApply.ts` | Renderer: applies edits to Muya |
| `renderLeafBlock.js` | Muya: adds CSS classes to blocks |
| `default.css` | CSS styles for diff highlighting |

## 🎮 User Experience

### **Before Apply**
```
┌────────────────────────────────────────────────────────────┐
│ ✏️ 1 pending edit in README.md   [Apply] [Reject]          │
└────────────────────────────────────────────────────────────┘

# Old Title          ← No highlighting
Some content...      ← No highlighting
~~Removed line~~     ← 🔴 Red background
Added line           ← 🟢 Green background
```

### **After Apply**
```
# New Title          ← No highlighting (content changed)
Some content...      ← No highlighting
Added line           ← No highlighting (content changed)
```

## 🔧 Technical Implementation

### **1. Edit Proposal Generation**

**File**: `AgentToolHandlers.ts`

```typescript
const proposeProjectFileEdit = async(args, context) => {
  const oldContent = await readTextFile(filePath)
  const nextContent = replaceLineRange(oldContent, newdata, start, end)
  
  return {
    edit: {
      id: uuid(),
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

### **2. IPC Communication**

**File**: `LangGraphManager.ts`

```typescript
// After tool execution
if (result.ok && isEditProposalPayload(result.data)) {
  mainWindow.webContents.send('mt::ai:edit-proposal', proposal)
}
```

### **3. Renderer Processing**

**File**: `editor.vue`

```typescript
const handleAgentEditProposal = (proposal) => {
  // Map line range to Muya blocks
  const diffStates = mapLinesToBlocks(blocks, start, end)
  
  // Apply to Muya
  applyDiffStateToMuya(editor.value, diffStates)
}
```

### **4. Muya Block Rendering**

**File**: `renderLeafBlock.js`

```javascript
const diffStates = this.muya.contentState.diffState?.get(key) || []
if (diffStates.length > 0) {
  const changeTypes = diffStates.map(d => d.changeType)
  if (changeTypes.includes('added')) {
    selector += '.ag-diff-added'
  } else if (changeTypes.includes('removed')) {
    selector += '.ag-diff-removed'
  }
}
```

### **5. CSS Styling**

**File**: `default.css`

```css
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

## 🛡️ Security & Safety

### **What We DON'T Do**
- ❌ Modify file until user confirms
- ❌ Execute arbitrary code
- ❌ Access files outside project scope
- ❌ Expose tool execution to renderer

### **What We DO**
- ✅ Validate file paths in main process
- ✅ Use exact path matching
- ✅ Keep filesystem access in main process
- ✅ Require user confirmation before applying

## 🐛 Troubleshooting

### **Common Issues**

1. **No diff showing**
   - Check file path matching
   - Verify Muya is initialized
   - Check browser console for errors

2. **Apply button not working**
   - Verify file path matching
   - Check if `setMarkdown` is called
   - Verify editor store updates

3. **Recursion errors**
   - Check system prompt clarity
   - Verify tool results are simple strings
   - Check recursion limit

### **Debug Console Logs**

Look for these logs:
```
[Editor] handleAgentEditProposal called
[Editor] Applying visual diff state to Muya
[Editor] Found X blocks in editor
[Editor] Applying diff state to Muya: X blocks
[AgentToolService] Emitting edit proposal
[AgentToolService] Returning string result
```

## 🎉 Summary

The inline diff implementation:
- ✅ Uses CSS class injection (not phantom blocks)
- ✅ Keeps files safe until user confirms
- ✅ Provides VSCode-like experience
- ✅ Is secure and efficient
- ✅ Works with Muya's undo/redo stack

This is the **correct and optimal** way to display diffs in a WYSIWYG editor! 🎉