## Context

The app currently renders a two-column experience: a large desktop-side panel and a fixed-size `360x640` glass device shell that also serves as the mobile UI. In practice, real phone screens vary in width and height, use safe-area insets, and need less decorative chrome and more direct access to controls. Most UI states are implemented in `src/App.tsx` with Tailwind utility classes, while `src/index.css` provides a few shared helpers for glass styling and scrolling.

This change is localized to the frontend but spans every app state because the current layout assumptions are shared across idle, recording, analyzing, result, history, settings, and error views. A design document is useful here because the change is cross-cutting even though it does not alter APIs.

## Goals / Non-Goals

**Goals:**
- Make the primary experience feel natural on real mobile devices instead of a fixed desktop mockup.
- Keep essential actions visible and comfortable to tap on narrow screens.
- Reduce clipping, excessive whitespace, and awkward nested scrolling in result and history flows.
- Preserve the current desktop structure where it already works well.

**Non-Goals:**
- Redesign the full visual identity of the app.
- Change bird analysis APIs, local history behavior, or state management.
- Introduce new routing, component libraries, or large-scale component extraction as part of this change.

## Decisions

### 1. Replace the fixed mobile shell with responsive viewport-based sizing on small screens

The current `max-w-[360px] h-[640px]` shell should become a real mobile-first container that can grow to available viewport height while respecting padding and safe areas. This keeps the app usable on shorter screens and avoids forcing content into an artificial frame.

Alternative considered: keep the shell and only tweak spacing. Rejected because the hard-coded height is one of the main causes of cramped scrolling and inaccessible actions on phones.

### 2. Keep the desktop split layout, but separate mobile and desktop sizing rules more clearly

Desktop already benefits from the split presentation, summary copy, and larger history/result panels. The change should keep that structure while applying mobile-first layout rules below the large-screen breakpoint. This limits risk and keeps the implementation focused.

Alternative considered: unify desktop and mobile into one shared layout tree. Rejected because it would require a larger refactor with more regression risk than this responsive fix needs.

### 3. Normalize spacing and action placement per state

Each state should use smaller but consistent vertical gaps, compact card padding, and bottom actions that remain reachable without excessive scrolling. Result and history screens need the most attention because they currently combine long content with footer actions inside tight containers.

Alternative considered: only add more scrolling. Rejected because it would hide important actions rather than make the layout easier to use.

### 4. Use a small set of shared responsive utility classes instead of broad CSS rewrites

The implementation should stay mostly in `App.tsx` by adjusting Tailwind class usage and adding only a few targeted helpers in `src/index.css` for viewport height and safe-area support. This matches the current codebase style and keeps the change easy to review.

Alternative considered: extract many new components or add a dedicated responsive layout system. Rejected because it adds structure without solving the immediate usability issue more effectively.

## Risks / Trade-offs

- [Mobile spacing changes may affect desktop polish] → Scope class changes behind mobile-first defaults and re-check large breakpoints during implementation.
- [Viewport height handling can differ across mobile browsers] → Prefer modern CSS viewport units with safe-area-aware fallbacks and verify scrolling behavior manually.
- [Single-file UI changes can be easy to regress] → Implement state-by-state and verify idle, recording, analyzing, result, history, settings, and error overlays after each pass.
- [Compact layouts can reduce visual drama] → Preserve the existing glass aesthetic while prioritizing tap reachability and readability.

## Migration Plan

No data or API migration is required. The change can ship as a normal frontend update. If issues appear, rollback is a simple code revert of the responsive layout changes in `src/App.tsx` and `src/index.css`.

## Open Questions

- Whether the mobile settings popover should remain an anchored dropdown or become a full-width sheet if space still feels constrained after the responsive pass.
- Whether the desktop-only summary panel should expose any additional condensed information to mobile result screens, or whether the current top-match card is sufficient.
