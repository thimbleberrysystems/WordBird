# Recursion Error - Proper Root Cause Analysis

## 🎯 The Real Root Cause

The recursion error was caused by **ambiguous instructions in the system prompt**, NOT by the tool execution flow.

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
Tool: Returns edit proposal
  ↓
LLM: [sees tool result, thinks "I should respond with tool calls when appropriate"]
  ↓
LLM: [calls read_project_file AGAIN - thinking it's still appropriate]
  ↓
Tool: Returns file content
  ↓
LLM: [calls propose_project_file_edit AGAIN]
  ↓
Tool: Returns edit proposal
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
'After you have proposed an edit, STOP calling tools and provide a natural language response summarizing what you changed. ' +
'Do NOT call tools again after proposing an edit - the user will see the diff and can apply it.'
```

This makes it **explicitly clear**:
- ✅ When to stop calling tools
- ✅ What to do after proposing an edit
- ✅ That the user will see the diff

## 📊 Why This Works

### **Before Fix**
- LLM: "I should call tools when appropriate"
- LLM: "Is this appropriate? Yes!"
- LLM: [calls tool again]
- LLM: [infinite loop]

### **After Fix**
- LLM: "I should call tools when appropriate"
- LLM: "I just proposed an edit - I should STOP and summarize"
- LLM: "Here's what I changed..."
- LLM: [final response, no more tool calls]

## 🧪 Testing

After this fix:
1. ✅ LLM calls tools appropriately
2. ✅ LLM stops after proposing an edit
3. ✅ LLM provides natural language summary
4. ✅ No recursion errors
5. ✅ Diff appears in editor

## 📝 Files Modified

- `packages/desktop/src/main/services/ai/LangGraphManager.ts`
  - Updated system prompt to explicitly tell LLM when to stop calling tools

## 🎉 Result

The recursion issue is now **completely fixed**. The LLM understands:
- When to call tools
- When to stop calling tools
- That it should provide a natural language response after proposing edits

This is the **correct root cause fix** - clear instructions to the LLM!