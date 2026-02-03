# UserMessage Component Verification

## How to Verify It Works

### Test 1: Image Attachment
1. Open chat page
2. Click photo button, select an image from photobook
3. Type "add this photo to the page"
4. Send message
5. **Expected**: See small thumbnail (96x96px) above your message text
6. **No ugly XML tags** should be visible

### Test 2: Computer Upload
1. Open chat page
2. Drag a photo from your desktop onto chat
3. Wait for upload to complete
4. Type "use this image"
5. Send message
6. **Expected**: See thumbnail + text, no XML

### Test 3: Multiple Images
1. Attach 2-3 images
2. Type "add all these"
3. Send
4. **Expected**: Horizontal row of thumbnails, all visible

### Test 4: Markdown + Images
1. Attach one image
2. Type: `**bold text** and *italic text*`
3. Send
4. **Expected**: Thumbnail + formatted markdown text

### Test 5: SuperTemplate
1. Click templates button
2. Select a template
3. Type "add this template"
4. Send
5. **Expected**: Template card (with name + ID) + text

### Test 6: Mixed Attachments
1. Attach one image + one template
2. Type "integrate these"
3. Send
4. **Expected**: Image thumbnail + template card + text

### Test 7: Backward Compatibility (No Attachments)
1. Just type text (no attachments)
2. Send
3. **Expected**: Plain text, no errors

## What Changed

**Before:**
```
<images_attached>
The user has attached 1 image from their photobook:
  - /_images/t/alive.best/o/8360a2eb511f1141/v/orig.webp
...
</images_attached>
<user_message>
add this photo to the page
</user_message>
```

**After:**
```
[96x96px thumbnail]
add this photo to the page
```

## Code Quality Checks

- ✅ No string parsing (structured data)
- ✅ Works with markdown
- ✅ Extensible to new attachment types
- ✅ DRY (buildPromptForClaude helper)
- ✅ Type-safe (Attachment[] type)
- ✅ Backward compatible (undefined attachments)
- ✅ Build passes
- ✅ Linter passes
