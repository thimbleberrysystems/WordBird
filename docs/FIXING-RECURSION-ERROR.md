# Fixing Recursion Errors in LangGraph Agent

## Problem Summary

The LLM was calling tools in an infinite loop after proposing an edit, causing a recursion limit error.

## Root Cause

The system prompt instructions were not being followed by the LLM, which continued to call tools even after proposing an edit.

## Solution Implemented

### 1. **State Tracking**
Added `_editProposed` flag to track when an edit has been proposed:

```typescript
private _editProposed: boolean = false
```

### 2. **Flag Management**
- Set to `true` when edit proposal is emitted
- Reset to `false` on disconnect or when starting a new conversation

### 3. **Dynamic System Message Injection**
When `_editProposed` is true, inject a stronger system message:

```typescript
if (this._editProposed) {
  langchainMessages.unshift(new SystemMessage(
    'IMPORTANT: An edit has already been proposed. Do NOT call any tools. ' +
    'Just provide a natural language summary of what was done.'
  ))
}
```

### 4. **Tool Result Simplification**
Ensure tool results are simple strings, not complex objects:

```typescript
// In AgentToolService.ts
if (this._editProposalEmitter && isEditProposalPayload(result)) {
  await this._editProposalEmitter(result)
  return `Edit proposal created with ID: ${result.edit.id}`
}
```

## Testing the Fix

### Step 1: Clear Browser Cache
```bash
# Close all WordBird instances
pkill -f wordbird

# Clear any cached state
rm -rf ~/.config/WordBird
```

### Step 2: Start Fresh
```bash
pnpm run dev
```

### Step 3: Test Edit Flow
1. Open a markdown file
2. Ask the AI to edit it (e.g., "Shorten this file")
3. **Expected behavior:**
   - ✅ Edit proposal appears in editor
   - ✅ Apply/Reject buttons appear
   - ✅ No recursion error
   - ✅ AI provides natural language summary

### Step 4: Verify Console Logs
Look for these logs in the main process console:
```
[LangGraphMain] Sending edit proposal to renderer
[AgentToolService] Emitting edit proposal from tool
[AgentToolService] Returning string result for tool
```

## Debugging Checklist

### If Recursion Still Occurs:

1. **Check System Prompt**
   ```bash
   # Verify the system prompt is being added
   grep -n "CRITICAL INSTRUCTIONS" packages/desktop/src/main/services/ai/LangGraphManager.ts
   ```

2. **Verify Flag is Set**
   ```bash
   # Add debug log in sendMessage
   console.log('[LangGraphMain] _editProposed:', this._editProposed)
   ```

3. **Check Tool Results**
   ```bash
   # Verify tool results are strings
   grep -n "Returning string result" packages/desktop/src/main/services/ai/AgentToolService.ts
   ```

4. **Verify Recursion Limit**
   ```bash
   # Check recursion limit is set
   grep -n "recursionLimit: 10" packages/desktop/src/main/services/ai/LangGraphManager.ts
   ```

## Alternative Approaches

If the above doesn't work, try these alternatives:

### Option A: Disable Tools After First Proposal
```typescript
// In _buildGraph, use a conditional edge that checks _editProposed
.addConditionalEdges('agent', (state) => {
  if (this._editProposed) {
    return '__end__'
  }
  return toolsCondition(state)
}, {
  tools: 'tools',
  __end__: '__end__'
})
```

### Option B: Use Different Model
Some models are better at following instructions:
- Try `gpt-4o` or `claude-3-5-sonnet`
- Avoid older models like `gpt-3.5-turbo`

### Option C: Simplify Tool Schema
Reduce the complexity of tool arguments to make it easier for the LLM to understand when to stop.

## Expected Behavior After Fix

### Before Fix:
```
User: "Shorten this file"
AI: [calls propose_project_file_edit]
AI: [calls propose_project_file_edit again]
AI: [calls propose_project_file_edit again]
... (recursion limit reached)
```

### After Fix:
```
User: "Shorten this file"
AI: [calls propose_project_file_edit]
AI: "I've shortened the README.md file. The changes have been proposed and are ready for your review. Click Apply to accept them."
```

## Additional Notes

- The fix is **conservative** - it prevents any further tool calls after the first edit proposal
- This is acceptable because the user can always ask for more edits after applying/rejecting
- The `_editProposed` flag is reset when a new conversation starts
- The system message injection provides a strong signal to the LLM to stop tool usage