# Signed Android builds

Aurai Companion now uses a permanent Android signing key for release APKs.

If you already installed one of the earlier debug-signed test APKs, Android will not accept the first permanently signed APK as an update because the signatures are different. Uninstall the old test build once, then install the signed build. After that, future signed releases can install normally over the existing app.

Keep the signing-key backup private and outside the public GitHub repository.

---

# Installing Aurai Companion from your phone

A PC is not needed. GitHub builds the Android APK in the cloud.

## Build the Android app

1. Open the repository on GitHub.
2. Go to **Actions**.
3. Open **Aurai Companion Update & Build**.
4. Tap **Run workflow**.
5. When the run finishes successfully, open it and download the **Aurai-Companion-Android** artifact.
6. Extract the downloaded ZIP and open `Aurai-Companion-Android.apk`.
7. If Android asks, allow your browser or Files app to install apps from this source, then continue with the installation.

## Updating the app

For an app update, upload `aurai-update.tar.gz` to the root of the repository and run **Aurai Companion Update & Build** again.

The workflow applies the source update, removes the update archive from the repository, builds a new APK and provides it as an artifact.

At the moment the APK is debug-signed, so Android may occasionally require the existing app to be removed before installing a build made with a different signing key. A permanent release signing key is the next infrastructure improvement planned for the project.
