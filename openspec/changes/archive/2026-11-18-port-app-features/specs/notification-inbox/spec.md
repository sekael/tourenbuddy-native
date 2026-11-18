## REMOVED Requirements

### Requirement: Inbox entry point with attention badge
**Reason**: The native navigation (D19) puts the inbox in the Profile tab and its badge on that tab, not in a speed-dial menu.
**Migration**: app-navigation "Unread inbox entries badge the Profile tab" and "Inbox opens from Profile" below.

## ADDED Requirements

### Requirement: Inbox opens from Profile
The Profile tab SHALL hold an Inbox row with the badge count (unread, not stale, capped at "9+", hidden at zero) that opens the inbox as a sheet. Rows SHALL support swipe to delete and a context menu with Mark as read; the sheet's navigation bar SHALL offer Mark all read and Clear.

#### Scenario: Stale entries are not counted
- **WHEN** the user has 2 unread entries, one being a friend request already answered on another device
- **THEN** the Inbox row shows "1"
