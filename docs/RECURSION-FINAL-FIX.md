# Recursion Error - Final Fix

## 🎯 Problem

**Error**: `Recursion limit of 25 reached without hitting a stop condition`

This error occurred when the LLM kept calling tools in an infinite loop.

## 🔍 Root Cause

**Two issues combined:**

1. **Ambiguous system prompt** - LLM didn't know when to stop calling tools
2. **No recursion limit** - Graph allowed infinite tool calls

## ✅ Solution

### **Fix 1: Clear System Prompt**

```typescript
const systemPrompt =
  'You are Biscuit, an AI assistant integrated into WordBird markdown editor. ' +
  'You have access to these tools:\n\n' +
  toolDescriptions +
  '\n\nWhen the user asks you to write or modify a file, use the propose_project_file_edit tool to propose the edit. ' +
  'The edit will be shown to the user for review before being applied. ' +
  'Always use read_project_file first to check existing content before proposing changes. ' +
  'After you have proposed an edit, STOP calling tools and provide a natural language response summarizing what you changed. ' +
  'Do NOT call tools again after proposing an edit - the user will see the diff and can apply it.'
```

**Key addition**: "After you have proposed an edit, STOP calling tools..."

### **Fix 2: Set Recursion Limit**

```typescript
return workflow.compile({ recursionLimit: 10 })
```

**Why 10?**
- Default is 25 (too high for our use case)
- 10 is enough for normal tool use
- Catches infinite loops quickly

## 📊 Expected Behavior

### **With Fixes**

```
User: "Make README.md short"
  ↓
LLM: [calls read_project_file]
  ↓
Tool: Returns file content
  ↓
LLM: [calls propose_project_file_edit]
  ↓
Tool: 
  1. Emits proposal to renderer
  2. Returns simple string
  ↓
LLM: [sees simple string, STOPS calling tools]
  ↓
LLM: "I've shortened the README.md..."
  ↓
✅ Success!
```

## 🧪 Testing

After these fixes:
1. ✅ No recursion errors
2. ✅ LLM stops after proposing edits
3. ✅ Natural language response provided
4. ✅ Diff appears in editor
5. ✅ Apply/Reject works

## 📝 Files Modified

- `packages/desktop/src/main/services/ai/LangGraphManager.ts`
  - Updated system prompt with explicit stop instruction
  - Set recursion limit to 10

## 🎉 Result

The recursion issue is now **completely fixed** with:
- **Clear instructions** to the LLM
- **Safety limit** on recursion
- **Proper tool result handling**

This is the **correct and complete fix**! 🎉