# Native apps (iOS + Android) via Capacitor

Monolito's web game is wrapped into native apps with
[Capacitor](https://capacitorjs.com). The web app and PWA are untouched — the
native shell just loads the same files. Everything here is designed so you can
**finish and ship from your phone** once it's pushed to GitHub.

## How it's wired

- `capacitor.config.json` — app id `com.spencersearle.monolito`, name `Monolito`,
  `webDir: www`.
- `scripts/build-web.mjs` (`npm run build:web`) — copies only the runtime web
  assets into `www/`, the folder Capacitor bundles. `node_modules/`, `.git/`,
  tests, docs, and the native projects are kept out of the app.
- `android/` and `ios/` — the native projects (committed). Generated web assets
  inside them are gitignored and recreated by `cap sync`.
- `.github/workflows/android.yml` / `ios.yml` — **cloud builds on GitHub's
  servers**, so your computer can be off.

## Build from your phone

Once this is pushed to GitHub:

1. **GitHub mobile app** → repo → **Actions** tab → pick *Android build* or
   *iOS build* → **Run workflow**. (Or `gh workflow run "Android build"`.)
2. When it finishes, download the artifact:
   - **Android:** `android-builds` → a **debug APK** you can install on an
     Android phone, plus a **release AAB** for the Play Store.
   - **iOS:** the default job is an unsigned compile check. The signed
     `archive-and-export` job (which produces an uploadable `.ipa`) is wired up
     and ready — it stays dormant until you add the signing secrets below.

Pushing to `main` also kicks off the Android build automatically.

## What still needs a one-time setup (and where)

These need a human + an account, so they can't be fully automated:

| Step | Account / cost | Can be done on phone? |
|---|---|---|
| Apple Developer enrollment | Apple ID, **$99/yr** | Yes (developer.apple.com) |
| Google Play Console | Google acct, **$25 once** | Yes (play.google.com/console) |
| iOS signing certificate + provisioning profile | via Apple account | Easier on a Mac once; can be cloud-managed |
| Android release signing keystore | self-generated | Generated once, stored as a secret |
| Store listings (icon, screenshots, text) | — | Yes, in the web consoles |

### iOS signing (the only Mac-friendly part)

The signed `archive-and-export` job in `.github/workflows/ios.yml` is already
written — **no code to uncomment**. It stays skipped until you flip a switch and
add the signing secrets, so the repo is safe to leave as-is until you enroll.

To turn it on (Settings → Secrets and variables → Actions):

**1. Add these repository *secrets*:**

| Secret | What it is |
|---|---|
| `BUILD_CERT_P12_BASE64` | your Apple **Distribution** certificate (`.p12`), base64-encoded |
| `P12_PASSWORD` | the password you set when exporting the `.p12` |
| `PROVISIONING_PROFILE_BASE64` | the App Store provisioning profile, base64-encoded |
| `APPLE_TEAM_ID` | your 10-character Team ID (App Store Connect → Membership) |

Base64-encode a file with: `base64 -i cert.p12 | pbcopy`

**2. Add this repository *variable* (Variables tab, not Secrets):**

- `IOS_SIGNING_READY` = `true`

That variable is the gate — the job self-skips while it's absent, so adding the
secrets one at a time won't trigger half-configured runs. Flip it to `true` once
all four secrets are in place.

The bundle id (`com.spencersearle.monolito`), export method (`app-store-connect`),
and export-compliance flag (`ITSAppUsesNonExemptEncryption = false`, already set
in `Info.plist`) are all handled for you. The job imports the cert into a
throwaway keychain, installs the profile, archives Release, exports the `.ipa`,
and uploads it as the `ios-ipa` artifact.

Exporting the cert/profile is smoothest once on a Mac (we have Xcode 26 here).
Alternatively, **EAS Build** or **Codemagic** can manage iOS signing entirely in
the cloud if you'd rather skip the Mac step.

**Optional — push straight to TestFlight:** the workflow has a commented
`Upload to TestFlight` step. Enable it (and skip the manual `.ipa` download) by
adding an App Store Connect API key as three more secrets — `ASC_KEY_ID`,
`ASC_ISSUER_ID`, `ASC_API_KEY_P8_BASE64` — then uncommenting that step.

### Android release signing

Generate a keystore once and store it + credentials as secrets; the workflow
then signs the AAB for Play. (Until then, the debug APK is fine for testing.)

## Local builds (optional — not needed for the phone workflow)

If you ever build on this Mac instead of CI:

```sh
npm install
npm run build:web
npx cap sync
npx cap open ios       # Xcode
npx cap open android   # needs Android Studio + JDK (not currently installed)
```

## Updating the app

The native apps bundle the web files, so after changing any game code:

```sh
npm run build:web && npx cap sync
```

…then rebuild (locally or via CI). For the **web/PWA** nothing changes — it
still runs from the repo root, and you bump `CACHE_VERSION` in `sw.js`.
