## Purpose

Remind the people on a planned tour shortly before it, so they can check conditions, gear and partners in time.

## Requirements

### Requirement: Reminder five days before a planned tour
Once a day the system SHALL record a reminder for every non-completed tour whose planned date is exactly five days later. Tours without a planned date, completed tours, and tours planned fewer than five days ahead SHALL NOT be reminded. Running the job again on the same day SHALL NOT record a second reminder for the same tour and date. A missed run SHALL NOT be caught up.

#### Scenario: Five days ahead
- **WHEN** a non-completed tour is planned for 2030-01-10 and the job runs on 2030-01-05
- **THEN** the reminder is recorded

#### Scenario: Planned at short notice
- **WHEN** a tour is created on 2030-01-07 for 2030-01-10
- **THEN** no reminder is recorded

#### Scenario: Completed early
- **WHEN** the tour is marked completed before the job runs
- **THEN** no reminder is recorded

#### Scenario: Date moved
- **WHEN** a reminded tour is moved to a date that is later five days away
- **THEN** a new reminder is recorded for the new date

#### Scenario: Job runs twice
- **WHEN** the daily job runs a second time on the same day
- **THEN** no further reminder is recorded

### Requirement: Reminder recipients
The owner SHALL always receive the reminder. Partners SHALL receive it only if they have an account, are friends of the owner, and the tour is visible to friends. A reminder SHALL have no actor.

#### Scenario: Friend partner
- **WHEN** the owner's friend A is a partner on a friends-visible tour
- **THEN** both owner and A are reminded

#### Scenario: Private tour
- **WHEN** the tour is private
- **THEN** only the owner is reminded

#### Scenario: Partner not a friend
- **WHEN** a partner has an account but is not the owner's friend
- **THEN** that partner is not reminded

### Requirement: Reminder delivery
Reminders SHALL be delivered under the `tour_reminders` notification type: recorded in the inbox always, and sent by push and email subject to the recipient's mutes, email channel and registered push devices like every other type.

#### Scenario: Muted reminders
- **WHEN** a recipient has muted `tour_reminders`
- **THEN** they get the inbox entry but no push or email
