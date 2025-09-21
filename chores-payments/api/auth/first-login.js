// pages/api/auth/first-login.js
// Support both TS module and CommonJS wrapper exports
import path from 'path';
import { pathToFileURL } from 'url';
let adminModule;
try {
  const adminPath = path.join(process.cwd(), 'lib', 'firebase-admin.js');
  const adminUrl = pathToFileURL(adminPath).href;
  console.log('first-login attempting import from', adminUrl);
  adminModule = (await import(adminUrl));
} catch (e) {
  try {
    const adminModuleUrl = new URL('../../lib/firebase-admin.js', import.meta.url).href;
    console.warn('first-login import via process.cwd() failed, falling back to import', adminModuleUrl, e && e.message ? e.message : e);
    adminModule = (await import(adminModuleUrl));
  } catch (e2) {
    console.error('first-login failed to import firebase-admin shim', e2 && e2.stack ? e2.stack : e2);
    throw e2;
  }
}
const adminModuleResolved = adminModule && adminModule.default ? adminModule.default : adminModule;
const admin = adminModuleResolved && adminModuleResolved.default ? adminModuleResolved.default : adminModuleResolved;
const adminAuth = admin.auth || admin.adminAuth || (adminModuleResolved && adminModuleResolved.adminAuth);
const db = admin.db || (adminModuleResolved && adminModuleResolved.db);

import Stripe from 'stripe';

// Helper: verify Firebase ID token from Authorization: Bearer <token>
async function verifyIdToken(req) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) throw new Error('Missing or invalid Authorization header');
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded;
}

export default async function handler(req, res) {
  // CORS handling: allow the frontend origin(s) and respond to preflight
  const allowedOrigins = ['https://rizqwave.web.app', 'http://localhost:8080', 'http://localhost:3000', 'http://localhost:3001'];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://rizqwave.web.app');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Initialize Stripe inside handler to avoid requiring secret at module load time
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  try {
    // 1) Auth
    const decoded = await verifyIdToken(req);
    const uid = decoded.uid;
    const email = decoded.email || '';

    // 2) Load user doc
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();

    // 3) Ensure Stripe customer id
    let stripeCustomerId = snap.exists ? snap.get('subscription.stripeCustomerId') : null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        metadata: { uid },
      });
      stripeCustomerId = customer.id;
    }

    // 4) Initialize 30-day trial if missing
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const existingTrial = snap.exists ? snap.get('trial') : null;
    const trialNeedsInit = !existingTrial || !existingTrial.startAt || !existingTrial.endAt;

    // Build updates (server-authoritative fields)
    const updates = {
      'subscription.status': snap.exists ? (snap.get('subscription.status') || 'none') : 'none',
      'subscription.stripeCustomerId': stripeCustomerId,
      // Do not overwrite active subscription fields if user already converted
    };

    if (trialNeedsInit) {
      updates['trial.startAt'] = now;
      updates['trial.endAt'] = end;
      updates['trial.status'] = 'active';
      updates['notices.lastSent48h'] = null;
      updates['notices.lastSent24h'] = null;
      updates['notices.lastSent0h'] = null;
    }

    // If a trial already exists but its end time has passed, mark it expired
    try {
      if (!trialNeedsInit && existingTrial && existingTrial.endAt) {
        let endAtDate = null;
        // Firestore Timestamp has toDate(); support both Timestamp and ISO/date string
        if (existingTrial.endAt && typeof existingTrial.endAt.toDate === 'function') {
          endAtDate = existingTrial.endAt.toDate();
        } else {
          endAtDate = new Date(existingTrial.endAt);
        }
        if (endAtDate && endAtDate.getTime() < now.getTime()) {
          updates['trial.status'] = 'expired';
          // Ensure notice fields exist so client/server can show reminders if desired
          updates['notices.lastSent48h'] = updates['notices.lastSent48h'] || null;
          updates['notices.lastSent24h'] = updates['notices.lastSent24h'] || null;
          updates['notices.lastSent0h'] = updates['notices.lastSent0h'] || null;
        }
      }
    } catch (e) {
      console.warn('Could not evaluate existing trial endAt', e && e.message ? e.message : e);
    }

    // 5) Write atomically (merge)
    await userRef.set(updates, { merge: true });

    // 6) Read back for response
    const outSnap = await userRef.get();
    const trial = outSnap.get('trial') || null;
    const subscriptionStatus = outSnap.get('subscription.status') || 'none';

    return res.status(200).json({
      ok: true,
      uid,
      trial,
      subscriptionStatus,
      stripeCustomerId,
    });
  } catch (err) {
    console.error('first-login error', err);
    return res.status(400).json({ ok: false, error: err.message || 'Unknown error' });
  }
}
