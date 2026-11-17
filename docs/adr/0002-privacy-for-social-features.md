# 0002. Privacy for social features

- Status: Proposed (legal review pending)
- Date: 2026-11-13
- Deciders: Tony Meissner

## Context and problem statement

The social features of ADR 0001 introduce user-visible profiles, contact-based friend
discovery, push tokens and moderation data — all new personal-data processing that must be
reflected in the privacy policy (EN/DE) and the App Store privacy labels before 2.0.0
ships. This ADR records the chosen privacy posture and holds the draft policy wording until
legal review signs it off.

## Decision drivers

- GDPR: pick a defensible legal basis per processing purpose; minimise what leaves the
  device; be honest about pseudonymisation vs. anonymisation.
- Keep no data we do not need: nothing about non-users may be retained.
- Friends-only by default; leagues reveal handle, avatar and weekly points only.
- App Review guideline 1.2 requires report/block for UGC — reports are themselves data.

## Considered options

- **Contact matching:** upload address books — rejected (collects non-user data); hashed
  emails with discarded non-matches — chosen.
- **Hash scheme:** salted/HMAC hashes — rejected for matching (a salt we keep defeats the
  point; server-side pepper would still allow dictionary lookup by us anyway, since we
  already store every user's email); plain SHA-256, disclosed as pseudonymisation — chosen.
- **"Find me by email" default:** opt-in vs. default-on with a switch in onboarding —
  default-on chosen, open for legal review.
- **Report evidence:** keep reported profile snapshot vs. live lookup — snapshot chosen so
  the report survives later profile edits.

## Decision outcome

- Emails are normalised and SHA-256-hashed **on the device**; only hashes are transmitted.
  Non-matching hashes are discarded immediately — never stored, never logged, and no
  "your contact joined" notifications are sent (they would require keeping non-user
  hashes). Names and phone numbers never leave the device.
- Matching only returns users who opted into "Find me by email" (default on, explained in
  the onboarding sheet), are not blocked, and have a handle. Rate limits (2,000 hashes per
  request, 5 syncs/day) prevent account enumeration.
- Leagues show handle, avatar and weekly points — never workout contents. Display name and
  workout details are friends-only.
- Reports store a copy of the reported handle, name and photo at report time.
- Legal basis claimed: contract performance Art. 6(1)(b) GDPR for the social features;
  legitimate interest Art. 6(1)(f) for contact matching.
- Retention: social data lives as long as the account; account deletion removes photo,
  friendships, points, placements, device tokens and notifications, including reports.
- Push tokens (APNs/Web Push), locale and time zone are processed to deliver
  notifications; delivery goes through Apple or the browser's push service.

### Consequences

Good: nothing about non-users persists; the disclosure model is honest about the hash's
limits; blocking and "pause competing" give users real controls.

Bad: plain SHA-256 is reversible for known addresses — acceptable only because the server
already knows all user emails, and it must be stated plainly in the policy; default-on
discoverability may not survive legal review.

## Appendix: draft policy wording (pending legal review)

The draft EN/DE sections below go into `datenschutz`/`privacy` and the App Store privacy
labels once reviewed. They describe the profile data, friendships/reports, points and
rankings, push tokens (Art. 6(1)(b)); the contacts matching flow with on-device hashing,
immediate discard of non-matches and Art. 6(1)(f); and the retention rules above.

### Open points for the legal review

1. **Hash wording.** Unsalted SHA-256 of an email is matchable against known addresses —
   pseudonymisation, not anonymisation. Is "nicht umkehrbarer Prüfwert" acceptable, or must
   the text say "pseudonymisiert"?
2. **Legal basis for contact matching** (Art. 6(1)(f) for non-user contacts) and whether a
   balancing test on record or a DPIA is needed.
3. **Report retention.** Reports are deleted with either account; is a separate retention
   period needed for abuse cases?
4. **Default "Find me by email" = on** during onboarding: opt-out acceptable, or must it
   be opt-in?
5. **App Store privacy labels:** Contacts ("App Functionality", not linked, no tracking),
   User Content (photos), Identifiers (device token), Usage Data.

## Links

- ADR 0001 (social features 2.0)
