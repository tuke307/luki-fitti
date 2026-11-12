# Release flow

```
feature branch ──squash PR──▶ develop ──release PR (version bump)──▶ main
                                                              │
                                        tag.yaml on push to main ┘
                                              │  creates tag v<x.y.z>
                                              ▼
                            publish a GitHub release from the tag
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                       ▼
                  production.yaml                          app-store.yaml
             (builds + deploys to Coolify)          (archives + uploads to ASC)
```

- **Everyday work**: feature branches go into `develop` as squash PRs. Nothing deploys.
- **Release**: a release PR `develop` → `main` (merge commit, not squash) carries the version
  bump. CI's `version` job requires the version to be higher than the newest `v*` tag and, for
  minor and major releases, marketing screenshots generated for that `x.y`.
- **Tag**: on every push to `main`, `.github/workflows/tag.yaml` creates the annotated tag
  `v<version>` (e.g. `v1.0.1`). The tag alone deploys nothing — GITHUB_TOKEN pushes trigger no
  other workflows.
- **Deploy**: publishing a GitHub release from the tag (Releases → Draft new release → choose
  the existing tag → "Generate release notes" → Publish) starts `production.yaml` (web, API,
  email worker, db-migrate images → Coolify) and `app-store.yaml` (archive + upload to App
  Store Connect). Database migrations run in the `luki-fitti-db-migrate` container before the
  API starts. `workflow_dispatch` runs of either workflow work the same way when started from
  a tag — that is how you redeploy an old version: run `production.yaml` against the old tag.
- **TestFlight builds between releases**: `app-store.yaml` can also be run by hand from
  `develop` (`gh workflow run app-store.yaml --ref develop`) to push the next unreleased
  version to TestFlight.
- **Hotfix**: branch from `main`, PR back into `main` with a version bump
  (`yarn version:set`), then merge `main` back into `develop` afterwards.

> Since the first App Store release (1.0.0, November 2026), every iOS upload needs a new
> version. Once a version is released, App Store Connect closes it: new builds with that
> version are rejected and its builds can no longer be submitted for external TestFlight
> testing. Raise the version (`1.0.1` for fixes, `1.1.0` for features) in the release PR.
> Regenerate the marketing screenshots for minor and major releases only; patch releases
> (`x.y.Z`) reuse the screenshots of their `x.y`.

## 1. Bump the version

One version for all platforms, written everywhere by a single command:

```bash
yarn version:set 1.0.2      # writes package.json files, project.yml, LukiFittiKitVersion.swift
yarn version:check          # fails unless all locations agree (CI runs this on PRs to main)
```

`version:set` covers the `version` field of every workspace package.json (the web settings
footer reads it via `NEXT_PUBLIC_APP_VERSION`), `MARKETING_VERSION` in
`apps/apple/project.yml` and `LukiFittiKitVersion.current` in LukiFittiKit. It does not touch
`apps/apple/marketing/VERSION` — that file records which version the screenshots were
generated for (see below). The App Store workflow sets the iOS build number itself
(`GITHUB_RUN_NUMBER`); raise `CURRENT_PROJECT_VERSION` only for uploads straight from Xcode.

## 2. Regenerate the marketing screenshots

Required for minor and major releases (`1.1.0`, `2.0.0`), so the App Store listing and the
one-pager show the current UI. Patch releases (`1.0.1`) skip this step and keep the existing
images: `marketing:check` only compares major and minor version.

```bash
yarn workspace @luki-fitti/apple marketing:screenshots   # iPhone, iPad + Apple Watch simulators, EN + DE
yarn workspace @luki-fitti/apple marketing:check         # fails if the images are for an older x.y
```

This writes:

- `apps/apple/marketing/appstore/{en-US,de-DE}/<device>/` — App Store screenshots per device
  (`iphone-6.9` 1320×2868, `iphone-6.3` 1206×2622, `ipad-13` 2064×2752, `watch` 422×514)
- `apps/web/public/screens/{en,de}/` — images for the one-pager (`ipad/` holds the iPad hero)
- `apps/apple/marketing/VERSION` — the version the images belong to

Open a few images before committing. Captions live in `apps/apple/marketing/screenshots.json`;
change them there, never in the images.

### Device frames

The device bezels around the screenshots are Apple's PNGs from
[Apple Design Resources](https://developer.apple.com/design/resources/) (Product Bezels). Apple
doesn't allow redistributing them, so `apps/apple/marketing/frames/` is gitignored and every
machine that composes screenshots needs them once:

| File in `apps/apple/marketing/frames/` | Source DMG                           | PNG to copy                    |
| :------------------------------------- | :----------------------------------- | :----------------------------- |
| `iphone-17-pro-max.png`                | `Bezel-iPhone-17.dmg`                | an iPhone 17 Pro Max, portrait |
| `watch-ultra.png`                      | `Bezel-Apple-Watch-Ultra-3-2025.dmg` | an Apple Watch Ultra, portrait |
| `ipad-pro-13.png` (optional)           | the iPad Pro 13″ bezel DMG           | an iPad Pro 13″, portrait      |

Open the DMG, copy the PNG and rename it as shown. The frame must be portrait with a
transparent screen area; `compose-marketing.mjs` finds the screen cutout itself. Without a
frame the script prints `warn: no … frame` and falls back to a rounded screenshot (iPhone,
Watch) or a drawn graphite bezel (iPad, the current default).

`APP_STORE_ID` and `APP_STORE_URL` are constants in `apps/web/lib/site/config.ts`.

## 3. Check

```bash
yarn version:check
yarn lint
yarn test
yarn workspace @luki-fitti/apple catalog:check
yarn workspace @luki-fitti/apple marketing:check
```

## 4. Merge the release PR to `main`

Open the release PR `develop` → `main` with the version bump (and, for minor and major
releases, the regenerated screenshots) and merge it with a **merge commit** (not squash — it keeps `develop` and `main` aligned).
`tag.yaml` then creates the `v<version>` tag automatically.

## 5. Publish the GitHub release

Releases → Draft new release → choose the tag `tag.yaml` just created → "Generate release
notes" → Publish. This starts `production.yaml` and `app-store.yaml`; check the version footer
in web settings after the deploy.

## 6. iOS and watchOS

1. Publishing the release triggers the App Store workflow: it verifies the tag matches
   `MARKETING_VERSION`, archives the `LukiFittiIOS` scheme and uploads it to App Store
   Connect; the watch app ships inside it. Manual runs work from a tag (deploy that version)
   or from `develop` (TestFlight build of the next unreleased version), with `-f upload=false`
   to only check signing. Setup and secrets are described in
   [app-store-release.md](app-store-release.md).
2. In App Store Connect: add the build to TestFlight, and for an App Store release upload the
   screenshots from `apps/apple/marketing/appstore/` (English and German) and write the release
   notes.
