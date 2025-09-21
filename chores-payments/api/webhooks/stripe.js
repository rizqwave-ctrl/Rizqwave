import Stripe from 'stripe';
import path from 'path';
import { pathToFileURL } from 'url';
let adminModule;
try {
  const adminPath = path.join(process.cwd(), 'lib', 'firebase-admin.js');
  const adminUrl = pathToFileURL(adminPath).href;
  console.log('webhooks/stripe attempting import from', adminUrl);
  adminModule = (await import(adminUrl));
} catch (e) {
  try {
    const adminModuleUrl = new URL('../../lib/firebase-admin.js', import.meta.url).href;
    console.warn('webhooks/stripe fallback import via relative URL', adminModuleUrl, e && e.message ? e.message : e);
    adminModule = (await import(adminModuleUrl));
  } catch (e2) {
    console.error('webhooks/stripe failed to import firebase-admin shim', e2 && e2.stack ? e2.stack : e2);
    throw e2;
  }
}
const adminResolved = adminModule && adminModule.default ? adminModule.default : adminModule;
const db = adminResolved.db;
const auth = adminResolved.auth;
console.log('STRIPE_WEBHOOK_SECRET present:', !!process.env.STRIPE_WEBHOOK_SECRET);

export default async function handler(req, res) {
  // Set CORS headers for all requests (allow local dev origins too)
  const allowedOrigins = ['https://rizqwave.web.app', 'http://localhost:8080', 'http://localhost:3000', 'http://localhost:3001'];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://rizqwave.web.app');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Your webhook logic here...
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  // Debug: log whether webhook secret is present
  console.log('STRIPE_WEBHOOK_SECRET present:', !!endpointSecret);

  let event;

  // req.body will be a Buffer when using raw parser in dev-server
  const payload = req.body && req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body || {}));

  try {
    event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err && err.message ? err.message : err);
    try {
      const fs = await import('fs');
      const logPath = new URL('../../../dev-server-webhook-debug.log', import.meta.url).pathname.replace(/^\/(.:)\//, '$1:/');
      const debug = `sig:${sig}\nendpointSecret:${endpointSecret}\nheaders:${JSON.stringify(req.headers)}\npayload:${payload.toString()}\nerror:${err && err.stack ? err.stack : err}\n`;
      fs.appendFileSync(logPath, debug + '\n\n');
    } catch (e) {
      console.warn('Failed to write webhook debug log', e && e.message ? e.message : e);
    }
    return res.status(400).send(`Webhook Error: ${err && err.message ? err.message : 'Invalid signature'}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        // subscription.customer is the Stripe customer ID
        const customerId = subscription.customer;
        // Try to find the user in Firestore by subscription metadata mapping
        // We expect a mapping in users/{uid}.subscription.stripeCustomerId
        const usersRef = db.collection('users');
        const q = await usersRef.where('subscription.stripeCustomerId', '==', customerId).limit(1).get();
        if (!q.empty) {
          const doc = q.docs[0];
          const uid = doc.id;
          // Persist subscription fields
          const subData = {
            'subscription.status': subscription.status || 'unknown',
            'subscription.id': subscription.id,
            'subscription.current_period_end': subscription.current_period_end || null,
            'subscription.cancel_at_period_end': subscription.cancel_at_period_end || false,
            'subscription.plan': (subscription.items && subscription.items.data && subscription.items.data[0] && subscription.items.data[0].price && subscription.items.data[0].price.nickname) || null,
          };
          await usersRef.doc(uid).set(subData, { merge: true });

          // Update custom claims: isPremium = true when subscription status indicates active/trialing
          const isActive = subscription.status === 'active' || subscription.status === 'trialing';
          try {
            await auth.setCustomUserClaims(uid, {
              isPremium: isActive,
              subscriptionStatus: subscription.status || 'none',
              stripeCustomerId: customerId
            });
          } catch (claimErr) {
            console.warn('Could not set custom claims for', uid, claimErr && claimErr.message ? claimErr.message : claimErr);
          }
        } else {
          console.warn('No Firestore user found for Stripe customer', customerId);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const usersRef = db.collection('users');
        const q = await usersRef.where('subscription.stripeCustomerId', '==', customerId).limit(1).get();
        if (!q.empty) {
          const uid = q.docs[0].id;
          await usersRef.doc(uid).set({ 'subscription.lastPaymentFailedAt': new Date().toISOString() }, { merge: true });
          try { await auth.setCustomUserClaims(uid, { isPremium: false, subscriptionStatus: 'past_due' }); } catch (e) { console.warn('claim set failed', e); }
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const usersRef = db.collection('users');
        const q = await usersRef.where('subscription.stripeCustomerId', '==', customerId).limit(1).get();
        if (!q.empty) {
          const uid = q.docs[0].id;
          await usersRef.doc(uid).set({ 'subscription.lastPaymentSucceededAt': new Date().toISOString() }, { merge: true });
          try { await auth.setCustomUserClaims(uid, { isPremium: true, subscriptionStatus: 'active' }); } catch (e) { console.warn('claim set failed', e); }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const usersRef = db.collection('users');
        const q = await usersRef.where('subscription.stripeCustomerId', '==', customerId).limit(1).get();
        if (!q.empty) {
          const uid = q.docs[0].id;
          await usersRef.doc(uid).set({ 'subscription.status': 'canceled' }, { merge: true });
          try { await auth.setCustomUserClaims(uid, { isPremium: false, subscriptionStatus: 'canceled' }); } catch (e) { console.warn('claim set failed', e); }
        }
        break;
      }
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook handling error', err && err.message ? err.message : err);
    return res.status(500).send('Webhook handling failure');
  }

  res.json({ received: true });
}
