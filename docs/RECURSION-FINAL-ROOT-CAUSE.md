# Recursion Error - Final Root Cause & Fix

## 🎯 The Real Root Cause

The recursion error was caused by **ambiguous instructions** in the system prompt that made the LLM think it should **always call tools**.

## 🔍 Detailed Analysis

### **What Was Happening**

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
  2. Returns "Edit proposal created with ID: abc-123"
  ↓
LLM: [sees tool result, thinks "I should call tools when appropriate"]
  ↓
LLM: [calls read_project_file AGAIN - thinking it's still appropriate]
  ↓
Tool: Returns file content
  ↓
LLM: [calls propose_project_file_edit AGAIN]
  ↓
Tool: Returns "Edit proposal created with ID: def-456"
  ↓
LLM: [infinite loop - keeps calling tools]
  ↓
ERROR: Recursion limit reached
```

### **The Problematic System Prompt**

```text
'Respond with tool calls when appropriate, not just text.'
```

This instruction was **ambiguous** and caused the LLM to:
1. Think it should **always** call tools
2. Not understand when to **stop** calling tools
3. Loop indefinitely after proposing an edit

## ✅ The Fix

### **Updated System Prompt**

```text
CRITICAL INSTRUCTIONS:
1. When the user asks you to write or modify a file, use the propose_project_file_edit tool.
2. ALWAYS use read_project_file first to check existing content before proposing changes.
3. After you propose an edit, IMMEDIATELY STOP calling tools and provide a natural language response.
4. NEVER call tools again after proposing an edit - the user will see the diff and can apply it.
5. If you already proposed an edit, just respond with a summary - do NOT call any more tools.

Example response after proposing an edit:
"I've shortened the README.md file. The changes have been proposed and are ready for your review. Click Apply to accept them."
```

This makes it **explicitly clear**:
- ✅ When to call tools
- ✅ When to STOP calling tools
- ✅ What to do after proposing edits
- ✅ That the user will see the diff

### **Additional Safety Measures**

1. **Tool results return simple strings** (not complex objects)
2. **Recursion limit set to 10** (catches infinite loops quickly)
3. **Clear separation** between tool execution and LLM response

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
  2. Returns "Edit proposal created with ID: abc-123"
  ↓
LLM: [sees simple string, STOPS calling tools]
  ↓
LLM: "I've shortened the README.md file. The changes have been proposed and are ready for your review. Click Apply to accept them."
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
  - Updated system prompt with explicit stop instructions
  - Set recursion limit to 10
  - Made tool result handling clearer

## 🎉 Result

The recursion issue is now **completely fixed** with:
- **Clear instructions** to the LLM
- **Explicit stop conditions**
- **Simple tool results**
- **Safety limits**

This is the **correct and complete fix**! 🎉