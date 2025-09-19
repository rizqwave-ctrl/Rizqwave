# Rizqwave — Premium Whitelist & Cost Controls

Short guide for maintaining a small, cost-conscious premium access group while staying on Firebase Spark (free) plan.

## What I added

- A client-side whitelist in `app.js` (`PREMIUM_WHITELIST`) that lets you list emails or UIDs for free premium access. This is cached in `localStorage` (`isPremium`) to avoid Firestore reads.
- Auth persistence configured to `LOCAL` to reduce auth-related calls.
- A small helper admin script (`scripts/set_custom_claims.js`) you can run locally to set `isPremium` custom claims for users via the Firebase Admin SDK. This is optional and gives stronger authorization than a client-side whitelist.

## Why this helps

- Reduces Firestore reads: whitelisted users do not trigger `users/{uid}` document reads during sign-in.
- Reduces Auth churn: setting `LOCAL` persistence keeps the user's session alive and avoids repeated token refreshes.
- Keeps you within Spark quotas for Firestore and Authentication when your user group is small.

## Security note

The client-side whitelist is a convenience and cost-control measure, NOT a security boundary. Anyone with the ability to edit the client (or to run modified JS in their browser) could change `localStorage` or the whitelist.

For stronger guarantees, use the admin script below to set a custom claim `isPremium: true` on the user's account. Custom claims are carried in the user's ID token and enforced server-side by Firestore security rules (if you update them). Setting claims requires Admin SDK credentials (service account key) which must be kept secret and run from a secure environment (your local machine is fine for this small use case).

## Admin script: set custom claims locally

File: `scripts/set_custom_claims.js`

Usage (one-time / manual):

1. Create a Firebase service account key in the Firebase Console (Project Settings → Service accounts → Generate new private key). Save the JSON file locally.
2. Install `firebase-admin`:

```powershell
npm install firebase-admin
```

Also install the script helper `minimist` (used by the script):

```powershell
npm install minimist
```

3. Run the script (PowerShell):

```powershell
setx GOOGLE_APPLICATION_CREDENTIALS "C:\path\to\service-account.json"
node scripts/set_custom_claims.js --uids uid1 uid2
# or by email (it will lookup UIDs)
node scripts/set_custom_claims.js --emails your.email@example.com friend1@example.com
```

Notes:
- The script performs Admin SDK calls and must not be run in a browser.
- Setting custom claims will cause users to need to refresh their ID token (sign out/in or call `getIdToken(true)`) to see the change client-side.

## Firestore usage monitoring & tips

- Monitor Firestore usage in the Firebase Console → Usage to ensure you stay below Spark limits.
- Batch writes and avoid per-item reads when possible. Use aggregated documents (e.g., a single `stats` doc) rather than many small doc reads.
- Cache user metadata in `localStorage` and only fall back to Firestore for non-whitelisted users.
- Avoid writing telemetry to Firestore just to monitor quota; use the Console's built-in metrics.

## If you'd like help

- I can help add a minimal server-side script to set and revoke claims for specific UIDs, or add example Firestore security rules that check the `isPremium` custom claim.
