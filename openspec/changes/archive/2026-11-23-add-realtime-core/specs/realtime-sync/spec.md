## Purpose

How the app keeps server data on screen current: Realtime channels shared between consumers,
debounced refetches, a refetch whenever a channel (re)subscribes, channels paused while the app is
in the background, and Realtime kept apart from notifications.

## ADDED Requirements

### Requirement: Realtime goes through one shared primitive

Feature code SHALL subscribe to Realtime only through the core primitive, never by opening or
removing channels itself. A subscription SHALL name a user-scoped topic and either Postgres change
bindings (event, table and optional filter) or a broadcast event on a private channel, plus a
change callback and an optional subscribed callback, and SHALL return a function that ends it.

#### Scenario: Ending a subscription

- **WHEN** a consumer ends its subscription and it was the topic's only consumer
- **THEN** the channel is removed and the consumer receives no further callbacks

#### Scenario: Ending twice

- **WHEN** a consumer calls its end function a second time
- **THEN** nothing happens

### Requirement: Consumers of a topic share one channel

Consumers of the same topic SHALL share one channel, which SHALL stay open while at least one of
them is subscribed. Every consumer SHALL receive its own change and subscribed callbacks.

#### Scenario: Two consumers on one topic

- **WHEN** two consumers subscribe to the same topic
- **THEN** one channel is opened, and a change on it reaches both consumers' change callbacks

#### Scenario: First consumer leaves

- **WHEN** the first of two consumers ends its subscription
- **THEN** the channel stays open and changes still reach the second consumer

### Requirement: Changes are debounced

A consumer's change callback SHALL run once, 150 ms after the last of a burst of changes, and SHALL
NOT run after the consumer ended its subscription.

#### Scenario: Burst of changes

- **WHEN** five changes arrive within 100 ms
- **THEN** the change callback runs once, 150 ms after the fifth

#### Scenario: Subscription ends during the debounce

- **WHEN** a change arrives and the consumer ends its subscription within 150 ms
- **THEN** the change callback does not run

### Requirement: Consumers refetch whenever the channel subscribes

A consumer's subscribed callback SHALL run each time its channel reaches the subscribed state (the
first time, after a rejoin and after a resume), so the consumer's baseline is fetched after the
channel listens and no change between the two is lost. A consumer joining a channel that is already
subscribed SHALL get its subscribed callback at once.

#### Scenario: Rejoin after a dropped connection

- **WHEN** a channel's connection drops and the channel subscribes again
- **THEN** every consumer of the channel refetches

#### Scenario: Joining a subscribed channel

- **WHEN** a consumer subscribes to a topic whose channel is already subscribed
- **THEN** its subscribed callback runs without waiting for another subscribe

#### Scenario: Session confirmed after an offline launch

- **WHEN** the app runs on an unverified session and the session is then confirmed
- **THEN** every consumer of a subscribed channel refetches

### Requirement: Channels pause in the background

Channels SHALL close when the app moves to the background (on web: when the page is hidden) and
SHALL reopen when it becomes active again, which refetches through the subscribed callbacks. Brief
interruptions that leave the app visible SHALL NOT close them.

#### Scenario: App in the background

- **WHEN** the app moves to the background with open channels
- **THEN** every channel is closed, and the consumers stay registered

#### Scenario: App back in the foreground

- **WHEN** the app becomes active again
- **THEN** the channels reopen and their consumers refetch once they are subscribed

#### Scenario: Back after the access token expired

- **WHEN** the app becomes active after more than an hour in the background
- **THEN** the channels reopen with a refreshed access token, not the expired one

#### Scenario: Control Center

- **WHEN** the user pulls down Control Center or opens the app switcher and returns
- **THEN** the channels stay open

### Requirement: Channels use the current access token

Open channels SHALL authorize with the session's current access token, also after the token is
refreshed.

#### Scenario: Token refreshed while a channel is open

- **WHEN** the access token is refreshed
- **THEN** open channels use the new token without being reopened by the app

### Requirement: Realtime never dispatches notifications

Realtime callbacks SHALL only update what the app shows. They SHALL NOT send, record or display
notifications.

#### Scenario: Change on a friend's tour

- **WHEN** a Realtime change arrives for a friend's tour
- **THEN** the app refetches and shows the change, and no notification is sent or shown because of
  it
