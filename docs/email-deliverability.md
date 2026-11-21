---
title: Email deliverability
description: DNS and provider checklist so confirmation and reset emails reach the inbox.
---

# Email deliverability

Transactional mail (account confirmation, password reset, security notices) is sent by the API
through SMTP (`SMTP_*`, `EMAIL_FROM`, optional `EMAIL_REPLY_TO`). Whether it reaches the inbox is
mostly decided by DNS and the sending provider, not by the application.

## What the application does

- Every message carries a **plain-text part** next to the HTML part.
- Messages are marked `Auto-Submitted: auto-generated` and may carry a `Reply-To`
  (`EMAIL_REPLY_TO`).
- `Message-ID` is generated on the domain of `EMAIL_FROM`.

## Checklist for the maintainer

1. **Use a transactional provider** (for example Postmark, Amazon SES, Resend or Brevo) instead of
   a shared or self-hosted server, and point `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and
   `SMTP_PASS` at it.
2. **Authenticate the sending domain** at your DNS provider with the records the provider gives
   you:
   - SPF (`TXT`) including the provider
   - DKIM (`TXT`/`CNAME`, a signing key per provider)
   - DMARC (`TXT` at `_dmarc.<domain>`), start with `p=none` and an `rua=` report address, then
     move to `quarantine` once reports are clean
3. **Align domains.** Use one domain for `EMAIL_FROM` and the links in the mail
   (`FRONTEND_URL`), for example `LukiFitti <hello@luki-fitti.tony-luke.de>`. Mixed domains such
   as `lukifitti.app` in the sender and `tony-luke.de` in the links are penalised by spam filters.
4. **Reverse DNS / PTR** of the sending IP must match the sending host (a provider does this for
   you); check the IP is not on a blacklist (mxtoolbox.com).
5. **Verify.** Send a confirmation mail to mail-tester.com and to a Gmail address. In Gmail use
   _Show original_ and check that SPF, DKIM and DMARC all show `PASS`.

## Environment

| Variable         | Purpose                                                      |
| :--------------- | :----------------------------------------------------------- |
| `EMAIL_FROM`     | Sender, preferably `Name <address@your-domain>`              |
| `EMAIL_REPLY_TO` | Optional monitored address for replies (empty = no Reply-To) |
| `SMTP_*`         | Credentials of the transactional provider                    |
