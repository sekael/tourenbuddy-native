# OTP and email autofill

Investigation for [#261](https://github.com/sekael/tourenbuddy/issues/261): can the
emailed verification code auto-fill instead of forcing an app-switch and copy-paste, and
does email autofill / alias creation need special configuration?

**Short answer:** yes, but on exactly one platform combination — iOS/macOS Safari with the
mail read in **Apple Mail**. That path is **confirmed working on a real device** after the
email templates were reworded to fit Apple's body heuristic. Everywhere else it is **not
implementable at all**: Android and desktop have no API for it, and a code read in Proton
Mail / Gmail / Outlook is invisible to the OS scanner regardless of wording. The markup was
already correct before this change; the email body was the part that mattered.

## Platform support matrix

| Platform                                                                      | Emailed-code autofill | Mechanism                                                                                                               |
| ----------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| iOS 16+ / iPadOS 16+ Safari, macOS 13+ Safari, **reading mail in Apple Mail** | **Yes — verified**    | The OS scans incoming Mail for a code and offers it above the keyboard on a field marked `autocomplete="one-time-code"` |
| Android / Chrome                                                              | **No**                | WebOTP is the only API, and it does not accept email                                                                    |
| Desktop Chrome / Edge / Firefox                                               | **No**                | No API exists                                                                                                           |
| Any platform, mail read in Gmail / Proton Mail / Outlook                      | **No — verified**     | Third-party mail apps are sandboxed; only Apple Mail's store feeds the iOS scanner                                      |

Both inputs already carry the attribute the platform documentation asks for:

| Field | Location                                                   | Attributes                                                                            |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Email | `src/features/auth/presentation/pages/home-page.vue`       | `type="email"`, `autocomplete="email"`, `name="email"`, `required`                    |
| Code  | `src/features/auth/presentation/pages/verify-otp-page.vue` | `type="text"`, `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="6"` |

## Why Android and desktop cannot do this

The WebOTP API is the only browser mechanism for programmatic one-time-code retrieval:

```js
navigator.credentials.get({ otp: { transport: ['sms'] } })
```

`transport` accepts **`'sms'` and nothing else**. There is no `'email'` transport. This is
a limitation of the API surface, not something this app has failed to wire up — no amount
of frontend work makes emailed-code autofill possible on Android or on any desktop
browser.

> If you are re-reading this because it looks like an obvious gap: it is not a gap. Do not
> re-open this investigation without first checking whether the WebOTP spec has gained an
> email transport. As of this writing it has not.

The only route to WebOTP would be delivering the code by **SMS**, which is a separate
product decision with cost and phone-number-collection implications far beyond #261.

## What Apple's Mail heuristic needs

Apple's detector is undocumented and adjusted between OS releases, but it keys off the
email body, not the markup. It wants:

- a 6-digit token,
- adjacent to wording like _code_, _verification code_, _security code_, or _one-time
  code_, in the subject or near the token in the body,
- with as few competing numbers nearby as possible (dates, prices, order numbers, phone
  numbers, and long unsubscribe URLs all reduce confidence).

**Correction to an earlier draft of this doc:** the body source _is_ in this repository,
at `services/email-hook/templates/otp_{en,de}.{txt,html}`. It is a copy-paste source, not
an auto-synced one — Brevo has no API deploy hook here (see `SETUP-NOTIFICATIONS.md`), so
editing the repo file changes nothing in production until someone pastes it into the Brevo
template editor. The delivery path:

```
signInWithOtp (src/features/auth/presentation/stores/auth-store.ts)
  → Supabase send-email hook
    → services/email-hook/src/index.ts   (posts { otp, email } to Brevo)
      → Brevo hosted template (env: BREVO_TEMPLATE_EN / BREVO_TEMPLATE_DE)
        ← pasted by hand from services/email-hook/templates/otp_*.{txt,html}
```

The Worker only passes the token through; the wording lives in the repo templates. All
four (`otp_en.txt`, `otp_en.html`, `otp_de.txt`, `otp_de.html`) were reworded for the Apple
heuristic in 2.3, with the code appearing **exactly once** — no duplicated code text, only
the surrounding sentence changed:

- The lead-in now ends right where the code appears, so the word "code"/"Code" sits
  immediately before it in reading order: `"Your TourenBuddy verification code is:"` /
  `"Dein TourenBuddy-Code lautet:"`, then the code (the plain-text token on its own line in
  `.txt`; the existing large styled `<span class="code">` in `.html` — unchanged design,
  just no longer preceded by a paragraph that never says "code" until after it).
- The `60 minutes` / `60 Minuten` validity numeral — a second digit run near the code — was
  reworded to `one hour` / `eine Stunde` to remove a competing number from the heuristic's
  scan window.

An earlier draft of this edit also repeated the code as bold inline text right before the
styled block, on the theory that same-sentence adjacency is a stronger signal than
same-paragraph adjacency. Reverted: it left two visually different renderings of the same
6-digit number a few lines apart, which reads as a mistake to anyone who doesn't know why
it's there. Word-immediately-before-code in DOM order is very likely sufficient on its own;
the device test in 6.2 is what actually confirms it, not further wording debate.

**Both done:** the updated files were pasted into the live Brevo templates and verified on
a physical iOS device (see "Device test results"). Note for future edits — this paste step
has no git-driven deploy and no rollback, so a repo-only change to these templates silently
does nothing in production until someone repeats it.

## Password managers and email aliases

`autocomplete="email"` plus a `name` attribute is the entire markup contract. Field
classifiers in Proton Pass, 1Password, and Bitwarden score several attributes together;
`autocomplete` is the strongest signal and `name` reinforces it. Both are present.

The OTP field deliberately has **no `name` attribute** — a one-time code is not a
credential a password manager should offer to store.

### Alias creation cannot be requested from markup

Alias offers (Proton Pass hide-my-email, iCloud Hide My Email) fire when a manager
classifies a form as a **signup**. Our sign-in form is signup and login _simultaneously_:
one email field, one button, one endpoint, and Supabase provisions an account for an
unseen address. There is no attribute that declares that intent, and
`autocomplete="new-password"`-style signup hints have no email equivalent.

This is a genuine limitation, not something left undone. Aliases work fine when the user
creates one themselves; we simply cannot prompt for it.

## Known sharp edge: a fresh alias per sign-in creates a new empty account

`signInWithOtp` in `src/features/auth/presentation/stores/auth-store.ts` passes no
`shouldCreateUser` option, so it defaults to `true`. Every previously unseen address
provisions a new account.

A user who mints a **fresh alias on each sign-in** therefore lands in a brand-new, empty
account — no error, no warning. To them it looks like their tours were deleted.

This is **knowingly not fixed** here. Fixing it means deciding signup-vs-login semantics
(a distinct "create account" path, or `shouldCreateUser: false` on login with a
user-not-found branch), which is auth-flow work with its own edge cases and deserves its
own change. The risk was judged low because password managers default to one alias _per
site_, not per login. If this is ever reported in the wild, this section is the cause.

## Rejected options

### Magic link

Rejected. The project already shipped magic links and removed them — see
`openspec/specs/auth/spec.md` ("Magic links break the installed-PWA experience"): the link
always opens in the system browser rather than the standalone PWA window, stranding the
user outside the app mid-sign-in. That failure is structural and would return with the
link.

Two independent objections also stand:

- Corporate and scanner-equipped mail providers fetch links on delivery, burning a
  single-use token before the user clicks.
- A link breaks the cross-device case (read mail on the phone, sign in on the laptop),
  which a typed code handles natively.

### SMS delivery

Rejected for this change. It would make WebOTP available on Android, but it is a product
decision about cost and collecting phone numbers, not an autofill fix.

### One box per digit

Rejected. A single field is what iOS autofill and the OS clipboard suggestion both target
most reliably; split fields regularly defeat both.

## What was changed instead

Friction that _is_ fixable on every platform:

- The OTP field normalizes its value to digits and truncates to six on **every** change —
  not just on paste, because autofill and clipboard suggestions never fire a paste event.
  A code arriving as `123 456` or with a trailing newline is accepted.
- Verification submits automatically once six digits are present, so autofill and paste
  do not still require hunting for a button.
- The OTP email templates (`services/email-hook/templates/otp_{en,de}.{txt,html}`) were
  reworded to fit Apple's Mail heuristic: the sentence introducing the code now ends
  immediately before it, so "code"/"Code" is the last word read before the digits, and the
  `60 minutes` numeral was reworded to `one hour` so it stops competing with the code as a
  candidate number. The code itself still appears exactly once, at its original size. Live
  in Brevo and **verified working in Apple Mail** — see "Device test results" below.

## Device test results

Apple's heuristic can only be verified on hardware. Record every attempt here — **a
negative result is the valuable output**, because it stops the next person theorising.

| Date       | Mail client     | Reworded template live? | Code offered?   |
| ---------- | --------------- | ----------------------- | --------------- |
| 2026-08-24 | **Apple Mail**  | Yes                     | **Yes** — works |
| 2026-08-24 | **Proton Mail** | Yes                     | **No** — cannot |

**Apple Mail: confirmed working.** Safari offered the code above the keyboard on the
verification page, and combined with the auto-submit below it, signing in costs one tap.
This is the acceptance evidence for #261 and it confirms the reworded templates clear
Apple's heuristic.

**Proton Mail: confirmed not working, and not fixable.** Proton's iOS app is a sandboxed
third-party app; Apple's scanner reads the **Mail** app's message store and never sees a
body sitting in Proton's own database. No template wording changes this — the text is not
being read. Proton exposes IMAP only via Proton Mail Bridge, which is desktop-only and
cannot back the iOS Mail app, so there is no configuration in which a Proton mailbox
reaches this feature on iPhone.

> Do not attempt to "fix" the Proton case by editing the templates. The failure is upstream
> of the wording. The same applies to Gmail's and Outlook's own iOS apps.
