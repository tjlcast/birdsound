## Context

The app already has a broader mobile-responsive layout pass, but the settings surface opened from the top-right action still behaves like a compact popover. In `src/App.tsx`, the settings form is absolutely positioned inside the app shell and stretches from `left-0` to `right-0` on small screens, but it still inherits compact popover styling and spacing. On real phones this can leave the panel feeling cramped, especially when combined with rounded shell padding, narrow text fields, and the need to read host, port, location, and server status together.

This change is narrower than the previous mobile layout work, but a design note is still useful because it clarifies how to balance the mobile and desktop presentations of the same settings UI.

## Goals / Non-Goals

**Goals:**
- Make the mobile settings surface visibly wider and easier to scan on narrow screens.
- Improve spacing and positioning so the panel feels like a deliberate mobile surface rather than a squeezed desktop popover.
- Preserve the current anchored compact popover behavior on larger breakpoints.

**Non-Goals:**
- Redesign settings fields or add new configuration options.
- Introduce new routes, modals, or state management patterns.
- Change backend configuration behavior or persistence.

## Decisions

### 1. Treat the mobile settings panel as a sheet-like surface rather than a small popover

On mobile widths, the settings UI should use more of the available horizontal space and separate itself visually from the icon trigger. This improves readability and avoids the impression that the panel is being squeezed into the header corner.

Alternative considered: only increase the fixed width of the current popover. Rejected because width alone does not solve the cramped positioning and visual hierarchy on small screens.

### 2. Keep the desktop anchored popover behavior unchanged

The current desktop behavior is already appropriate for pointer-driven layouts and should remain compact. The change should therefore branch primarily on small-screen layout behavior and avoid broad refactors to the settings interaction model.

Alternative considered: convert settings to a full-screen modal on all breakpoints. Rejected because it would be a larger behavioral change than needed.

### 3. Adjust inner spacing and content flow together with container width

Making the container wider is not sufficient on its own. The status row, location summary, labels, inputs, and submit button should be spaced to match the wider mobile surface so the form feels balanced and remains readable.

Alternative considered: keep existing inner spacing and only reposition the container. Rejected because the panel would still feel dense even if wider.

## Risks / Trade-offs

- [A wider mobile settings surface could overlap more content] → Keep it scoped to the shell width and preserve clear stacking above the main content.
- [Different positioning between mobile and desktop can drift over time] → Keep the same form markup and change only responsive sizing and placement rules.
- [More generous spacing can increase vertical height] → Balance width gains with compact but comfortable vertical spacing.

## Migration Plan

No migration is required. This is a frontend-only layout adjustment and can be reverted by restoring the settings container classes if needed.

## Open Questions

- Whether the final mobile presentation should stop at a wide in-shell sheet or evolve into a full-width overlay if the in-shell version still feels constrained after implementation.
