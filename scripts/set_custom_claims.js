#!/usr/bin/env node
/**
 * Local admin helper to set `isPremium` custom claims on Firebase users.
 * Usage:
 *   node set_custom_claims.js --uids uid1 uid2
 *   node set_custom_claims.js --emails user@example.com
 *   node set_custom_claims.js --revoke --uids uid1
 *
 * Requirements:
 * - Install `firebase-admin` in this folder: `npm install firebase-admin`
 * - Set `GOOGLE_APPLICATION_CREDENTIALS` to point at your service account JSON
 *   (or run `setx GOOGLE_APPLICATION_CREDENTIALS "C:\path\to\key.json"` on Windows)
 */

const admin = require('firebase-admin');
const argv = require('minimist')(process.argv.slice(2));

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS env var not set.');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.applicationDefault()
});

const auth = admin.auth();

async function setClaimsForUid(uid, claims) {
    try {
        await auth.setCustomUserClaims(uid, claims);
        console.log(`Updated claims for UID ${uid}:`, claims);
    } catch (err) {
        console.error('Error setting claims for', uid, err.message || err);
    }
}

async function lookupUidByEmail(email) {
    try {
        const user = await auth.getUserByEmail(email);
        return user.uid;
    } catch (err) {
        console.error('Could not find user for email', email, err.message || err);
        return null;
    }
}

(async function main() {
    const uids = argv.uids || [];
    const emails = argv.emails || [];
    const revoke = argv.revoke || false;

    let targetUids = Array.isArray(uids) ? uids : [uids];

    if (emails && emails.length) {
        const es = Array.isArray(emails) ? emails : [emails];
        for (const e of es) {
            const uid = await lookupUidByEmail(e);
            if (uid) targetUids.push(uid);
        }
    }

    targetUids = targetUids.filter(Boolean);

    if (!targetUids.length) {
        console.error('No target UIDs found. Provide --uids or --emails.');
        process.exit(1);
    }

    for (const uid of targetUids) {
        if (revoke) {
            await setClaimsForUid(uid, { isPremium: false });
        } else {
            await setClaimsForUid(uid, { isPremium: true });
        }
    }

    console.log('Done.');
    process.exit(0);
})();
