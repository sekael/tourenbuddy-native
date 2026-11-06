## Purpose

Tell users once a week when friends they already share a plan with are free on days they are free too, so they can fix a date — without pinging them for every availability change.

## Requirements

### Requirement: Weekly summary on Monday morning
Every Monday morning the system SHALL record at most one availability summary per user covering that Monday through Sunday. A summary SHALL be recorded only if at least one eligible friend is available on a day in that week on which the user is available too. Availability from manual marks and calendar sync SHALL count alike. Running the job again in the same week SHALL NOT record a second summary.

#### Scenario: Overlap this week
- **WHEN** it is Monday, U is available on Thursday and eligible friend A is available on Thursday
- **THEN** U gets one summary naming A and listing Thursday

#### Scenario: No overlap
- **WHEN** no eligible friend is available on any of U's available days this week
- **THEN** U gets no summary

#### Scenario: Overlap outside the week
- **WHEN** the only overlap with an eligible friend is on next Tuesday
- **THEN** U gets no summary this Monday

#### Scenario: Job runs twice
- **WHEN** the Monday job runs a second time in the same week
- **THEN** no further summary is recorded

### Requirement: Only friends with a shared plan are eligible
A friend SHALL be eligible only if a non-completed tour visible to friends exists that one of the two owns and on which the other is a partner. The tour's planned date SHALL NOT matter. Private tours and tours owned by a third person SHALL NOT make a friend eligible.

#### Scenario: Partner on own tour
- **WHEN** U owns a non-completed friends-visible tour with A as partner and they overlap this week
- **THEN** A is eligible

#### Scenario: Partner on friend's tour
- **WHEN** A owns a non-completed friends-visible tour with U as partner and they overlap this week
- **THEN** A is eligible

#### Scenario: Private tour
- **WHEN** the only shared tour is private
- **THEN** A is not eligible

#### Scenario: Completed tour
- **WHEN** the only shared tour is completed
- **THEN** A is not eligible

#### Scenario: Friend without shared tour
- **WHEN** A is a friend with overlapping days but no shared tour
- **THEN** A is not eligible

### Requirement: Summary content
A summary SHALL list every eligible friend and every overlapping day of the week. It SHALL render the first friend's name and the number of further friends; names SHALL be resolved when displayed, not stored. A summary SHALL have no actor.

#### Scenario: Several friends
- **WHEN** A, B and C are eligible and overlap with U this week
- **THEN** U's single summary reads "A and 2 more" and lists the union of overlapping days

### Requirement: Summary delivery
Summaries SHALL be delivered under the `availability` notification type: recorded in the inbox always, and sent by push and email subject to the recipient's mutes, email channel and registered push devices like every other type.

#### Scenario: Muted availability
- **WHEN** U has muted `availability` and a summary is recorded
- **THEN** U gets the inbox entry but no push or email

### Requirement: Summaries expire with their week
The Monday job SHALL delete every summary of previous weeks, read or unread, before recording the new week's summaries.

#### Scenario: Next Monday
- **WHEN** the job runs on the following Monday
- **THEN** last week's summary is gone from U's inbox
