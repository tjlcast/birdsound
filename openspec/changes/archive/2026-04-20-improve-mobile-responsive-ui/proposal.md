## Why

The current frontend is optimized around a fixed phone mockup inside a larger desktop layout, but the experience on real mobile screens is cramped and awkward to navigate. Improving the mobile presentation now will make core flows like recording, viewing results, changing settings, and browsing history easier to use on actual phones.

## What Changes

- Rework the primary app layout so it adapts cleanly to narrow mobile viewports instead of relying on a fixed-height device shell.
- Improve spacing, stacking, and scrolling behavior for the idle, recording, analyzing, result, history, settings, and error states on phones.
- Ensure key controls remain reachable and readable on small screens, including safe-area handling, button sizing, and content overflow management.
- Preserve the current desktop experience while making mobile-first layout decisions the default for handheld devices.

## Capabilities

### New Capabilities
- `mobile-responsive-experience`: Defines responsive behavior for the bird sound analysis app across mobile-first layouts and small-screen interaction states.

### Modified Capabilities

## Impact

- Affected code: `src/App.tsx`, `src/index.css`
- No backend or API contract changes
- No new external dependencies expected
- User-visible impact is concentrated in layout, navigation comfort, and small-screen readability
