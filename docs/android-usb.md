# Run Lila as an Android app over USB

Lila now has a Capacitor Android project (`com.pocket.budget`). The debug APK
opens the existing React app in an Android WebView and talks to the laptop's
shared Nessie/SMS backend through `adb reverse`. No browser installation is needed.
This is a development build, not a Play Store release or an offline banking app.

## One-time laptop setup

```powershell
npm install
python scripts/download-android-tools.py
python scripts/download-android-tools.py --packages
python scripts/download-android-tools.py --gradle
python scripts/setup-android.py
```

Downloads are stored in ignored `.android-tools/`. The downloader verifies Google's
SDK checksum and Microsoft's Java 21 checksum. Setup installs platform 36, build
tools and ADB, and accepts the Android SDK licenses. No global Java settings change.
The parallel downloader is useful on slow networks; setup can also download the
archives itself if they are missing.

## Connect the phone

1. Settings → About phone → tap **Build number** seven times. On Samsung, look
   inside **Software information**.
2. Settings → Developer options → enable **USB debugging**.
3. Plug in a USB **data** cable, unlock the phone, and accept **Allow USB debugging**.
4. Check with `npm run android:devices`. It must say `device`, not `unauthorized`.
   If nothing appears, try another cable/USB port or the phone maker's Windows driver.

## Build and run

Keep the backend running in one terminal:

```powershell
npm run demo
```

In another terminal:

```powershell
npm run android:build
npm run android:run
```

The runner forwards port 3002 over USB, installs the APK, and launches Lila
already paired. The pairing code comes from ignored `.pocket/device-link.json`;
it is passed only to the debug activity at launch and is not embedded in the APK.
The API credentials remain on the laptop. Only `http://localhost:3002` is configured
in the development WebView. HTTP is enabled only in the debug manifest.

Keep the cable connected and the backend running. After restarting the backend,
rerun `npm run android:run` to pair again. After changing web UI code, run
`npm run build` and relaunch the app; after changing native code, rebuild the APK.
The browser Install Lila button and service worker are disabled in the native app.

APK location: `android/app/build/outputs/apk/debug/app-debug.apk`.
If Android Studio is installed, `npm run android:open` opens the native project.

For multiple phones, select a serial explicitly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1 run -Serial YOUR_SERIAL
```

## SMS

The app's backend connection uses USB. Bandwidth's inbound callbacks still need
the existing `ngrok http 3002` tunnel. Use the verified phone to text DINNER and
approve the returned YES code. See [the SMS rehearsal](phone-demo.md).

References: [Capacitor Android workflow](https://capacitorjs.com/docs/android),
[Android physical-device setup](https://developer.android.com/studio/run/device).
