# Moderation

TourenBuddy shares content only between accepted friends: tours (names, notes, GPX, attachments),
availability and names. There is no public profile, feed or search. What one user can see of
another, they were let in to see. This keeps abuse rare, but App Review guideline 1.2 still asks
for a way to report, to block, and a timely response.

## What users can do

- **Block** anyone who reached them (a friend request, a friend, a contact linked to an account):
  the social cut is immediate and complete (`openspec/specs/user-blocks`).
- **Report** while blocking: "Also report this user" with an optional reason (`report_user`).
- **Write** to `feedback@tourenbuddy.ch` (in-app feedback, store listings).

## What reaches the operator

Every new or repeated report emails `MODERATION_EMAIL` (Worker secret) with the report id, both
accounts (name, email, id) and the reason (`/moderation/report`, change: add-native-backend). A
report of a deleted account names it as such; reports outlive both accounts, anonymized.

## Response

- **Target:** acknowledge and assess within **24 hours**.
- **Assess:** the reported content (ask the reporter when the reason is empty), earlier reports
  of the same account (`select * from abuse_reports where reported_user_id = '<id>'`).
- **Act**, by severity:
  1. Nothing to act on: note it, no reply needed (the reporter has already blocked).
  2. Clear violation (harassment, illegal content, spam): delete the offending content with the
     owner's consent or, failing that, ban the account (Supabase dashboard → Authentication →
     Users → Ban user) and tell its owner by email why.
  3. Illegal content: preserve evidence, ban, report to the authorities where required.
- **Record** the outcome in the email thread; nothing else stores decisions.

## Filtering

There is no automated filtering of free text or attachments. Content is visible only to people
the author accepted as friends, and every recipient can block and report. Revisit if TourenBuddy
ever shows content beyond accepted friends.
