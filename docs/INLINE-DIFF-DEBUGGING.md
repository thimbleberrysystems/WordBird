# Inline Diff Debugging Guide

## 🐛 Current Issues

Based on your feedback, the diff is showing in a separate window instead of inline in the editor. Let me help you debug this.

## 🔍 Debugging Steps

### 1. **Check Browser Console**

Open the developer console in WordBird:
- **Windows/Linux**: `Ctrl + Shift + I` or `F12`
- **macOS**: `Cmd + Option + I` or `F12`

Look for these console logs:
```
[Editor] handleAgentEditProposal called
[Editor] Processing proposal for current file
[Editor] Added to agent store
[Editor] Found X blocks in editor
[Editor] Created diff state for X blocks
[Editor] Applied diff state to Muya
```

### 2. **Verify File Matching**

The proposal must match the current file. Check these logs:
```
[Editor] Proposal is for different file, skipping
```

If you see this, the file path doesn't match. The proposal's `filePath` must match:
- `currentFile.value.pathname` OR
- `currentFile.value.filename` OR  
- `proposal.originalPath`

### 3. **Check Muya Block Highlighting**

After applying diff state, you should see:
```
[Editor] Applied diff state to Muya
```

If you don't see this, the diff state wasn't applied.

### 4. **Test Apply Functionality**

When clicking "Apply":
```
[AgentEdit] applyAgentEdit called for edit: <id>
[AgentEdit] Emitting bus event: apply-agent-edit
[AgentEdit] Calling langGraphService.applyEditInRenderer
[Editor] handleApplyAgentEdit called
[Editor] Applying edit to Muya
[Editor] setMarkdown called with X characters
[Editor] Edit applied successfully, clearing diff state
```

## 🛠️ Common Issues & Solutions

### Issue 1: **No Highlighting Visible**

**Symptoms**: 
- Control panel shows "1 pending edit"
- No colored backgrounds in editor

**Possible Causes**:
1. File path mismatch
2. Muya blocks not found
3. CSS not applied

**Solutions**:
1. Check console for "Proposal is for different file"
2. Verify `blocks.length > 0` in console
3. Check if `.ag-diff-added/removed/modified` classes are in DevTools Elements tab

### Issue 2: **Apply Button Doesn't Work**

**Symptoms**:
- Clicking "Apply" does nothing
- Content doesn't change

**Possible Causes**:
1. Editor not initialized
2. File path mismatch in apply function
3. `setMarkdown` not working

**Solutions**:
1. Check for "Cannot apply edit - editor or currentFile not available"
2. Verify file paths match in `applyAgentEditToCurrentFile`
3. Check if `setMarkdown` is being called with content

### Issue 3: **Diff State Not Cleared**

**Symptoms**:
- After applying, highlighting remains

**Solution**:
- Ensure `clearDiffStateInMuya(editor.value)` is called after apply
- Check console for "Edit applied successfully, clearing diff state"

## 🧪 Testing Checklist

- [ ] Open a markdown file in WordBird
- [ ] Ask AI to make changes to the file
- [ ] Check console for proposal logs
- [ ] Verify control panel appears
- [ ] Check for colored backgrounds in editor
- [ ] Click "Apply"
- [ ] Verify content changes
- [ ] Verify highlighting disappears

## 📊 Expected Console Output

### When Proposal is Received:
```
[Editor] handleAgentEditProposal called { filePath: 'src/doc.md', ... }
[Editor] Processing proposal for current file
[Editor] Added to agent store, now has 1 pending edits
[Editor] Found 15 blocks in editor
[Editor] Created diff state for 3 blocks
[Editor] Applied diff state to Muya
```

### When Apply is Clicked:
```
[AgentEdit] applyAgentEdit called for edit: abc-123-def
[AgentEdit] Emitting bus event: apply-agent-edit
[AgentEdit] Calling langGraphService.applyEditInRenderer
[LangGraphService] applyEditInRenderer called
[Editor] handleApplyAgentEdit called { filePath: 'src/doc.md', ... }
[Editor] Applying edit to Muya
[Editor] setMarkdown called with 1234 characters
[Editor] Edit applied successfully, clearing diff state
```

## 🚨 If Still Not Working

1. **Check the file path** in the proposal matches the current file
2. **Verify Muya is initialized** before applying diff state
3. **Check browser DevTools** Elements tab for CSS classes
4. **Test with simple content** - try editing a small file first
5. **Clear browser cache** and restart WordBird

## 📝 Quick Test

Try this simple test:
1. Open any markdown file
2. Ask AI: "Add a new paragraph saying 'Test edit'"
3. Check if:
   - Control panel appears
   - New paragraph is highlighted in green
   - Clicking Apply adds the paragraph
   - Highlighting disappears

## 💡 Pro Tips

- Use `console.log` liberally to trace the flow
- Check the Network tab for IPC calls
- Use Vue DevTools to inspect the agent store state
- Check the Application tab for localStorage if needed