## REMOVED Requirements

### Requirement: Installable app with a prompt-driven service worker
**Reason**: The apps install from the stores; the web app ships without a service worker (#346 D8, section 7).
**Migration**: app-update "Forced update below the minimum version".

### Requirement: Runtime caching rules
**Reason**: No service worker; the native map caches tiles itself and offline data lives in SQLite.
**Migration**: offline-data-cache, offline-map.

### Requirement: Service worker push handler
**Reason**: Push is delivered by the operating system to the native apps; web push is dropped (#346 D9).
**Migration**: notifications "Native push opt-in per device".

### Requirement: Service worker notification click handler
**Reason**: A tapped push opens the native app through the link resolver.
**Migration**: deep-links "One resolver for every way into the app".

### Requirement: Web Push subscription on permission grant
**Reason**: Web push is dropped (#346 D9).
**Migration**: notifications "Native push opt-in per device".

### Requirement: PWA pages extend content into safe-area zones
**Reason**: Native screens use the system safe areas.
**Migration**: None.

### Requirement: Interactive controls stay clear of bottom safe-area
**Reason**: Native screens use the system safe areas.
**Migration**: None.

### Requirement: Self-contained app shell (no external font origin)
**Reason**: Fonts ship inside the native apps and the web bundle (#346 D11); covered by design-system.
**Migration**: design-system.
