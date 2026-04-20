## MODIFIED Requirements

### Requirement: Mobile state content remains readable and reachable
The system SHALL present idle, recording, analyzing, result, history, settings, and error states with mobile-friendly spacing, readable text sizing, and tap targets that remain reachable on small screens.

#### Scenario: Primary actions stay reachable on result and history screens
- **WHEN** a user views a long result list or history list on a phone
- **THEN** the interface MUST keep key actions readable and reachable without awkward overlapping or inaccessible footer controls

#### Scenario: Dense content wraps without horizontal overflow
- **WHEN** species names, coordinates, API settings, or error messages exceed the typical line length on a phone
- **THEN** the interface MUST wrap or stack content without causing horizontal scrolling

#### Scenario: Mobile settings surface uses comfortable width
- **WHEN** a user opens the settings panel on a narrow mobile viewport
- **THEN** the settings surface MUST use enough horizontal space to avoid a cramped form layout while remaining fully visible inside the active mobile UI

#### Scenario: Mobile settings content remains easy to scan
- **WHEN** the mobile settings panel displays server status, location, host, and port information together
- **THEN** the content MUST use spacing and layout that keep each section readable and easy to interact with on a phone
