# Project Z — iPhone app and TestFlight

Project Z is now an **iOS Capacitor project** with a working macOS cloud **Simulator build** and a manual **signed iPhone/TestFlight** workflow. The live website is a separate installable web app.

## Build status

- **Compiled on a hosted Mac for iOS Simulator:** yes. See GitHub Actions `Build Project Z for iOS Simulator`.
- **Signed iPhone IPA:** requires an authorized Apple Developer team and code signing. It is **not yet generated**.
- **Available through TestFlight:** requires Apple Developer/Apple App Store Connect setup, then an approved upload. **Not yet installed or verified on a physical iPhone.**
- **Public App Store release:** later phase, after device testing, cloud sign-in/privacy work, App Store materials, and review. This repository does not auto-release to the App Store.

The iPhone app is built from Z's actual static application files in `native-ios/www`, which are regenerated with `npm run prepare:web`. It is **not** a bookmark to the website. Web-based AI model loading still needs separate testing inside the iPhone app.

## Recommended: signed iPhone beta from an iPhone (no Mac needed)

A parent or other legally eligible adult must own/manage the Apple Developer membership while the intended app creator is below the legal age for enrollment.

1. Have the eligible adult enroll in the official Apple Developer Program using an account under their control: <https://developer.apple.com/programs/enroll/>. Apple charges a membership fee in eligible regions. Do not share their Apple password with anyone.
2. In the team's Apple Developer portal, register **App ID** `com.projectz.privateassistant`. If that identifier is unavailable, update **both** `native-ios/capacitor.config.json` and `codemagic.yaml` to the new owned ID before building.
3. Open <https://appstoreconnect.apple.com/> and create a new **iOS app record** with that exact bundle identifier (name **Z** or a permitted available app name). App Store Connect settings, age rating, privacy policy, and screenshots will need completion before public distribution.
4. Create a dedicated **App Store Connect API key** in *Users and Access → Integrations → App Store Connect API*, with the required App Manager-level access. Store the private **.p8** file in the account owner's secure storage, not in GitHub or chat.
5. Open <https://codemagic.io/>, connect **GitHub repository `jackbwe233/Project-z`** and select its `master` branch. Add a Developer Portal/App Store Connect integration with the exact name **`z_app_store`**; upload the API key **directly to Codemagic**. Codemagic uses it for Apple signing and upload.
6. In Codemagic's iOS signing identities, generate/fetch an **Apple Distribution certificate** and an **App Store provisioning profile** matching `com.projectz.privateassistant` using the connected Apple team. Use Codemagic's secure interface. Do **not** commit signing files to the public repository.
7. In Codemagic, scan the repository root **`codemagic.yaml`**, select workflow **Project Z iPhone beta (signed IPA)** and start a **manual build**.
8. If successful, Codemagic produces a **signed IPA** and uploads it to **App Store Connect**. The configuration does **not** automatically submit for App Store review or automatically invite TestFlight testers.
9. In App Store Connect → **TestFlight**, check that the build has finished processing. Configure **internal testing**, add authorized testers, and install through Apple's **TestFlight** app. External testers may require additional Apple beta review.

Codemagic reference: <https://docs.codemagic.io/yaml-code-signing/signing-ios/> and <https://docs.codemagic.io/yaml-publishing/app-store-connect/>.

**Security:** there are **no** passwords, Apple private keys, provisioning profiles, or signing certificates in this repository. Do not send these values to Z or ChatGPT. Give Codemagic access directly through its secure setup UI. Build workflows are manual so every paid cloud build and upload is deliberately initiated.

## Local Mac installation (optional)

From the project root:

```sh
cd native-ios
npm install
npm run ios:init
npm run ios:open
```

In Xcode, choose the App target, enable automatically managed signing, select a developer team, then Run on a connected device. For updated code:

```sh
cd native-ios
npm run ios:sync
npm run ios:open
```

A free Personal Team may allow temporary device testing, subject to Apple's signing limitations, but does **not** support public TestFlight/App Store distribution.

## Must-pass on-device testing before inviting people

- Open the installed **native** app and verify menus and controls clear the Dynamic Island and bottom indicator on iPhone 16/17.
- Enter chat, load the smallest model, send multiple prompts and confirm **readable answers**; restart the app and retest caching. Browser WebGPU, WKWebView and native permission behavior are not identical.
- Test keyboard focus, microphone, voice readback, file picker, notes, Personal, Research and Stock Workbench.
- Test switching between pages, backgrounding/restoring, offline startup, and exporting personal data.
- Verify account sign-up is genuinely connected to an auth service before advertising it. The account placeholder is not a real cross-device login until configured.
- Check Apple privacy and App Store review requirements. An app consisting only of a web wrapper may not be accepted without a useful mobile experience.

If local AI in WKWebView does not respond, **do not distribute it as a working AI app**. Repair the engine or deploy an authorized secure inference backend first.

## What exists now

- `native-ios/capacitor.config.json` — app identifier, name and native settings.
- `native-ios/scripts/prepare-web.mjs` — bundles Z's web code into the app.
- `native-ios/scripts/prepare-ios-release.sh` — installs Z icon and native voice permission descriptions.
- `.github/workflows/ios-simulator.yml` — builds an unsigned **Simulator-only** app in GitHub Actions.
- `codemagic.yaml` — builds and uploads a signed IPA **after an eligible Apple Developer team connects**.
