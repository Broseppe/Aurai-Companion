# Changelog

## 2.3.1

- Prepared Android builds for permanent release signing.
- Increased Android version code so the first signed release has a clean upgrade path.
- Updated app, service-worker and Android version identifiers to 2.3.1.
- No recipe or interface features were removed.

## 2.3.0

- Added an offline recipe database using IndexedDB.
- Added background and manual recipe-index syncing from the Outward Wiki.
- Recipe matching now uses the synced database when available instead of only the starter set.
- Added fuzzy recipe and ingredient searching for small spelling mistakes.
- Added ingredient reverse lookup: tap an ingredient to see recipes that use it.
- Added purpose filters for healing, mana, stamina, weather, combat, travel and food.
- Added saved My Items loadouts.
- Added a Shopping List that combines missing ingredients across planned recipes.
- Added recipe comparison.
- Added several high-use alchemy recipes to the built-in starter set.
- Improved offline/online status messaging.
- Updated Android version to 2.3.0.

## 2.2.0

- Fixed the Alchemy and Cooking quick-access buttons.
- Fixed the update banner appearing when no usable update was waiting.
- Added a Later button to the web update prompt.
- Android builds no longer show the PWA update prompt.
- Improved multi-word recipe search.
- Reworked My Items with craftable and closest-match sections.
- Added ingredient quantities and missing-ingredient information.
