# 🔧 Browser Cache Issue - Fix Instructions

## Problem
- **API works**: curl returns 200 OK ✅
- **Browser fails**: Frontend gets 404 ❌
- **Cause**: Browser cache issue

## Solution Steps

### Step 1: Hard Refresh (Try This First)
1. **Chrome/Edge**: Press `Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac)
2. **Firefox**: Press `Ctrl + F5` (or `Cmd + Shift + R` on Mac)
3. **Safari**: Press `Cmd + Option + R`

### Step 2: Clear Browser Cache
1. **Chrome/Edge**:
   - Press `F12` to open DevTools
   - Right-click the refresh button
   - Select "Empty Cache and Hard Reload"

2. **Firefox**:
   - Press `Ctrl + Shift + Delete`
   - Select "Cache" and "Cookies"
   - Click "Clear Now"

### Step 3: Disable Cache (Development)
1. **Chrome/Edge**:
   - Press `F12` → Network tab
   - Check "Disable cache" checkbox
   - Keep DevTools open while testing

2. **Firefox**:
   - Press `F12` → Network tab
   - Click settings gear ⚙️
   - Check "Disable HTTP Cache"

### Step 4: Try Incognito/Private Mode
- **Chrome**: `Ctrl + Shift + N`
- **Firefox**: `Ctrl + Shift + P`
- **Edge**: `Ctrl + Shift + N`

### Step 5: Check Network Tab
1. Open DevTools (`F12`)
2. Go to Network tab
3. Try sending a message
4. Look for the `/api/chat` request
5. Check if it shows 404 or 200

## Alternative: Use Test Page
If the main page still doesn't work, try:
- **URL**: http://localhost:3000/test.html
- This bypasses React and tests the API directly

## Why This Happens
- Next.js serves cached JavaScript bundles
- Browser caches old API routes
- Development server sometimes serves stale files
- Hard refresh forces download of new files

## Verification
After hard refresh, you should see:
- No 404 errors in console
- Chat messages working
- Streaming responses from Claude

---

**Try Step 1 (Hard Refresh) first - this usually fixes it!**
