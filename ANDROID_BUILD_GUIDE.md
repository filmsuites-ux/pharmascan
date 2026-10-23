# Complete Guide: Initializing Capacitor & Building Android APK for PharmaScan

This guide provides the exact step-by-step instructions to initialize a Capacitor project for this React pharmacy application, install all necessary native plugins (for file sharing, file system access, app updates, and camera bill scanning), and generate a signed Android APK.

---

## 1. Prerequisites on Your Local Machine

Make sure your development machine (Windows, macOS, or Linux) has:
1. **Node.js**: v18.0.0 or higher (`node -v`)
2. **Java Development Kit (JDK)**: JDK 17 or JDK 21 (`java -version`, `javac -version`)
3. **Android Studio**: Android Studio (Hedgehog, Iguana, Jellyfish, or newer) with:
   * Android SDK Platform 34 or 35
   * Android SDK Build-Tools 34.0.0+
   * Android SDK Command-line Tools

---

## 2. Step-by-Step Initialization & Plugin Installation

Open your terminal in the root directory of the project and execute the following commands:

### Step 2.1: Install Capacitor Core & CLI
```bash
npm install @capacitor/core
npm install -D @capacitor/cli @capacitor/android
```

### Step 2.2: Install the Required Native Plugins
Install the official Capacitor native plugins for file sharing, filesystem operations, app lifecycle/updates, and camera scanning:

```bash
# 1. Native Sharing (WhatsApp, Bluetooth, Quick Share, Email)
npm install @capacitor/share

# 2. File System Access (Saving PDFs, invoices, and exported APKs to device storage)
npm install @capacitor/filesystem

# 3. App Lifecycle & In-App Updates (Back button, app state, version check)
npm install @capacitor/app

# 4. Camera Hardware Access (High-resolution bill scanning)
npm install @capacitor/camera

# 5. Device Status Bar & Dialogs
npm install @capacitor/status-bar @capacitor/dialog
```

---

## 3. Configure `capacitor.config.ts`

Ensure your `capacitor.config.ts` in the project root includes the plugin definitions:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pharmascan.app',
  appName: 'PharmaScan',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    App: {},
    Share: {},
    Filesystem: {},
    Camera: {},
  },
};

export default config;
```

---

## 4. Build the Web Application Bundle

Compile the React TypeScript application into the `/dist` directory:

```bash
npm run build
```

Verify that `/dist` contains `index.html`, `manifest.webmanifest`, `icon.svg`, and the `assets/` folder.

---

## 5. Add Android Platform & Sync Plugins

Initialize the native Android project and sync all native plugins:

```bash
# Add the native Android wrapper (only needed once)
npx cap add android

# Sync web assets and native plugin bridges to Android
npx cap sync android
```

---

## 6. Configure Android Native Permissions

Open `android/app/src/main/AndroidManifest.xml` and ensure the following permissions are present inside the `<manifest>` tag:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Network Access for Cloud Sync & OCR OCR APIs -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Camera Access for Bill Scanner -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />

    <!-- Storage Permissions for Bill Photos, Invoices, and APK Sharing -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">
        ...
    </application>
</manifest>
```

---

## 7. Compile the Android APK

### Option A: Compile Debug APK (Immediate Testing on Phone)

```bash
cd android
./gradlew assembleDebug
```
*(On Windows Command Prompt: `gradlew.bat assembleDebug`)*

**Output Path for Debug APK:**
```text
android/app/build/outputs/apk/debug/app-debug.apk
```

---

### Option B: Compile Signed Release APK (For Distribution & WhatsApp Sharing)

#### Step 7.1: Build Unsigned Release APK
```bash
cd android
./gradlew assembleRelease
```
*(On Windows: `gradlew.bat assembleRelease`)*

**Output Path for Unsigned Release APK:**
```text
android/app/build/outputs/apk/release/app-release-unsigned.apk
```

#### Step 7.2: Generate a Signing Keystore (One-Time Setup)
```bash
keytool -genkey -v -keystore pharmascan-release.keystore -alias pharmascan -keyalg RSA -keysize 2048 -validity 10000
```
*(Follow the prompts to enter a password and your organization details)*.

#### Step 7.3: Align and Sign the APK
```bash
# 1. Align the zip archive (from your Android SDK build-tools folder)
zipalign -v -p 4 android/app/build/outputs/apk/release/app-release-unsigned.apk android/app/build/outputs/apk/release/PharmaScan-aligned.apk

# 2. Sign with your keystore
apksigner sign --ks pharmascan-release.keystore --out android/app/build/outputs/apk/release/PharmaScan.apk android/app/build/outputs/apk/release/PharmaScan-aligned.apk
```

**Final Signed Installable APK Path:**
```text
android/app/build/outputs/apk/release/PharmaScan.apk
```

---

## 8. Sharing the APK via WhatsApp & Bluetooth

1. Copy `PharmaScan.apk` to your phone via USB cable or Google Drive.
2. In WhatsApp: Open any chat > Tap the **Attachment (Paperclip)** icon > Choose **Document** > Select `PharmaScan.apk` > Tap **Send**.
3. Or inside the PharmaScan web app: Go to **"Download & Share APK"** > Tab 1 > Click **"Host Your Compiled APK"** to upload `PharmaScan.apk`. Once uploaded, anyone using the app can click **"Share via WhatsApp"** or **"Bluetooth / Quick Share"** directly from their browser!
