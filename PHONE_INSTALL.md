# Install Aurai Companion using only your phone

## First-time phone upload (no PC)

1. Create a GitHub repository for Aurai Companion. A public repository is the simplest option for GitHub Pages on GitHub Free.
2. Upload `aurai-companion-source.tar.gz` to the repository root.
3. In GitHub's web interface choose **Add file → Create new file** and name it `.github/workflows/bootstrap.yml`.
4. Paste the supplied `bootstrap.yml` contents and commit it to the default branch.
5. Open **Actions → Install Aurai Companion → Run workflow**.
6. When that run succeeds, refresh the repository. The complete web app, Android project, documentation and normal build workflows will be present.

## Recommended route: installable web app (PWA)

1. In the repository open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions → Deploy Web App → Run workflow**.
4. Open the Pages address shown by the successful deployment.
5. Android Chrome: **⋮ → Install app**. iPhone Safari: **Share → Add to Home Screen**.

This is the recommended route because app updates can be delivered without reinstalling an APK.

## Android APK route

1. Open **Actions → Build Android APK → Run workflow**.
2. When it finishes, open the successful run and download the **Aurai-Companion-Android** artifact.
3. Extract that downloaded artifact ZIP on Android.
4. Tap `Aurai-Companion-Android.apk` and follow Android's install prompt. Android may ask you to allow installs from the browser/files app you used.

No Windows/Mac PC, Android Studio, local Gradle installation or USB cable is required; GitHub performs the Android build in the cloud.
