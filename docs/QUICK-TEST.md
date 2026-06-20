# Quick Test Guide for Recursion Fix

## 🚀 Test the Fix

### 1. Restart WordBird
```bash
# Kill any running instances
pkill -f wordbird

# Start fresh
pnpm run dev
```

### 2. Open a Markdown File
Open any markdown file in WordBird.

### 3. Test Edit Flow
Ask the AI to make an edit, for example:
- "Shorten this file by removing the last paragraph"
- "Fix the typo in this file"
- "Add a title to this file"

### 4. Verify Behavior
**✅ Success Indicators:**
- Edit proposal appears in the editor with colored highlights
- Apply/Reject buttons appear in the floating panel
- No "recursion limit" error in console
- AI provides a natural language summary after proposing

**❌ Failure Indicators:**
- Recursion limit error in console
- AI keeps calling tools after proposing
- No diff display

## 📋 Debug Commands

### Check Console Logs
```bash
# Look for these messages:
grep -n "edit proposal" packages/desktop/src/main/services/ai/*.ts
```

### Verify Code Changes
```bash
# Check that _editProposed flag exists
grep -n "_editProposed" packages/desktop/src/main/services/ai/LangGraphManager.ts

# Check that system message is injected
grep -n "An edit has already been proposed" packages/desktop/src/main/services/ai/LangGraphManager.ts
```

## 🔧 If Still Not Working

1. **Clear all state:**
   ```bash
   rm -rf ~/.config/WordBird
   ```

2. **Check model:**
   - Use `gpt-4o` or `claude-3-5-sonnet`
   - Avoid `gpt-3.5-turbo`

3. **Add more logging:**
   ```typescript
   // Add in sendMessage method
   console.log('[DEBUG] _editProposed:', this._editProposed, 'hasSystemMessage:', hasSystemMessage)
   ```

4. **Try Option A** from the full troubleshooting guide

## 🎯 Expected Timeline

- **Before fix:** Recursion error within 2-3 tool calls
- **After fix:** Edit proposal appears, then natural language summary