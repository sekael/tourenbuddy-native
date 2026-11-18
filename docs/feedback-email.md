# The feedback@tourenbuddy.ch mailbox

The app, the store listings and the legal pages give `feedback@tourenbuddy.ch` as the contact. The
backend's abuse alerts are also sent from and to it (`MODERATION_EMAIL`). This page sets it up with
free services only: mail **arrives** through Cloudflare Email Routing and is forwarded to a mailbox
you already read. You **reply as** feedback@ through Brevo's free SMTP relay, which already sends
the app's emails.

```text
someone ──▶ feedback@tourenbuddy.ch ──(Cloudflare Email Routing, free)──▶ your mailbox
your mailbox ──(Send mail as, via Brevo SMTP, free 300/day)──▶ reply from feedback@tourenbuddy.ch
```

## What the domain has today

Checked on 2026-11-18 (`dig` or any DNS lookup shows the same):

| Record | Value | Meaning |
|---|---|---|
| NS | `arya.ns.cloudflare.com`, `bruce.ns.cloudflare.com` | DNS is on Cloudflare: Email Routing is available at no cost |
| MX | `mx1.hostinger.com` (5), `mx2.hostinger.com` (10) | Mail goes to Hostinger, probably the registrar's default. Without a Hostinger mailbox it is lost |
| TXT (SPF) | `v=spf1 include:_spf.mail.hostinger.com ~all` | Allows Hostinger to send for the domain |
| TXT | `brevo-code:…` | Brevo's domain check: keep |
| CNAME | `brevo1._domainkey` → `b1.tourenbuddy-ch.dkim.brevo.com` (and `brevo2`) | Brevo signs the app's mail (DKIM): keep |
| TXT `_dmarc` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` | DMARC in report-only mode: keep |

**Before you change anything:** log in to Hostinger (hPanel → Emails). If there is a mailbox for
tourenbuddy.ch that you use, stop here and decide whether to keep it (it is usually paid after a
trial). If there is none, the Hostinger MX and SPF entries are dead weight and go in step 1.

## 1. Receive: Cloudflare Email Routing

1. Cloudflare dashboard → `tourenbuddy.ch` → **Email** → **Email Routing** → **Get started**.
2. **Custom address:** `feedback`. **Action:** Send to an email. **Destination:** the mailbox you
   read (for example your personal address; see step 3 for the case where you want to reply as
   feedback@).
3. Cloudflare sends a verification mail to the destination: open it and confirm.
4. **Add records and enable.** Cloudflare offers to add its MX records (`route1/2/3.mx.cloudflare.net`)
   and an SPF record, and to **delete the existing Hostinger MX records**: accept. An address can
   only have one set of MX records.
5. **One SPF record only.** Afterwards, DNS → Records: if there are two TXT records starting with
   `v=spf1`, delete the Hostinger one so that only this remains:
   ```text
   v=spf1 include:_spf.mx.cloudflare.net ~all
   ```
   Brevo needs no SPF entry: it signs with its DKIM keys above, which is what DMARC checks.
6. Leave `brevo-code`, the `brevo1`/`brevo2._domainkey` CNAMEs and `_dmarc` as they are.
7. Optional: **Catch-all address** → Drop, so mail to unknown addresses at the domain is refused
   rather than forwarded.

**Check:** from another account, send a mail to `feedback@tourenbuddy.ch`. It arrives in the
destination mailbox within a minute. Email Routing → **Activity log** shows it as forwarded.

## 2. Make it a Brevo sender (abuse alerts)

The Worker's abuse alerts go out through Brevo from `MODERATION_EMAIL`, and Brevo only sends from
verified senders.

1. Brevo → **Senders, domains & dedicated IPs** → **Senders** → **Add a sender**:
   name `TourenBuddy`, email `feedback@tourenbuddy.ch`.
2. Brevo emails a confirmation code to that address: it arrives through step 1. Enter it.
3. Set the Worker secret if not done yet (`docs/publishing.md` and the go-live guide, phase 4):
   `npx wrangler secret put MODERATION_EMAIL` → `feedback@tourenbuddy.ch`.

## 3. Reply as feedback@ (optional, free)

Replies should come from `feedback@tourenbuddy.ch`, not from your private address. That needs a mail
client that can send through another server's SMTP:

- **Gmail (free):** works, see below. If you don't want to mix it with a private account, create a
  separate free Gmail account (for example `tourenbuddy.feedback@gmail.com`) and make it the Email
  Routing destination in step 1.
- **Proton Mail free:** can't (custom addresses and SMTP need a paid plan). Forwarding to Proton still
  works for reading; you then reply from your Proton address, which shows it to the sender.
- **Apple Mail / Thunderbird (free):** work too, with the same SMTP details as below.

Brevo SMTP key: Brevo → **SMTP & API** → **SMTP** → **Generate a new SMTP key**. Note the SMTP
server, the port and your **login** (it looks like `xxxxxx@smtp-brevo.com`), and the key (shown once).

Gmail:

1. Settings (gear) → **See all settings** → **Accounts and Import** → **Send mail as** → **Add
   another email address**.
2. Name `TourenBuddy`, email `feedback@tourenbuddy.ch`, keep **Treat as an alias** ticked → Next.
3. SMTP server `smtp-relay.brevo.com`, port `587`, username = the Brevo SMTP **login**, password =
   the **SMTP key**, **Secured connection using TLS** → Add account.
4. Gmail sends a confirmation code to `feedback@tourenbuddy.ch`. It arrives in the same inbox through
   Email Routing: enter the code.
5. Optional: under **When replying to a message**, choose **Reply from the same address the message
   was sent to**, so replies to feedback@ go out as feedback@ on their own.

**Check:** reply to the test mail from step 1, choosing `TourenBuddy <feedback@tourenbuddy.ch>` as
the sender. At the receiving end, "Show original" (Gmail) or the headers show `dkim=pass` for
`tourenbuddy.ch` and `dmarc=pass`. For a score, send one mail to the address
[mail-tester.com](https://www.mail-tester.com) gives you (free, a few tests a day).

## Limits of the free plans

- **Cloudflare Email Routing:** receive and forward only (it never sends), up to 200 rules and
  addresses, messages up to 25 MiB. Destinations must be verified.
- **Brevo free:** 300 emails a day across everything Brevo sends for TourenBuddy (sign-in codes,
  notifications, abuse alerts, your replies). If the app's own mail ever nears the limit, replies are
  the first thing to move elsewhere.
- **DMARC** stays at `p=none` (reports only). Once a few weeks of reports show only Brevo and
  Cloudflare sending as tourenbuddy.ch, you can tighten it to `p=quarantine`.

## Later

- `privacy@` or `support@`: add them as more custom addresses in step 1, same destination.
- If you ever move mail to a paid host, delete the Email Routing rules first, then set that host's MX
  and SPF.
