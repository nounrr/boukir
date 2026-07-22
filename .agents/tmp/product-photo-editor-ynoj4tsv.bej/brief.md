# Product photo gallery and editor

## Objective

Enhance the existing React/Vite `Photos Produits` application page at `/product-photos` so users can click previously processed or attached product images, browse them in a polished full-screen carousel, edit them, and persist the edited asset safely. The primary target is the `Attachés` tab; the existing `Historique` gallery should reuse the same visual/editor foundation where practical.

Target users are internal back-office operators working quickly on desktop and mobile. All visible copy must be in clear French.

## Existing project and output

- Existing design/component: `frontend/src/pages/ProductPhotoStudioPage.tsx`
- Existing frontend data layer: `frontend/src/store/api/productPhotosApi.ts`
- Existing Express backend: `backend/routes/productPhotos.js`
- Application output path: modify files in their existing project locations; do not create a standalone page.
- Framework: React 19, TypeScript, Vite, Tailwind CSS, RTK Query, Lucide React, SweetAlert2.
- Do not introduce an external image-editing dependency unless it is truly necessary. Prefer native Canvas/WebGL utilities kept in focused modules so behavior can be tested.
- Preserve existing behavior and unrelated user changes. The `whtsp-serviceOLD` worktree is already dirty and out of scope.

## Design direction

Create a focused "digital light table" editor: nearly black full-screen canvas for accurate photo inspection, warm orange accents matching the page, restrained white/gray chrome, generous breathing room, and compact professional controls. The experience should feel like a simplified product-photography workstation, not a generic modal.

The memorable detail is the transform workspace: the selected image floats on a subtle checker/grid stage with direct crop/perspective handles, while a filmstrip keeps the whole product session visible.

Typography should inherit the application's existing sans-serif stack. Use weight, spacing, and tabular numerals for hierarchy; do not add a webfont.

Color direction:

- Canvas/backdrop: near black / charcoal.
- Panels: deep slate with subtle borders.
- Primary/save action and active tool: existing orange brand family.
- Success: green; destructive actions: red; neutral controls: gray/white.
- White expansion/background must render as literal white in exported image.

No new raster assets are needed; use existing product images and Lucide icons. Avoid custom SVG art.

## Interaction and content structure

1. In `Attachés`, every image thumbnail becomes an accessible button with hover/focus affordance and zoom/edit hint.
2. Clicking opens the gallery at that exact image.
3. Full-screen gallery/editor:
   - Header: product designation/reference, image counter, before/after toggle, reset, close.
   - Center: responsive image stage with zoom/pan and direct manipulation handles where relevant.
   - Left/right carousel navigation, desktop keyboard arrows, Escape to close. Do not hijack arrows while adjusting a control or typing.
   - Bottom filmstrip with selected state and horizontal scrolling.
   - Tool rail/panel: Crop, Rotate, Flip, Expand, Perspective.
   - Footer actions: cancel/discard and `Enregistrer les modifications`, with progress and disabled states.
4. Mobile: tools become a bottom sheet or horizontally scrollable compact rail; stage remains the dominant area; safe-area spacing; buttons at least 44px.
5. Prevent accidental data loss: if edits are dirty, closing/navigating to another image asks for confirmation or offers discard/save.

## Required editing behavior

- Rotation left/right by 90 degrees and fine rotation slider.
- Horizontal and vertical flip.
- Crop: free plus presets 1:1, 4:5, and 16:9; draggable/resizable crop frame.
- Expand canvas: presets including square and portrait, custom padding control, image centered by default, exported background solid white.
- Perspective equivalent to Photoshop Ctrl/free-transform: four draggable corner handles. Label it `Perspective`. It geometrically warps the existing image and must not invent unseen content.
- Undo/redo, reset to current persisted version, and press/hold or toggle before/after comparison.
- Zoom/pan are viewing controls and must not alter export unless intentionally incorporated by crop/transform.
- Export a high-quality JPEG (or PNG only where required), keep sensible maximum dimensions/file size, and show a clear error if the canvas is tainted or export fails.
- Ensure EXIF/orientation and image loading are handled robustly.
- Include accessible names, focus management, visible focus rings, reduced-motion support, and no mouse-only essential action.

## Persistence and backend integrity

Add a multipart endpoint and RTK Query mutation to replace an edited `product_photo_images` asset. Saving must:

- Validate file type server-side using the project's upload validation.
- Write the new file before database changes.
- In one database transaction, lock the photo image/session and replace its URL.
- If the session is already attached, replace the old URL in `product_images` or `variant_images` and update the product/variant main image when it points at the old URL.
- Preserve the source/original photo and AI metadata; do not overwrite originals silently.
- Return the updated image/session so the UI refreshes immediately.
- Delete the old file only after commit and only when no database reference remains. On failure, roll back and remove the newly uploaded file.
- Reject editing images that do not belong to the addressed session or are in an invalid state.

Also fix deletion of an attached shoot so shared assets are not physically deleted while still referenced from a product/variant gallery. Use a small, reusable "delete only if unreferenced" helper.

The same editor should be available for processed images before attachment when opened from `Historique`; in that case only `product_photo_images` needs updating.

## Suggested code organization

Avoid making the already-large page much harder to maintain. Extract the gallery/editor and pure transform calculations into focused files under `frontend/src/components/product-photos/` and/or `frontend/src/utils/`. Keep the page responsible for opening the editor and supplying session/image context.

## Verification

- Add focused backend `node:test` coverage for URL synchronization/reference-safe deletion if the route can be factored for testing without live DB coupling.
- Add pure unit tests for transform/crop/perspective math if the existing setup permits it; do not add a heavyweight test framework solely for this.
- Run `npm run build` and relevant lint checks. The full repository lint may contain pre-existing problems; distinguish new from existing.
- Run the app if possible and verify `/product-photos` in browser at desktop and mobile widths, including opening the Attached carousel, navigation, each edit tool, undo/redo, dirty-close protection, save/loading/error states, focus, and no console errors.

## Non-goals and safety

- Do not implement an AI-generated "new camera angle" in this change. If mentioned, present it only as a future separate feature because it can hallucinate product details. The requested Photoshop-like angle is geometric perspective.
- Do not modify unrelated modules or database data.
