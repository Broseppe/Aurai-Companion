# Aurai Companion

A mobile-first fan companion for **Outward** with recipe lookup, alchemy/cooking references, an inventory-to-recipe matcher, concise field guides, saved recipes, and live search of the current Outward Wiki.

## Version 2.1

This release focuses on making the project feel like a real phone app and making installation possible without a PC.

- New custom Aurai compass icon and launch splash.
- Native-style five-tab bottom navigation.
- Live online Wiki Explorer using the Outward Wiki MediaWiki API with a direct-search fallback.
- Online/offline status.
- Install/app-info sheet with platform-aware instructions.
- PWA update notification and one-tap refresh when a new version is available.
- Improved recipe search, pantry matching, grouped ingredient counts, favourites and recipe sharing.
- Android WebView wrapper source included.
- GitHub Actions workflow builds an Android APK entirely in the cloud.
- GitHub Pages workflow hosts the PWA automatically.

The project deliberately does **not** ship a huge offline copy of the wiki. Only the compact quick-reference recipe data and guides are bundled; broader reference content is searched online.

## Phone-only installation

### Option A — PWA / home-screen app

Once the repository is on GitHub:

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, choose **GitHub Actions**.
3. Run the **Deploy Web App** workflow if it has not run automatically.
4. Open the resulting GitHub Pages address on your phone.
5. On Android Chrome, choose **Install app** / **Add to Home screen**. On iPhone Safari, use **Share → Add to Home Screen**.

After that, updates are deployed by pushing changes to `main`; the app detects a new PWA version and displays an **Update** button.

### Option B — Android APK, no PC or Android Studio

The repository contains an Android wrapper and `.github/workflows/build-android.yml`.

1. Put the project in a GitHub repository from your phone or through a connected GitHub integration.
2. Open **Actions → Build Android APK**.
3. Tap **Run workflow**. Pushing to `main` also starts the build automatically when app files change.
4. Open the finished workflow and download the **Aurai-Companion-Android** artifact.
5. Extract the artifact ZIP on the phone and tap `Aurai-Companion-Android.apk`.
6. Android may ask you to allow your browser or Files app to install unknown apps. Approve it only for the app you downloaded from your own repository.

The current workflow creates a debug-signed APK. It is suitable for personal sideloading. If this app is later distributed publicly, use a private release signing key stored in GitHub Actions Secrets and switch the workflow to a signed release build.

## Project structure

```text
Aurai Companion/
├── index.html
├── styles.css
├── app.js
├── data.js
├── sw.js
├── manifest.webmanifest
├── icon.svg
├── icon-192.png
├── icon-512.png
├── android/
│   └── app/...
└── .github/workflows/
    ├── build-android.yml
    └── pages.yml
```

## Wiki integration

Live search uses:

`https://outward.wiki.gg/api.php`

with MediaWiki search requests and `origin=*`. If the API request cannot be completed, the UI falls back to a normal Outward Wiki search page.

Wiki-derived pages remain on `outward.wiki.gg`; the app does not mirror the full wiki locally.

## Attribution

Aurai Companion is an unofficial fan-made utility and is not affiliated with Nine Dots Studio. Outward Wiki pages are linked to their original source. Wiki content is subject to the licensing and terms stated by the Outward Wiki/wiki.gg.
