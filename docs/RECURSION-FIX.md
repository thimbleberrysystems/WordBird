# Recursion Limit Error - Fixed

## 🐛 Problem

**Error**: `Recursion limit of 25 reached without hitting a stop condition`

This error occurred when the LLM kept calling tools repeatedly instead of generating a final response.

## 🔍 Root Cause

The issue was in the **tool execution flow**:

1. **LLM calls tool** (e.g., `propose_project_file_edit`)
2. **Tool executes successfully** and returns an edit proposal
3. **Tool result is returned to LangGraph**
4. **LangGraph passes result back to LLM**
5. **LLM sees tool result and tries to call tools again**
6. **Infinite loop** → Recursion limit error

The problem was that **edit proposals were being returned as complex objects**, which confused the LLM into thinking it needed to take more actions.

## ✅ Solution

**Modified tool execution to return simple strings for edit proposals:**

```typescript
// In AgentToolService.ts
if (isEditProposalPayload(result)) {
  // Emit the proposal to renderer
  await this._editProposalEmitter(result)
  
  // Return simple string to LLM (not the complex object)
  return `Edit proposal created with ID: ${result.edit.id}`
}

// Return result normally for other tools
return result
```

## 🎯 Why This Works

1. **Edit proposal is emitted to renderer** via IPC (separate channel)
2. **Simple string returned to LLM** (no confusion)
3. **LLM generates final response** (no more tool calls)
4. **No recursion** - clean flow

## 📊 Before vs After

### ❌ Before (Broken)
```
User: "Make this file better"
  ↓
LLM: [calls propose_project_file_edit]
  ↓
Tool: Returns { edit: {...}, oldContent: "...", originalPath: "..." }
  ↓
LLM: [sees complex object, tries to call tools again]
  ↓
Tool: Returns { edit: {...}, oldContent: "...", originalPath: "..." }
  ↓
LLM: [infinite loop]
  ↓
ERROR: Recursion limit reached
```

### ✅ After (Fixed)
```
User: "Make this file better"
  ↓
LLM: [calls propose_project_file_edit]
  ↓
Tool: 
  1. Emits proposal to renderer (IPC)
  2. Returns "Edit proposal created with ID: abc-123"
  ↓
LLM: [sees simple string, generates final response]
  ↓
User: [sees diff in editor + final response]
```

## 🧪 Testing

After this fix:
1. ✅ No more recursion errors
2. ✅ Edit proposals are emitted correctly
3. ✅ LLM generates final response
4. ✅ Diff appears in editor
5. ✅ User can Apply/Reject

## 📝 Files Modified

- `packages/desktop/src/main/services/ai/AgentToolService.ts`
  - Modified `_toLangChainTool()` to handle edit proposals specially
  - Returns simple string for edit proposals
  - Emits proposal via separate channel

## 🎉 Result

The recursion issue is now **completely fixed**. The LLM will:
1. Call tools when needed
2. Receive simple results
3. Generate final responses
4. No infinite loops!

This is the **correct and optimal** way to handle tool results in LangGraph!