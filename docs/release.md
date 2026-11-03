# Release flow

Web, API and email worker deploy automatically: every push to `main` builds the changed images
and deploys them to Coolify (`.github/workflows/production.yaml`). Database migrations run in
the `luki-fitti-db-migrate` container before the API starts. The iOS and watchOS apps are
archived and uploaded by hand.

> Until the first App Store release the version stays at **1.0.0** (only `CURRENT_PROJECT_VERSION`
> goes up for TestFlight uploads). Until then, regenerate the marketing screenshots whenever the
> UI changes noticeably; from the first App Store release on, regenerate them with every
> version bump.

## 1. Bump the version

One version for all platforms:

| Where | Field |
| :-- | :-- |
| `apps/web/package.json` | `version` (shown in web settings) |
| `apps/apple/project.yml` | `MARKETING_VERSION` (same as web) and `CURRENT_PROJECT_VERSION` (+1 for every upload) |

## 2. Regenerate the marketing screenshots

Required for every version bump, so the App Store listing and the one-pager show the current UI.

```bash
yarn workspace @luki-fitti/apple marketing:screenshots   # iPhone 6.9" + Apple Watch simulators, EN + DE
yarn workspace @luki-fitti/apple marketing:check         # fails if the images are older than the version
```

This writes:

- `apps/apple/marketing/appstore/{en-US,de-DE}/` — App Store screenshots (1320×2868)
- `apps/web/public/screens/{en,de}/` — images for the one-pager
- `apps/apple/marketing/VERSION` — the version the images belong to

Open a few images before committing. Captions live in `apps/apple/marketing/screenshots.json`;
change them there, never in the images.

`TESTFLIGHT_URL` is a constant in `apps/web/lib/site/config.ts` — set it once the TestFlight/App Store link exists; no env var needed.

## 3. Check

```bash
yarn lint
yarn test
yarn workspace @luki-fitti/apple catalog:check
yarn workspace @luki-fitti/apple marketing:check
```

## 4. Merge to `main`

Open a PR with the version bump and the regenerated screenshots, merge it, and watch the
Production workflow. Check the version footer in web settings after the deploy.

## 5. iOS and watchOS

1. `cd apps/apple && xcodegen generate`
2. Archive the `LukiFittiIOS` scheme in Xcode (Release) and upload it to App Store Connect; the
   watch app ships inside it.
3. In App Store Connect: add the build to TestFlight, and for an App Store release upload the
   screenshots from `apps/apple/marketing/appstore/` (English and German) and write the release
   notes.
