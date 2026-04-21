## Why

目前的结果页面在移动端（特别是窄宽度屏幕）上显示效果不佳，内容可能溢出或布局混乱，影响用户体验。随着移动设备使用率的增加，确保应用在所有屏幕尺寸上都能良好显示至关重要。

## What Changes

- 优化结果卡片在移动端的布局，确保内容不会溢出屏幕
- 改进响应式设计，使结果页面在不同屏幕宽度下都能良好显示
- 调整字体大小、间距和元素尺寸，提升移动端的可读性和可用性
- 确保历史记录列表在移动端也能正确显示，避免内容被截断

## Capabilities

### New Capabilities
- `responsive-results-display`: 实现响应式的结果显示组件，自动适应不同屏幕尺寸
- `mobile-optimized-layout`: 为移动端优化的布局系统，确保在窄宽度屏幕上也能良好显示

### Modified Capabilities
<!-- Existing capabilities whose REQUIREMENTS are changing (not just implementation).
     Only list here if spec-level behavior changes. Each needs a delta spec file.
     Use existing spec names from openspec/specs/. Leave empty if no requirement changes. -->

## Impact

- 影响 `src/App.tsx` 中的结果显示组件和历史记录显示组件
- 可能需要调整 `src/index.css` 中的响应式样式
- 影响所有使用结果页面的用户，特别是移动端用户