# Aurai Companion

Aurai Companion is a phone-first reference app for **Outward**. The aim is simple: spend less time digging through browser tabs and more time playing.

It brings recipes, alchemy, ingredient matching, saved lists and quick gameplay notes into one place. Detailed articles still open on the Outward Wiki when you need the full explanation.

## What you can do

- Search recipes by name, ingredient or purpose.
- Use slightly misspelled searches such as `livweedy` and still find the right ingredient or recipe.
- Add the ingredients in your bag to **My Items** and see:
  - what you can craft immediately;
  - the closest recipes;
  - exactly what is still missing.
- Tap an ingredient to see other recipes that use it.
- Save inventory loadouts and restore them later.
- Add recipes to a **Shopping List** and combine all missing ingredients into one list.
- Compare two recipes side by side.
- Save favourite recipes on the device.
- Search the current Outward Wiki for quests, enemies, locations, equipment and detailed item pages.

## Recipe database

The app includes a small starter set so it is useful immediately. When internet access is available, **Sync database** downloads the structured recipe index from the Outward Wiki and stores it in IndexedDB on the device.

That gives the app the best of both approaches:

- recipe search and **My Items** stay fast and work offline after a sync;
- the database can be refreshed without bundling a copy of the entire wiki into the APK;
- detailed wiki pages remain online, so the app does not try to duplicate long articles or guides.

Aurai checks for a recipe-index refresh in the background when the cached data is more than a week old. You can also refresh it manually from the Recipes screen.

## My Items

Open **My Items**, type an ingredient and tap **Add**. Ingredient suggestions appear as you type, and the matcher tolerates small spelling mistakes.

The results are split into:

- **Craftable now** — you already have every required ingredient.
- **Closest matches** — recipes that use what you have, sorted by how little is missing.

Quantities matter. If a recipe needs two of the same ingredient, Aurai checks that you actually have two.

A small number of known generic ingredient substitutions are supported as well, such as Raw Meat satisfying recipes that call for Meat. The app keeps this conservative rather than guessing at every possible substitution.

## Shopping List

Open a recipe and tap **Shopping list**. Aurai combines the ingredients from every planned recipe, subtracts what is already in **My Items**, and shows only what you still need.

The list can be copied to the clipboard for quick reference while playing.

## Android build

The Android APK is built through GitHub Actions. Run **Aurai Companion Update & Build**, then download the `Aurai-Companion-Android` artifact from the completed run.

For an app update, place the supplied `aurai-update.tar.gz` in the repository root and run the same workflow. It applies the changed files, rebuilds the APK and gives you the new artifact.

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
└── android/
```

There is no JavaScript framework or build step for the web app. The Android project is a small WebView wrapper around the same interface.

## Data and attribution

Aurai Companion is an unofficial fan-made project and is not affiliated with Nine Dots Studio.

Recipe facts and wiki links are based on the community-maintained **Outward Wiki** at `outward.wiki.gg`. Wiki content is generally available under **CC BY-NC-SA 4.0** unless a page says otherwise. Aurai stores a compact structured recipe index and links back to the original wiki pages rather than copying full article text.

## Android release signing

Android releases are built in GitHub Actions using a permanent signing key stored as repository secrets. The signing key itself is not stored in this repository. This means future APKs can be installed over an existing signed Aurai Companion installation without uninstalling it first.

The signing material should be backed up securely. Losing the release key would prevent future APKs from updating an installation signed with that key.

