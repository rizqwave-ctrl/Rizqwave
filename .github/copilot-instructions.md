# Copilot instructions for Rizqwave / Family Chores

Short, actionable guide to help an AI coding assistant be immediately productive in this repository.

**Big picture**
- **App type:** Single-page static web app served from Firebase Hosting (`index.html` is the SPA entry). Primary UX and logic live in `app.js` (huge single file), with additional UI helpers in `script.js` and styles in `style.css`.
- **Data model & persistence:** The app stores runtime state in `localStorage` (keys: `family`, `choreData`, `starsData`, `weeklyStars`, `achievements`, `rewards`, `redeemedRewards`, `choreDifficulties`, `choreFrequencies`, `choreWeeklyDays`, etc.). When a user is authenticated, `saveAll()` will also write a snapshot to Firestore under `users/{uid}`.
- **Auth & security:** Firebase Authentication (compat) is used. Email verification is enforced client-side (redirect to `verify.html`) and server-side in `firestore.rules` (writes to `users/{uid}` require `request.auth.token.email_verified == true`).
- **Third‑party integrations:** Stripe (checkout flow + redirect), rrule.js (recurrence handling), Chart.js (progress charts), OpenWeather (weather fetch), and optional backend endpoints hosted at a Vercel URL for subscription webhooks and customer creation (`SubscriptionService` in `app.js`).

**Files and patterns to read first**
- `index.html` — entrypoint, which CDN scripts are loaded and the DOM IDs the JS expects (e.g., `kanban`, `loginOverlay`, many modal IDs).
- `app.js` — main app logic; very large. Look for `DOMContentLoaded` handler (central init), `saveAll()` (persistence + Firestore sync), `loadDataFromFirestore()`, and `auth.onAuthStateChanged` (auth flow). Use these as anchors when making changes.
- `script.js` — supplemental scripts and smaller helpers used by the UI.
- `firebase.json` & `firestore.rules` — hosting rewrites (e.g., `/success` → `success.html`) and security rules requiring email verification for writes to the `users` doc.
- `firebase-config.js` — currently empty; the live Firebase config is embedded in `app.js`. Be careful before moving it: tests and runtime depend on that config being present.

**Important implementation details & conventions**
- Data shape: chores are sometimes stored as plain strings or as objects ({title, createdAt, recurrence, assignedDate}). Code must handle both forms (see many checks in `renderBoard` and calendar helpers).
- Recurrence representation: either RRULE strings or an object { daysOfWeek: [1..7], rrule: 'FREQ=...' }. The helper `matchesRecurrence()` supports both and uses `window.RRule` when available.
- Per‑chore metadata keys: the code composes keys like `${member.name}-${choreTitle}` to store difficulty and frequency. Maintain that pattern for new features to avoid mismatches.
- Auth expectations: many flows assume a verified email. Firestore rules also only allow writes when the auth token contains `email_verified == true`. Tests or local emulators must replicate this behavior.
- Sync behavior: `saveAll()` always writes localStorage then attempts to write the whole snapshot to `users/{uid}` if a user is logged in. There is no partial-delta sync — expect potential overwrites when merging changes.

**Dev/run workflows (quick)**
- Quick local test (static server):
```powershell
npx http-server -c-1 . -p 8080
# or
npx serve . -p 8080
```
- Firebase hosting / local emulation (requires `firebase-tools` and login):
```powershell
npx firebase-tools login
npx firebase-tools emulators:start --only hosting,auth,firestore
# or to deploy
npx firebase-tools deploy --only hosting
```
- Notes: opening `index.html` via `file://` may break Firebase Auth (OAuth redirects and cookies). Use a local HTTP server or Firebase emulator for auth flows.

**Project-specific gotchas and checks**
- The project uses the Firebase compat SDK in the HTML (`firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js`) but `package.json` lists `firebase` ^12.x. If you change imports or bundle with a build system, prefer the modular SDK or update the HTML to use a consistent SDK version.
- `firebase-config` is currently embedded in `app.js` (object literal). `firebase-config.js` is empty — if you move credentials out, update `index.html` and `app.js` accordingly.
- Stripe keys and Vercel endpoints are present in `app.js` (`SubscriptionService.vercelBaseUrl` and a test publishable key). Treat these as behaviorally important; do not remove without also updating the subscription backend.
- `firestore.rules` requires `request.auth.token.email_verified == true` for writes to `/users/{uid}`. When testing with emulators, ensure the test user has the email_verified claim or adjust rules temporarily.

**How to extend safely**
- Small changes: prefer editing `app.js` by extracting small functions into new helper files to keep change surface small. Keep global variable names (`family`, `choreData`, `starsData`, etc.) or provide a migration layer to avoid breaking inline code references.
- Data migrations: if changing chore object shapes, add compatibility layers in `loadDataFromFirestore()` and `initData()` to normalize old formats (the app already handles both string and object chores in many places — mirror that approach).
- Auth & Firestore changes: update `firestore.rules` in lockstep. If you need server-side verification for subscriptions, expect a Vercel serverless backend that sets custom claims on the Firebase user (client refreshes token via `getIdToken(true)` on success).

**Smoke tests to run after changes**
- Sign up (email/password) → check that `users/{uid}` is created in Firestore and that the created doc contains `verified: false` until email is verified.
- Sign in with Google (popup/redirect) → code path `handleGoogleAuth` → new user doc creation branch.
- Create chore (add UI) → `choreData` in localStorage updates and `saveAll()` writes to Firestore when logged in.
- Subscription flow: click Premium → hits Vercel `/api/create-checkout-session` endpoints; successful redirect goes to `/success` (hosting rewrite configured).

If anything in this summary is unclear or you want specific examples (e.g., where `saveAll()` writes each key, or examples of chore object shapes), tell me which part to expand and I will iterate.
