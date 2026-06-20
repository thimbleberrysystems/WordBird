# Inline Diff Troubleshooting Guide

## 🚨 Current Issue

The diff is not displaying inline in the editor. Based on the logs, the proposals are being generated but not processed correctly by the renderer.

## 🔍 Root Cause Analysis

From the logs, I can see:
1. ✅ Edit proposals ARE being generated
2. ✅ Proposals ARE being sent to renderer via IPC
3. ❌ Renderer is NOT processing them (file path mismatch)

The issue is in the **file path matching logic**. The proposal has:
- `filePath: 'README.md'`
- `originalPath: '/home/franklynece/test/biscuit5/README.md'`

But the current file might have:
- `pathname: '/home/franklynece/test/biscuit5/README.md'`
- `filename: 'README.md'`

## ✅ Fix Applied

Updated the file path matching in both:
- `editor.vue` - `handleAgentEditProposal`
- `agentEditorApply.ts` - `applyAgentEditToCurrentFile`

The new logic checks multiple path formats:
```typescript
const pathMatches = 
  proposalPath === currentFilePath ||
  proposalPath === currentFile.filename ||
  currentFilePath.endsWith(proposalPath) ||
  proposalPath === new URL(originalPath).pathname.split('/').pop() ||
  originalPath === currentFilePath
```

## 🧪 Testing Steps

### 1. **Restart WordBird**
```bash
# Kill any running instances
pkill -f wordbird

# Restart
pnpm start
```

### 2. **Open the Test File**
- Open `/home/franklynece/test/biscuit5/README.md` in WordBird
- Make sure it's the active/current file

### 3. **Trigger an Edit**
- Ask the AI to make a simple change
- Example: "Change the title to 'Test'"

### 4. **Check Console Logs**
Open DevTools (`Ctrl+Shift+I`) and look for:

**Expected logs:**
```
[Editor] handleAgentEditProposal called
[Editor] Processing proposal for current file
[Editor] Added to agent store
[Editor] Found X blocks in editor
[Editor] Created diff state for X blocks
[Editor] Applied diff state to Muya
```

**If you see:**
```
[Editor] Proposal is for different file, skipping
```
Then the file path matching still needs adjustment.

### 5. **Verify Inline Highlighting**
- Changed lines should have colored backgrounds
- Green = added
- Red = removed
- Amber = modified

### 6. **Test Apply Button**
- Click "Apply" in the control panel
- Should see:
  ```
  [AgentEdit] applyAgentEdit called
  [Editor] handleApplyAgentEdit called
  [Editor] setMarkdown called
  [Editor] Edit applied successfully
  ```

## 🛠️ Additional Debugging

If still not working, add these manual checks:

### Check 1: File Paths
In the console, run:
```javascript
// Check what the current file path is
console.log('Current file:', window.electron?.store?.currentFile)

// Check the proposal path
console.log('Proposal path:', 'README.md')
```

### Check 2: Muya Editor State
```javascript
// Check if editor is initialized
console.log('Editor available:', !!window.muya)

// Check blocks
console.log('Blocks:', window.muya?.contentState?.blocks?.length)
```

### Check 3: Diff State
```javascript
// Check if diff state is applied
console.log('Diff state:', window.muya?.contentState?.diffState)
```

## 📊 Expected Behavior

### Before Fix
```
┌────────────────────────────────────────────────────────────┐
│ ✏️ 1 pending edit in README.md   [Apply] [Reject]          │
└────────────────────────────────────────────────────────────┘

[Editor] Proposal is for different file, skipping
```

### After Fix
```
┌────────────────────────────────────────────────────────────┐
│ ✏️ 1 pending edit in README.md   [Apply] [Reject]          │
└────────────────────────────────────────────────────────────┘

Normal content...
~~This line was removed~~    ← 🔴 Red background
This line was added          ← 🟢 Green background
```

## 🎯 Quick Verification

1. **Open DevTools** (`Ctrl+Shift+I`)
2. **Clear console** (`Ctrl+Shift+C`)
3. **Make an edit request**
4. **Check for these logs**:
   - `[Editor] handleAgentEditProposal called`
   - `[Editor] Processing proposal for current file`
   - `[Editor] Found X blocks in editor`
   - `[Editor] Applied diff state to Muya`

If you see all these logs, the diff should be visible!

## 🚀 If Still Not Working

1. **Check the file is actually open** in WordBird
2. **Verify the file path** matches exactly
3. **Try a simpler edit** (single line change)
4. **Check browser console** for JavaScript errors
5. **Restart WordBird** completely

## 📝 Summary

The fix addresses the **file path matching issue** that was preventing the renderer from processing edit proposals. The new logic is more flexible and handles various path formats that may be used in different contexts.