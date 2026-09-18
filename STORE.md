# Phone and stores

Lazem is a **local-first PWA**. The free public app is:

https://marwasayedhashem.github.io/lazem/

## On a phone (free, no store)

**Android (Chrome):** open the link → menu → **Install app** / Add to Home screen.

**iPhone (Safari):** Share → **Add to Home Screen**.

That is a real home-screen app. Data stays on the phone. Apple and Google still charge if you want it **in** the stores:

| Store | Account fee | What you get |
|---|---|---|
| Google Play | **$25 once** | listing on the Play Store |
| Apple App Store | **$99 / year** + a Mac with Xcode | listing on the App Store |

Nobody can put an app on those stores for $0. The PWA above is the free path.

## Play Store (after the $25)

1. Install [Android Studio](https://developer.android.com/studio).
2. From this repo:

```bash
npm install
npx cap add android   # first time only
npx cap sync
npx cap open android
```

3. In Android Studio: Build → Generate Signed App Bundle (AAB).
4. Create a Play Console account, upload the AAB, use `static/privacy.html` as the privacy URL, and `static/icons/play-icon-1024.png` as the high-res icon.

Package id: `ae.lazem.app`

## App Store (after the $99)

```bash
npx cap add ios
npx cap sync
npx cap open ios
```

Sign with your Apple Developer team in Xcode, archive, upload to App Store Connect. Same privacy URL.

## Privacy

https://marwasayedhashem.github.io/lazem/privacy.html
