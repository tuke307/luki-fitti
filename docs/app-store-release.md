# App Store release

How the iOS app (with its watch app and widgets) gets from this repository to App Store Connect.
For the overall release flow, see [release.md](release.md).

> This repository is public. Team ID, key IDs, certificates, keys, profiles and passwords belong
> in GitHub secrets, never in this file, in a commit or in a workflow log.

## Identifiers

Registered in the [Apple Developer portal](https://developer.apple.com/account/resources/identifiers/list).
The description is only an internal name and allows letters, numbers and spaces.

| Identifier                      | Description           | Capabilities                                |
| :------------------------------ | :-------------------- | :------------------------------------------ |
| `com.lukifitti.app`             | `LukiFitti iOS`       | HealthKit (Background Delivery), App Groups |
| `com.lukifitti.app.watchkitapp` | `LukiFitti Watch`     | HealthKit (Background Delivery), App Groups |
| `com.lukifitti.app.widgets`     | `LukiFitti Widgets`   | App Groups                                  |
| `group.com.lukifitti.shared`    | `LukiFitti App Group` | App Group, assigned to all three App IDs    |

The prefix and the App Group are set in `apps/apple/Config/Shared.xcconfig`. The bundle ID can't
change once the app exists in App Store Connect. `group.com.lukifitti.app` was not available, which
is why the App Group doesn't follow the bundle ID.

## App Store Connect

There is one app record, not three: the watch app and the widgets ship inside the iOS app.

| Field            | Value                            |
| :--------------- | :------------------------------- |
| Platform         | iOS                              |
| Name             | `LukiFitti`                      |
| Primary language | German                           |
| Bundle ID        | `com.lukifitti.app`              |
| SKU              | `lukifitti` (can't change later) |
| User access      | Full Access                      |

## Signing setup

The pipeline signs manually, with one certificate and three provisioning profiles. Create them once
and renew them yearly. Keep the files together in a folder outside this repository, under the file
names given below, because the commands in [GitHub secrets](#github-secrets) expect them.

### 1. Distribution certificate

The portal needs a certificate request from your Mac. Xcode creates it for you, which makes this the
shortest route:

1. Xcode → Settings → Apple Accounts (Accounts in older versions) → select the team → **Manage
   Certificates…**.
2. **+** → **Apple Distribution**. If the button is disabled, your account lacks the right to create
   distribution certificates, which takes the Account Holder or Admin role.
3. Right-click the new certificate → **Export Certificate**. Save it as `distribution.p12`, with a
   strong password. That password is the value of `APPLE_DISTRIBUTION_P12_PASSWORD`.

The new certificate then shows up in the portal as well.

Or with Keychain Access, which is in `/System/Library/CoreServices/Applications/` on current macOS:

1. Keychain Access → Certificate Assistant → **Request a Certificate From a Certificate Authority**,
   saved to disk.
2. Portal → Certificates → **+** → **Apple Distribution**, then upload the request and download the
   certificate.
3. Open the certificate to add it to your keychain. In **My Certificates**, export it with its
   private key as `distribution.p12`, using a strong password.

### 2. Provisioning profiles

Create these after the App Group is assigned. Repeat the steps for each row of the table:

1. [Portal → Profiles](https://developer.apple.com/account/resources/profiles/list) → **+** → under
   Distribution, **App Store Connect**.
2. Select the App ID.
3. Select the certificate from step 1. If there are several, take the one with the latest expiry
   date.
4. Enter the profile name exactly as shown, because `apps/apple/Config/AppStore.xcconfig` and
   `ExportOptions-AppStore.plist` refer to it.
5. **Generate**, download the file and rename it.

| App ID                          | Profile name                  | File name                 |
| :------------------------------ | :---------------------------- | :------------------------ |
| `com.lukifitti.app`             | `LukiFitti iOS App Store`     | `ios.mobileprovision`     |
| `com.lukifitti.app.watchkitapp` | `LukiFitti Watch App Store`   | `watch.mobileprovision`   |
| `com.lukifitti.app.widgets`     | `LukiFitti Widgets App Store` | `widgets.mobileprovision` |

### 3. App Store Connect API key

Open [Users and Access → Integrations → Team Keys](https://appstoreconnect.apple.com/access/integrations/api)
in App Store Connect. If it shows **Request Access**, the Account Holder has to confirm that first.

1. **+**, name the key `LukiFitti CI`, select the **App Manager** role, then **Generate**.
2. Download the key, which is possible only once. Rename `AuthKey_….p8` to `AuthKey.p8`.
3. Note two values from the same page: the **Key ID** in the key's row is `ASC_KEY_ID`, and the
   **Issuer ID** above the table is `ASC_ISSUER_ID`.

## GitHub secrets

The workflow needs these secrets:

| Secret                            | Content                         |
| :-------------------------------- | :------------------------------ |
| `APPLE_TEAM_ID`                   | Team ID (portal → Membership)   |
| `APPLE_DISTRIBUTION_P12_BASE64`   | The `.p12` file, base64 encoded |
| `APPLE_DISTRIBUTION_P12_PASSWORD` | Password of the `.p12` file     |
| `APPLE_PROFILE_IOS_BASE64`        | iOS profile, base64 encoded     |
| `APPLE_PROFILE_WATCH_BASE64`      | Watch profile, base64 encoded   |
| `APPLE_PROFILE_WIDGETS_BASE64`    | Widgets profile, base64 encoded |
| `ASC_KEY_ID`                      | API key ID                      |
| `ASC_ISSUER_ID`                   | API issuer ID                   |
| `ASC_KEY_P8_BASE64`               | The `.p8` file, base64 encoded  |

Any collaborator on this repository can set them with `gh`. Run this in your own terminal, from the
folder with the files. Values entered at the prompt don't end up in the shell history, and the files
are read directly:

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

Check that all nine are listed. This shows only the names, because GitHub doesn't reveal the values:

```bash
gh secret list --repo tuke307/luki-fitti
```

Then move the files to a password manager and delete the folder.

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

- Each app target ships a `PrivacyInfo.xcprivacy` (`UserDefaults` reason CA92.1). The collected
  data types in it must match the App Privacy answers in App Store Connect.
  `ITSAppUsesNonExemptEncryption` is `false`, because the apps only use HTTPS and system
  encryption.
- Fill in the App Store listing, App Privacy and the privacy policy URL. Screenshots are in
  `apps/apple/marketing/appstore/<locale>/<device>/`:

| App Store Connect slot                 | Folder       |
| :------------------------------------- | :----------- |
| iPhone "mittleres Display" (6.1″/6.3″) | `iphone-6.3` |
| iPhone "großes Display" (6.5″–6.9″)    | `iphone-6.9` |
| iPad 13″                               | `ipad-13`    |
| Apple Watch Ultra                      | `watch`      |

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
