Firestore security rules (example)

Copy this into your Firestore rules (replace the rest of the rules as appropriate):

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow users to update their own profile only when their email is verified
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null
                    && request.auth.uid == userId
                    && request.auth.token.email_verified == true;
    }

    // Allow authenticated users to read/write their own data (customize as needed)
    match /{document=**} {
      allow read: if request.auth != null;
      allow write: if false; // tighten per-collection rules as needed
    }
  }
}

Notes:
- This example prevents clients from setting `users/{uid}.verified` unless the user's ID token reports `email_verified == true`.
- Deploy rules with `firebase deploy --only firestore:rules`.
