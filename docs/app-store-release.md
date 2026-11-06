# App Store release

How the iOS app (with its watch app and widgets) gets from this repository to App Store Connect.
For the overall release flow, see [release.md](release.md).

> This repository is public. Team ID, key IDs, certificates, keys, profiles and passwords belong
> in GitHub secrets, never in this file, in a commit or in a workflow log.

## Identifiers

Registered in the [Apple Developer portal](https://developer.apple.com/account/resources/identifiers/list).
The description is only an internal name and allows letters, numbers and spaces.

| Identifier                      | Description           | Capabilities                                  |
| :--                             | :--                   | :--                                           |
| `com.lukifitti.app`             | `LukiFitti iOS`       | HealthKit (Background Delivery), App Groups   |
| `com.lukifitti.app.watchkitapp` | `LukiFitti Watch`     | HealthKit (Background Delivery), App Groups   |
| `com.lukifitti.app.widgets`     | `LukiFitti Widgets`   | App Groups                                    |
| `group.com.lukifitti.shared`    | `LukiFitti App Group` | App Group, assigned to all three App IDs      |

The prefix and the App Group are set in `apps/apple/Config/Shared.xcconfig`. The bundle ID can't
change once the app exists in App Store Connect. `group.com.lukifitti.app` was not available, which
is why the App Group doesn't follow the bundle ID.

## App Store Connect

There is one app record, not three: the watch app and the widgets ship inside the iOS app.

| Field            | Value                              |
| :--              | :--                                |
| Platform         | iOS                                |
| Name             | `LukiFitti`                        |
| Primary language | German                             |
| Bundle ID        | `com.lukifitti.app`                |
| SKU              | `lukifitti` (can't change later)   |
| User access      | Full Access                        |

## Signing setup

The pipeline signs manually, with one certificate and three provisioning profiles. Create them once
and renew them yearly.

### 1. Distribution certificate

1. Keychain Access → Certificate Assistant → **Request a Certificate From a Certificate Authority**,
   saved to disk.
2. Portal → Certificates → **+** → **Apple Distribution**, then upload the request and download the
   certificate.
3. Open the certificate to add it to your keychain. In **My Certificates**, export it with its
   private key as `.p12`, using a strong password.

### 2. Provisioning profiles

Portal → Profiles → **+** → **App Store Connect**. Create these after the App Group is assigned, and
select the certificate from step 1. The names must match exactly, because
`apps/apple/Config/AppStore.xcconfig` and `ExportOptions-AppStore.plist` refer to them:

| App ID                          | Profile name                  |
| :--                             | :--                           |
| `com.lukifitti.app`             | `LukiFitti iOS App Store`     |
| `com.lukifitti.app.watchkitapp` | `LukiFitti Watch App Store`   |
| `com.lukifitti.app.widgets`     | `LukiFitti Widgets App Store` |

### 3. App Store Connect API key

App Store Connect → Users and Access → Integrations → Team Keys → **+**, with the **App Manager**
role. The `.p8` file can be downloaded only once. Note the key ID and the issuer ID.

## GitHub secrets

The workflow needs these secrets:

| Secret                            | Content                                  |
| :--                               | :--                                      |
| `APPLE_TEAM_ID`                   | Team ID (portal → Membership)            |
| `APPLE_DISTRIBUTION_P12_BASE64`   | The `.p12` file, base64 encoded          |
| `APPLE_DISTRIBUTION_P12_PASSWORD` | Password of the `.p12` file              |
| `APPLE_PROFILE_IOS_BASE64`        | iOS profile, base64 encoded              |
| `APPLE_PROFILE_WATCH_BASE64`      | Watch profile, base64 encoded            |
| `APPLE_PROFILE_WIDGETS_BASE64`    | Widgets profile, base64 encoded          |
| `ASC_KEY_ID`                      | API key ID                               |
| `ASC_ISSUER_ID`                   | API issuer ID                            |
| `ASC_KEY_P8_BASE64`               | The `.p8` file, base64 encoded           |

Any collaborator on this repository can set them with `gh`. Run this in your own terminal. Values
entered at the prompt don't end up in the shell history, and the files are read directly:

```bash
gh secret set APPLE_TEAM_ID --repo tuke307/luki-fitti
gh secret set APPLE_DISTRIBUTION_P12_PASSWORD --repo tuke307/luki-fitti
gh secret set ASC_KEY_ID --repo tuke307/luki-fitti
gh secret set ASC_ISSUER_ID --repo tuke307/luki-fitti

base64 -i distribution.p12 | gh secret set APPLE_DISTRIBUTION_P12_BASE64 --repo tuke307/luki-fitti
base64 -i ios.mobileprovision | gh secret set APPLE_PROFILE_IOS_BASE64 --repo tuke307/luki-fitti
base64 -i watch.mobileprovision | gh secret set APPLE_PROFILE_WATCH_BASE64 --repo tuke307/luki-fitti
base64 -i widgets.mobileprovision | gh secret set APPLE_PROFILE_WIDGETS_BASE64 --repo tuke307/luki-fitti
base64 -i AuthKey.p8 | gh secret set ASC_KEY_P8_BASE64 --repo tuke307/luki-fitti
```

Keep the files in a password manager, outside this repository.

## Running the pipeline

`.github/workflows/app-store.yaml` runs by hand, from `main` only:

```bash
gh workflow run app-store.yaml --repo tuke307/luki-fitti --ref main -f upload=false
```

- With `upload=false` it only archives and exports, which checks the signing setup.
- With `upload=true` (the default) it also uploads the build to App Store Connect.

Version and build number:

- The version comes from `MARKETING_VERSION` in `apps/apple/project.yml`.
- The build number is the workflow's run number, so it goes up with every run. Re-running a run
  whose upload succeeded fails, because the number already exists. Start a new run instead.

After the upload, App Store Connect processes the build, and then it shows up under TestFlight.

## Before the first App Store submission

- Add `PrivacyInfo.xcprivacy`: the apps use `UserDefaults`, which Apple requires a declared reason
  for.
- Answer the encryption question for each build, or set `ITSAppUsesNonExemptEncryption` in
  `Info.plist` once the answer is clear.
- Fill in the App Store listing, App Privacy and the privacy policy URL. Screenshots are in
  `apps/apple/marketing/appstore/`.

## Security

- **Repo secrets:** Every workflow can read them, and anyone with write access can push a workflow.
  Keep the list of collaborators short. The repository owner can also move the secrets to the
  `app-store` environment and restrict it to `main` or require a reviewer. Only the owner can set
  environment secrets. The workflow needs no change for this.
- **Pull requests:** The workflow has no `pull_request` trigger, and forks don't get these secrets.
  Don't add `pull_request_target`.
- **Public logs:** GitHub masks secrets, but not their decoded content, so never print a decoded file.
  `xcodebuild` runs with `-quiet` to keep signing details out of the log.
- **Artifacts:** The workflow uploads none, because artifacts of a public repository are public too.
- **Actions:** Only `actions/checkout` is used, pinned to a commit. No third-party action sees the
  secrets.
- **Git:** `.gitignore` covers `*.p8`, `*.p12`, `*.cer`, `*.certSigningRequest`, `*.mobileprovision`
  and `apps/apple/Config/Local.xcconfig`.

If a key or certificate leaks, revoke it first (App Store Connect → Team Keys, portal →
Certificates), then create a new one and replace the secret. A secret in the git history stays
public even after the commit is removed.

## Yearly renewal

Certificate and profiles expire after one year, and profiles only work with the certificate they
were created for:

1. Create a new Apple Distribution certificate.
2. Regenerate all three profiles with the same names.
3. Replace `APPLE_DISTRIBUTION_P12_BASE64`, `APPLE_DISTRIBUTION_P12_PASSWORD` and the three
   `APPLE_PROFILE_*` secrets.

The API key doesn't expire. Revoke and replace it when someone with access to it leaves.

## Xcode version

The workflow pins Xcode through `DEVELOPER_DIR` on the `macos-26` runner. When Apple requires a newer
SDK, update that path and, if needed, `runs-on`. The installed versions are listed in the
[runner image readme](https://github.com/actions/runner-images/tree/main/images/macos).

Archiving on your own Mac requires the watchOS platform (Xcode → Settings → Components). Without it,
`xcodebuild` stops with `watchOS … must be installed in order to archive the scheme`.
