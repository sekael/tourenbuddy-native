## REMOVED Requirements

### Requirement: Calendar tour automatic triggers
**Reason**: Natively the calendar explains itself with an inline tip on first open.
**Migration**: "Calendar tip" below.

### Requirement: Manual calendar-tour replay
**Reason**: The inline tip stays until dismissed; no tour to replay.
**Migration**: "Calendar tip" below.

### Requirement: Calendar-tour welcome screen (standalone open)
**Reason**: Replaced by the inline tip.
**Migration**: "Calendar tip" below.

### Requirement: Guided calendar step sequence
**Reason**: The tip lists the same points at once.
**Migration**: "Calendar tip" below.

### Requirement: Demo content renders only during the tour
**Reason**: No demo content natively: the tip describes the calendar instead.
**Migration**: "Calendar tip" below.

### Requirement: Calendar-tour banner and non-blocking behavior
**Reason**: No coach-mark overlay natively.
**Migration**: "Calendar tip" below.

### Requirement: One-time calendar feature sign-in notice
**Reason**: Natively the calendar tip reaches everyone whose gate is still fresh, so no separate notice is needed.
**Migration**: "Calendar tip" below.

## ADDED Requirements

### Requirement: Calendar tip
On iOS and Android, while `calendar_tour_show_on_first_open` is true, the Calendar tab SHALL show an inline tip under the month: what the days show, sharing availability (tapping it starts marking free days), and the seasonal overview. Its Done row SHALL set the gate to false, so it never shows again on any device.

#### Scenario: Dismiss the tip
- **WHEN** the user taps Done in the calendar tip
- **THEN** the tip goes and does not return after a relaunch
