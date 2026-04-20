## 1. Responsive shell and shared viewport behavior

- [x] 1.1 Replace the fixed mobile shell sizing in `src/App.tsx` with viewport-based mobile sizing while preserving the desktop split layout
- [x] 1.2 Add or adjust shared CSS helpers in `src/index.css` for mobile viewport height and safe-area-aware bottom spacing

## 2. State-by-state mobile layout refinement

- [x] 2.1 Tighten spacing and tap target layout for the idle, recording, and analyzing states on small screens
- [x] 2.2 Refine the result and history mobile views to avoid trapped scroll regions and keep primary actions reachable
- [x] 2.3 Update the settings popover and error overlay so long content wraps cleanly and remains usable on narrow screens

## 3. Verification

- [ ] 3.1 Manually verify idle, recording, analyzing, result, history, settings, and error states at mobile and desktop widths
- [x] 3.2 Run `npm run lint` and `npm run build` after the responsive changes are implemented
