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
   - **iOS:** the default job is an unsigned compile check; an installable
     `.ipa` needs signing (below).

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

To produce an App Store `.ipa` in CI, add these GitHub repo secrets
(Settings → Secrets and variables → Actions), then uncomment the
`archive-and-export` job in `.github/workflows/ios.yml`:

- `BUILD_CERT_P12_BASE64` — your Apple distribution cert (.p12), base64-encoded
- `P12_PASSWORD` — the .p12 password
- `PROVISIONING_PROFILE_BASE64` — the distribution provisioning profile, base64

Exporting the cert/profile is the one step that's smoothest on a Mac (we have
Xcode 26 here). Alternatively, services like **EAS Build** or **Codemagic** can
manage iOS signing entirely in the cloud if you'd rather avoid the Mac step.

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
