# Possible features

Ideas that are decided in principle or parked for later — short and factual.

## Paid AI credits (deferred)

**Settled:** web checkout only, with Apple Pay through the browser. The iOS app shows the
balance but doesn't sell credits (Apple requires In-App Purchase for digital content). Runs
are billed against a platform OpenRouter key; a credit ledger tracks usage with a markup over
OpenRouter cost.

**Open:** who handles VAT (a Merchant of Record such as Paddle or Lemon Squeezy, versus
Stripe + Stripe Tax with our own OSS registration); what happens to bring-your-own-key and
admin-assigned keys once credits exist; consumer withdrawal consent for immediately
delivered digital content under German law.

## Self-hosted exercise photos

Catalog photos are currently hotlinked from `raw.githubusercontent.com` (free-exercise-db).
Mirror them into our own storage/CDN so we don't depend on the upstream repo.

## Pause-aware workout duration

The session DTO has no accumulated pause time, so finished durations include pauses (the
client's elapsed clock freezes while paused but jumps forward after resume). This needs a
schema field that tracks total paused time.
