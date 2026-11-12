## REMOVED Requirements

### Requirement: Disclaimer when notifications are effectively off
**Reason**: Restated for the native notification settings.
**Migration**: "Hint when nothing reaches the user outside the app" below.

### Requirement: iOS PWA gating
**Reason**: The native app is installed by definition; push is available on every iOS and Android device.
**Migration**: "Native push opt-in per device" below.

### Requirement: Compact unavailable indicator for push notifications
**Reason**: Native apps read the operating system's permission and link to Settings instead.
**Migration**: "Native push opt-in per device" below.

### Requirement: Web Push subscription registration
**Reason**: Web push is dropped (#346 D9); the native apps register OS push tokens. The PWA keeps its own spec in the Vue repository until Phase 7.
**Migration**: "Native push opt-in per device" below.

### Requirement: Stale push subscription cleanup
**Reason**: Web push subscriptions are not used by the native apps; native token cleanup is the backend's (`add-native-backend`, Vue repository).
**Migration**: None in the app.

### Requirement: Per-device push toggle
**Reason**: Restated for OS push tokens and permissions.
**Migration**: "Native push opt-in per device" below.

### Requirement: Sign-out removes this device's push registration
**Reason**: Restated for OS push tokens.
**Migration**: "Native push opt-in per device" below.

### Requirement: Notification click deep link
**Reason**: Native apps open from the push itself; there is no window to focus.
**Migration**: "Push opens its target" below and add-native-polish's deep-links.

## ADDED Requirements

### Requirement: Native push opt-in per device
The notifications settings SHALL show a push switch for this device. Turning it on SHALL ask for the operating system's permission only then, register the device token with the server and keep it registered on each launch while permitted; turning it off SHALL delete this device's registration. When the permission is denied, the switch SHALL be replaced by a row explaining it with a link to the app's system settings. The app SHALL never ask for push permission unprompted.

#### Scenario: First enable
- **WHEN** the user turns push on for the first time
- **THEN** the system permission prompt appears, and after "Allow" the device receives the user's pushes

#### Scenario: Permission denied
- **WHEN** the operating system has push denied for the app
- **THEN** the settings show "Notifications are off in Settings" with a button opening the app's settings

#### Scenario: Sign-out
- **WHEN** the user signs out
- **THEN** this device's registration is deleted before the session ends

### Requirement: Push opens its target
Tapping a push SHALL open the app at the inbox entry's target and mark the entry read, from the background and from a cold start. Push handlers SHALL only show or navigate and SHALL never change app data.

#### Scenario: Friend request push from a killed app
- **WHEN** the user taps a friend-request push while the app is not running
- **THEN** the app starts, opens the friend requests and marks the entry read

### Requirement: Hint when nothing reaches the user outside the app
The notification settings SHALL show a hint when push is off or not permitted on this device and email is off, saying that updates still collect in the inbox.

#### Scenario: Both channels off
- **WHEN** push is off on this device and email is disabled
- **THEN** the settings show the hint pointing to the inbox
