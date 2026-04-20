## ADDED Requirements

### Requirement: Mobile layout adapts to the real viewport
The system SHALL render the primary bird sound analysis interface as a mobile-first layout on small screens, using the available viewport height instead of a fixed device mockup height.

#### Scenario: Small-screen app shell uses available viewport space
- **WHEN** the app is opened on a narrow mobile viewport
- **THEN** the main shell MUST size itself to the available viewport and avoid clipping core content behind a fixed-height frame

#### Scenario: Desktop layout remains available on large screens
- **WHEN** the app is opened on a desktop-sized viewport
- **THEN** the larger split layout MUST remain available without forcing the mobile shell rules onto desktop presentation

### Requirement: Mobile state content remains readable and reachable
The system SHALL present idle, recording, analyzing, result, history, settings, and error states with mobile-friendly spacing, readable text sizing, and tap targets that remain reachable on small screens.

#### Scenario: Primary actions stay reachable on result and history screens
- **WHEN** a user views a long result list or history list on a phone
- **THEN** the interface MUST keep key actions readable and reachable without awkward overlapping or inaccessible footer controls

#### Scenario: Dense content wraps without horizontal overflow
- **WHEN** species names, coordinates, API settings, or error messages exceed the typical line length on a phone
- **THEN** the interface MUST wrap or stack content without causing horizontal scrolling

### Requirement: Mobile scrolling respects safe areas and nested content
The system SHALL handle small-screen scrolling so that content sections, sticky actions, and bottom padding work with mobile safe areas and do not create unusable nested scroll regions.

#### Scenario: Bottom actions remain visible above mobile safe areas
- **WHEN** a user opens the app on a device with a bottom safe-area inset
- **THEN** bottom-aligned controls MUST include enough inset-aware spacing to remain fully visible and tappable

#### Scenario: Scrollable mobile views avoid trapped content
- **WHEN** a mobile user scrolls through result or history content
- **THEN** the active view MUST allow the user to reach all cards and actions without content being trapped inside conflicting scroll containers
