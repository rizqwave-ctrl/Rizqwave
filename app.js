// No backend required for email verification when using Firebase's built-in flow
let family = JSON.parse(localStorage.getItem("family")) || [
  { name: "Mom", color: "#ff6b6b", avatar: null },
  { name: "Dad", color: "#3399ff", avatar: null },
  { name: "Custom", color: "#33cc99", avatar: null },
  { name: "Custom", color: "#ffcc33", avatar: null },
];

let activeTabs = {}; // key: member.name, value: active tab label, e.g. "Afternoon"

let defaultChores = ["Brush Teeth", "Clean Room", "Homework"];
const defaultChoresByTime = {
  Morning: [],
  Afternoon: [],
  Evening: [],
};
let choreData = JSON.parse(localStorage.getItem("choreData")) || {};
let starsData = JSON.parse(localStorage.getItem("starsData")) || {};
let weeklyStars = JSON.parse(localStorage.getItem("weeklyStars")) || {};
let lastReset = localStorage.getItem("lastReset");
let chart;

// New enhanced features data
let achievements = JSON.parse(localStorage.getItem("achievements")) || {};
let familyGoals = JSON.parse(localStorage.getItem("familyGoals")) || [];
let rewards = JSON.parse(localStorage.getItem("rewards")) || [
  { id: 1, name: "Extra Screen Time", cost: 10, description: "30 minutes extra device time" },
  { id: 2, name: "Choose Dinner", cost: 15, description: "Pick what family eats for dinner" },
  { id: 3, name: "Stay Up Late", cost: 20, description: "Stay up 1 hour past bedtime" },
  { id: 4, name: "Special Outing", cost: 50, description: "Choose a family activity" }
];
let redeemedRewards = JSON.parse(localStorage.getItem("redeemedRewards")) || {};
let dailyChoreLogs = JSON.parse(localStorage.getItem("dailyChoreLogs")) || {};
let dailyDeductLogs = JSON.parse(localStorage.getItem("dailyDeductLogs")) || {};
//let chorePhotos = JSON.parse(localStorage.getItem("chorePhotos")) || {};
let notificationPermission = localStorage.getItem("notificationPermission") || "default";
let voiceRecognition;
let currentVoiceChore = null;
//let currentPhotoChore = null;
let currentDifficultyChore = null;
//let photoProofChores = ["Clean Room", "Make Bed", "Organize Toys", "Vacuum", "Wash Dishes"];

// Difficulty system
const difficultyStars = {
  easy: 1,
  medium: 2,
  hard: 3
};

let choreDifficulties = JSON.parse(localStorage.getItem("choreDifficulties")) || {};
let choreFrequencies = JSON.parse(localStorage.getItem("choreFrequencies")) || {};
let choreWeeklyDays = JSON.parse(localStorage.getItem("choreWeeklyDays")) || {};

const timeSections = [
  { label: "Morning", icon: "🌤️" },
  { label: "Afternoon", icon: "☀️" },
  { label: "Evening", icon: "🌙" },
];

function getDayKey() {
  return new Date().toISOString().split("T")[0];
}
// Import the functions you need from the SDKs you need
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// --- Firebase Auth Setup ---
const firebaseConfig = {
  apiKey: "AIzaSyDEuzFr_1ciIu05fx9IhcKrRGDu9XuPEP0",
  authDomain: "rizqwave.firebaseapp.com",
  projectId: "rizqwave",
  storageBucket: "rizqwave.firebasestorage.app",
  messagingSenderId: "458042036392",
  appId: "1:458042036392:web:4bfdc9b4b2cc9243d0f29d",
  measurementId: "G-CYNX9NVPD8"
};
firebase.initializeApp(firebaseConfig);

// --- Premium access whitelist (client-side) ---
// Lightweight whitelist to allow you and friends to receive premium features
// without any Firestore lookups. Update the `emails` array with the
// authenticated emails of the users who should receive free premium access.
// Optionally add UIDs to `uids` if you prefer to match by UID (more stable).
// WARNING: This is a client-side whitelist for convenience and cost-control.
// Do NOT rely on this for strong security-sensitive features. For stronger
// guarantees you would need to set custom claims via a secure server process.
const PREMIUM_WHITELIST = {
  emails: [
    // Example: replace with your email(s)
    "your.email@example.com",
    "friend1@example.com"
  ],
  uids: [
    // Optional: add Firebase Auth UIDs here
  ]
};

// Global premium flag cached in localStorage to avoid repeated checks.
window.isPremium = (localStorage.getItem('isPremium') === 'true');

/**
 * Determine if the signed-in user should have premium access without
 * performing any Firestore reads. This checks the local whitelist and
 * updates a cached value in localStorage to minimize future work.
 */
function setPremiumForUser(user) {
  if (!user) {
    window.isPremium = false;
    localStorage.removeItem('isPremium');
    return false;
  }

  const email = (user.email || '').toLowerCase();
  const uid = user.uid || '';

  const matchedByEmail = PREMIUM_WHITELIST.emails
    .map(e => e.toLowerCase())
    .includes(email);
  const matchedByUid = PREMIUM_WHITELIST.uids.includes(uid);

  const isPremiumNow = matchedByEmail || matchedByUid;
  window.isPremium = !!isPremiumNow;
  if (isPremiumNow) {
    localStorage.setItem('isPremium', 'true');
  } else {
    localStorage.removeItem('isPremium');
  }

  return isPremiumNow;
}

// Reduce Authentication calls by persisting state locally.
// This reduces re-auth attempts and keeps token refreshes managed by the SDK.
try {
  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((err) => {
    console.warn('Could not set auth persistence:', err && err.message);
  });
} catch (e) {
  // In some environments the Persistence enum may not be available; ignore safely.
  console.warn('Auth persistence configuration skipped:', e && e.message);
}

// If a user was already flagged premium in a previous session, keep that
// flag until the next successful auth state change. This avoids any Firestore
// round trips during app init just to decide premium behavior.
if (window.isPremium) {
  console.info('Premium flag loaded from cache (localStorage).');
}

// Add this after Firebase initialization
// Subscription Service Class
class SubscriptionService {
  constructor() {
    this.stripe = Stripe('pk_test_51S34YeDgO4wxmFqL91o4JIGCCWr9rYXpKykW74XdG8mv4a7Dg34iCzQAWfjZ745mjbtCnXGn6a3CFlB02DOySYpi00pi9v5RBc'); // Replace with your actual publishable key
    //this.vercelBaseUrl = 'https://chores-payments-nb9ikc9dx-mohammed-rasheed-khans-projects.vercel.app';
    this.vercelBaseUrl = 'https://chores-payments.vercel.app';
  }

  async checkUserSubscription() {
    const user = firebase.auth().currentUser;
    if (!user) return { isPremium: false, status: 'none', customerId: null };

    try {
      // Get updated token with custom claims
      await user.getIdToken(true);
      const { claims } = await user.getIdTokenResult();

      return {
        isPremium: claims.isPremium || false,
        status: claims.subscriptionStatus || 'none',
        customerId: claims.stripeCustomerId || null,
      };
    } catch (error) {
      console.error('Error checking subscription:', error);
      return { isPremium: false, status: 'none', customerId: null };
    }
  }

  async createCustomer(user) {
    try {
      const response = await fetch(`${this.vercelBaseUrl}/api/create-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          firebaseUid: user.uid,
          name: user.displayName || user.email,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create customer');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  async createSubscription(user, priceId) {
    try {
      // First, create or get customer
      const customer = await this.createCustomer(user);

      // Create checkout session
      const response = await fetch(`${this.vercelBaseUrl}/api/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: priceId,
          customerId: customer.customerId,
          firebaseUid: user.uid,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();

      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error) {
      console.error('Error creating subscription:', error);
      alert('Failed to start subscription process. Please try again.');
    }
  }


}

// Initialize the subscription service
const subscriptionService = new SubscriptionService();

// Initialize Firestore
const db = firebase.firestore();
const loginBtn = document.getElementById("loginBtn");
const loginOverlay = document.getElementById("loginOverlay");
const loginBtnOverlay = document.getElementById("loginBtnOverlay");
const mainAppContent = document.getElementById("mainAppContent");
const logoutBtn = document.getElementById("logoutBtn");
const sidebar = document.getElementById("sidebar");
// Ensure floating logout button is hidden/shown correctly
if (logoutBtn) logoutBtn.classList.add("floating-logout-btn");

function showAppContent(isLoggedIn) {
  if (isLoggedIn) {
    loginOverlay.style.display = "none";
    mainAppContent.style.display = "";
    sidebar.classList.remove("hidden");
    if (loginBtn) {
      loginBtn.style.display = "none";
      loginBtn.classList.remove('disabled-login');
    }
    if (logoutBtn) {
      logoutBtn.style.display = "";
      logoutBtn.classList.add("floating-logout-btn");
    }
  } else {
    console.log("morning error 1");

    loginOverlay.style.display = "flex";
    mainAppContent.style.display = "none";
    sidebar.classList.add("hidden");
    if (loginBtn) {
      loginBtn.style.display = "";
      // Add a visual disabled state since there's another login button inside the overlay
      loginBtn.classList.add('disabled-login');
    }
    if (logoutBtn) {
      logoutBtn.style.display = "none";
      logoutBtn.classList.add("floating-logout-btn");
    }

    console.log("morning error 2");
  }
}

const auth = firebase.auth();
// Helper: show temporary messages in overlay
// Show temporary user-friendly auth messages.
// Accepts a string or an Error-like object (with `code` and `message`).
function showAuthMessage(payload, type = 'error') {
  try {
    // Prefer the new element, fall back to older element if present
    const primary = document.getElementById('authMessage');
    const fallback = document.getElementById('authError');
    const el = primary || fallback;
    if (!el) {
      // Nothing to show in UI, but still log to console
      if (payload && typeof payload === 'object') console.warn('Auth message (no UI):', payload);
      return;
    }

    const codeToMessage = {
      'auth/popup-closed-by-user': 'The sign-in popup was closed. Please try again.',
      'auth/popup-blocked': 'Popup blocked. Allow popups and try again.',
      'auth/email-already-in-use': 'That email is already registered. Try signing in instead.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/wrong-password': 'Incorrect password. Try again or reset your password.',
      'auth/user-not-found': 'No account found with that email. Please sign up first.',
      'auth/weak-password': 'Password is too weak. Use 8+ characters.',
      'auth/account-exists-with-different-credential': 'An account exists with a different sign-in method. Try signing in with that provider.',
      'auth/too-many-requests': 'Too many attempts. Please wait a while and try again.'
    };

    let message = '';
    if (!payload) {
      message = '';
    } else if (typeof payload === 'string') {
      message = payload;
    } else if (typeof payload === 'object') {
      if (payload.code && codeToMessage[payload.code]) {
        message = codeToMessage[payload.code];
      } else if (payload.code) {
        message = 'Authentication error. Please try again.';
      } else if (payload.message) {
        // Avoid showing provider raw messages; shorten them
        message = payload.message.length > 120 ? payload.message.slice(0, 117) + '...' : payload.message;
      } else {
        message = 'An unexpected error occurred. Please try again.';
      }

      // Always log full error object for debugging (console only)
      console.warn('Auth error details:', payload);
    }

    el.textContent = message;
    el.style.color = type === 'success' ? '#34a853' : '#ea4335';

    // Auto-clear after a short time
    clearTimeout(el._clearTimeout);
    el._clearTimeout = setTimeout(() => { el.textContent = ''; }, 6000);
  } catch (e) {
    console.error('showAuthMessage failed', e);
  }
}

// Simple loading UI for auth buttons
function setAuthLoading(loading) {
  const btns = [document.getElementById('emailLoginBtn'), document.getElementById('signupBtn'), document.getElementById('loginBtnOverlay')];
  btns.forEach(b => { if (b) b.disabled = loading; });
}

// Prevent duplicate signup attempts
let signUpInProgress = false;

// Sign up with email/password
async function signUpWithEmail(e) {
  if (e && e.preventDefault) e.preventDefault();
  const displayName = (document.getElementById('signupDisplayName') || {}).value || '';
  const email = (document.getElementById('signupEmail') || {}).value || '';
  const password = (document.getElementById('signupPassword') || {}).value || '';

  // Trace entry for debugging in production
  try { console.log('signUpWithEmail entered for', email); console.trace(); } catch (e2) { }

  // Basic validation
  if (!displayName.trim()) return showAuthMessage('Please enter a display name');
  if (!email || !email.includes('@')) return showAuthMessage('Please enter a valid email');
  if (!password || password.length < 8) return showAuthMessage('Password must be at least 8 characters');
  // Prevent concurrent submits - set guard early to avoid race
  if (signUpInProgress) {
    if (location.hostname === 'localhost' || location.search.includes('dev=true')) console.debug('signUpWithEmail: submission ignored, already in progress');
    return showAuthMessage('Sign up already in progress. Please wait.', 'error');
  }
  signUpInProgress = true;
  if (location.hostname === 'localhost' || location.search.includes('dev=true')) console.debug('signUpWithEmail: starting for', email);
  setAuthLoading(true);
  const signupBtnEl = document.getElementById('signupBtn');
  if (signupBtnEl) signupBtnEl.disabled = true;
  try {
    // Pre-check: if this email already has sign-in methods, don't attempt to create a new account
    try {
      const methods = await auth.fetchSignInMethodsForEmail(email);
      // Debug log in dev only
      if (location.hostname === 'localhost' || location.search.includes('dev=true')) console.debug('fetchSignInMethodsForEmail', methods);
      if (methods && methods.length > 0) {
        // Email already in use
        const loginEl = document.getElementById('loginEmail');
        if (loginEl) loginEl.value = email;
        showAuthMessage('This email is already registered. Please sign in instead.', 'error');
        showLoginUI();
        return;
      }
    } catch (preErr) {
      // If fetchSignInMethodsForEmail fails (rare), do NOT proceed to create account
      console.warn('fetchSignInMethodsForEmail failed', preErr);
      showAuthMessage('Could not verify email availability. Please try again.', 'error');
      return;
    }

    // Final double-check: re-query sign-in methods right before creating the account
    try {
      const finalMethods = await auth.fetchSignInMethodsForEmail(email);
      if (finalMethods && finalMethods.length > 0) {
        // Another process registered this email while the user was filling the form.
        const loginEl = document.getElementById('loginEmail');
        if (loginEl) loginEl.value = email;
        showAuthMessage('This email was just registered. Please sign in instead.', 'error');
        showLoginUI();
        return;
      }
    } catch (finalErr) {
      // If the final check fails, log it but continue to attempt create (we'll still catch errors)
      console.warn('final fetchSignInMethodsForEmail failed', finalErr);
    }

    // Log before creating the user (always) so we can see stack in production
    try { console.log('About to call createUserWithEmailAndPassword for', email); console.trace(); } catch (e2) { }
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Update display name
    await user.updateProfile({ displayName: displayName });

    // Create user document in Firestore (mark verified=false initially)
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: displayName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      verified: false
    });

    // Save pending info so we can prefill login/signup after verification
    try { localStorage.setItem('pendingDisplayName', displayName); } catch (e) { /* ignore */ }
    try { localStorage.setItem('pendingVerificationEmail', email); } catch (e) { /* ignore */ }

    // Send Firebase built-in email verification link
    try {
      console.log('Attempting to send verification email to', user.email);
      await user.sendEmailVerification();
      console.log('sendEmailVerification succeeded for', user.email);
      showAuthMessage('Account created. A verification link has been sent to your email. Please click it to verify, then sign in.', 'success');
      // Show resend UI in case the email was not received
      try { document.getElementById('resendVerificationArea').style.display = ''; } catch (e) { }
    } catch (e) {
      console.warn('sendEmailVerification failed', e);
      showAuthMessage('Account created. Please verify your email. If you did not receive an email, use Resend below.', 'success');
      try { document.getElementById('resendVerificationArea').style.display = ''; } catch (e) { }
    }

    // Sign out unverified user and show login UI
    await auth.signOut();
    document.getElementById('signupForm') && document.getElementById('signupForm').reset();
    showLoginUI();
  } catch (err) {
    console.error('Signup error', err);
    // Handle common Firebase error codes
    if (err && err.code === 'auth/email-already-in-use') {
      // Prefill login email and switch UI to login
      try { localStorage.setItem('pendingVerificationEmail', email); } catch (e) { }
      const loginEl = document.getElementById('loginEmail');
      if (loginEl) loginEl.value = email;
      showAuthMessage('This email is already registered. Please sign in instead.', 'error');
      showLoginUI();
    } else if (err) {
      showAuthMessage(err, 'error');
    } else {
      showAuthMessage('Sign up failed. Please try again.', 'error');
    }
  } finally {
    setAuthLoading(false);
    signUpInProgress = false;
    if (signupBtnEl) signupBtnEl.disabled = false;
  }
}
async function signInWithEmail(e) {
  if (e && e.preventDefault) e.preventDefault();
  const email = (document.getElementById('loginEmail') || {}).value || '';
  const password = (document.getElementById('loginPassword') || {}).value || '';

  if (!email || !email.includes('@')) return showAuthMessage('Please enter a valid email');
  if (!password) return showAuthMessage('Please enter your password');

  setAuthLoading(true);
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const user = cred.user;
    if (user && !user.emailVerified) {
      // Force sign out and ask user to verify via email link
      try { await user.sendEmailVerification(); } catch (e) { console.warn('sendEmailVerification failed', e); }
      await auth.signOut();
      showAuthMessage('Please verify your email (we sent a link). After verifying, sign in.', 'error');
      return;
    }

    showAuthMessage('Login successful', 'success');
    // load user data and show app
    await loadDataFromFirestore();
    renderBoard();
    showAppContent(true);
  } catch (err) {
    console.error('Login error', err);
    showAuthMessage(err || 'Login failed');
  } finally {
    setAuthLoading(false);
  }
}

// Switch UI helpers
function showLoginUI() {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  if (loginForm) loginForm.style.display = '';
  if (signupForm) signupForm.style.display = 'none';
  // When showing overlay login UI, hide the top sidebar login button to avoid duplicate controls
  try {
    if (loginBtn) loginBtn.style.display = 'none';
  } catch (e) { console.warn('Could not hide top login button', e); }
}
function showSignupUI() {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  if (loginForm) loginForm.style.display = 'none';
  if (signupForm) signupForm.style.display = '';
  // When showing overlay signup UI, hide the top sidebar login button
  try {
    if (loginBtn) loginBtn.style.display = 'none';
  } catch (e) { console.warn('Could not hide top login button', e); }
}

// Wire up auth UI events when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  if (window.__familyChoresInit) return;
  window.__familyChoresInit = true;
  const showLoginBtn = document.getElementById('showLoginBtn');
  const showSignupBtn = document.getElementById('showSignupBtn');
  const signupForm = document.getElementById('signupForm');
  const loginForm = document.getElementById('loginForm');
  const loginGoogleBtn = document.getElementById('loginBtnOverlay');

  if (showLoginBtn) showLoginBtn.addEventListener('click', showLoginUI);
  if (showSignupBtn) showSignupBtn.addEventListener('click', showSignupUI);
  if (signupForm) { signupForm.onsubmit = signUpWithEmail; signupForm.dataset.signupHandlerAttached = 'true'; }
  if (loginForm) { loginForm.onsubmit = signInWithEmail; loginForm.dataset.loginHandlerAttached = 'true'; }
  if (loginGoogleBtn) { loginGoogleBtn.onclick = () => handleGoogleAuth(false); loginGoogleBtn.dataset.googleHandlerAttached = 'true'; }
  const resendVerificationBtn = document.getElementById('resendVerificationBtn');
  if (resendVerificationBtn) resendVerificationBtn.addEventListener('click', handleResendVerification);

  // Wire explicit redirect links for Google sign-in
  const loginRedirectLink = document.getElementById('loginRedirectLink');
  const signupRedirectLink = document.getElementById('signupRedirectLink');
  const popupBlockedBanner = document.getElementById('popupBlockedBanner');
  const popupDismiss = document.getElementById('popupDismiss');

  // Calendar + Suggestions UI wiring
  const sidebarCalendar = document.getElementById('sidebarCalendar');
  const sidebarSuggestions = document.getElementById('sidebarSuggestions');
  const calendarModal = document.getElementById('calendarModal');
  const closeCalendarModal = document.getElementById('closeCalendarModal');
  const calendarContent = document.getElementById('calendarContent');
  const prevWeek = document.getElementById('prevWeek');
  const nextWeek = document.getElementById('nextWeek');
  const prevMonth = document.getElementById('prevMonth');
  const nextMonth = document.getElementById('nextMonth');
  const viewToggle = document.getElementById('viewToggle');
  const exportICalBtn = document.getElementById('exportICalBtn');

  const suggestionsModal = null;
  const closeSuggestionsModal = null;
  const suggestionsContent = null;
  const applyAllSuggestions = null;

  if (sidebarCalendar) sidebarCalendar.addEventListener('click', () => {
    // Ensure calendar content is wrapped so modal-body can scroll without overflowing viewport
    try {
      const modalContent = calendarModal && calendarModal.querySelector('.modal-content');
      if (modalContent && !modalContent.querySelector('.modal-body')) {
        const bodyWrap = document.createElement('div'); bodyWrap.className = 'modal-body';
        const cal = modalContent.querySelector('#calendarContent');
        if (cal) { modalContent.removeChild(cal); bodyWrap.appendChild(cal); modalContent.appendChild(bodyWrap); }
      }
    } catch (e) { console.warn('wrap calendarBody failed', e); }
    calendarModal.style.display = 'block'; renderCalendar();
  });
  if (closeCalendarModal) closeCalendarModal.addEventListener('click', () => { calendarModal.style.display = 'none'; });
  if (prevWeek) prevWeek.addEventListener('click', () => { shiftWeek(-1); });
  if (nextWeek) nextWeek.addEventListener('click', () => { shiftWeek(1); });
  if (exportICalBtn) exportICalBtn.addEventListener('click', () => { exportWeekICal(); });
  if (prevMonth) prevMonth.addEventListener('click', () => { shiftMonth(-1); });
  if (nextMonth) nextMonth.addEventListener('click', () => { shiftMonth(1); });
  if (viewToggle) viewToggle.addEventListener('click', () => { toggleCalendarView(); });

  // removed Smart Suggestions UI wiring

  if (loginRedirectLink) loginRedirectLink.addEventListener('click', (ev) => {
    ev && ev.preventDefault();
    const provider = new firebase.auth.GoogleAuthProvider();
    showAuthMessage('Redirecting to Google sign-in...', 'info');
    auth.signInWithRedirect(provider);
  });
  if (signupRedirectLink) signupRedirectLink.addEventListener('click', (ev) => {
    ev && ev.preventDefault();
    const provider = new firebase.auth.GoogleAuthProvider();
    showAuthMessage('Redirecting to Google sign-in...', 'info');
    auth.signInWithRedirect(provider);
  });
  if (popupDismiss && popupBlockedBanner) popupDismiss.addEventListener('click', () => { popupBlockedBanner.style.display = 'none'; });

  // Default: show login
  showLoginUI();
  // Check for recent verification and show banner if applicable
  setTimeout(checkForRecentVerification, 400);
  // Additional initializers (merged from later duplicate init)
  try {
    initData && typeof initData === 'function' && initData();
    initWeatherAndTime && typeof initWeatherAndTime === 'function' && initWeatherAndTime();
    initTitleAvatar && typeof initTitleAvatar === 'function' && initTitleAvatar();
    loadCustomTitle && typeof loadCustomTitle === 'function' && loadCustomTitle();
    initVoiceRecognition && typeof initVoiceRecognition === 'function' && initVoiceRecognition();
    initNotifications && typeof initNotifications === 'function' && initNotifications();
    initModalEventListeners && typeof initModalEventListeners === 'function' && initModalEventListeners();
    // Handle redirect result if user was sent back after signInWithRedirect
    try {
      const redirectResult = await auth.getRedirectResult();
      if (redirectResult && redirectResult.user) {
        const user = redirectResult.user;
        const isNew = redirectResult.additionalUserInfo && redirectResult.additionalUserInfo.isNewUser;
        if (isNew) {
          await db.collection('users').doc(user.uid).set({
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            verified: user.emailVerified || false,
            provider: 'google'
          }, { merge: true });
        }
        // Load app state for this user
        await loadDataFromFirestore();
        renderBoard();
        showAppContent(true);
      }
    } catch (redirectErr) {
      // getRedirectResult may throw if no redirect happened or if provider errored — ignore harmless cases
      console.debug('getRedirectResult check:', redirectErr && redirectErr.code ? redirectErr.code : redirectErr);
    }
  } catch (e) { console.warn('Merged init failed', e); }
});

// DOM-ready fallback: if auth state fired before the sidebar element existed,
// try to populate `#loggedInUser` when the DOM is ready using currentUser
// or previously stored pending display name.
document.addEventListener('DOMContentLoaded', () => {
  try {
    const el = document.getElementById('loggedInUser');
    if (!el) return;
    // Prefer live Firebase user if available
    const live = (firebase && firebase.auth) ? firebase.auth().currentUser : null;
    if (live) {
      el.textContent = live.displayName || live.email || live.uid || '';
      return;
    }
    // Fallback to any pending display name saved during signup/verification
    const pending = localStorage.getItem('pendingDisplayName') || localStorage.getItem('signupDisplayName') || '';
    if (pending) el.textContent = pending;
  } catch (e) { console.warn('DOMContentLoaded fallback for loggedInUser failed', e); }
});
function handleLogin(event) {
  console.log("handleLogin function called");

  if (event) {
    console.log("Event detected:", event);
    event.preventDefault();
  } else {
    console.log("No event detected.");
  }

  console.log("Creating GoogleAuthProvider instance...");
  const provider = new firebase.auth.GoogleAuthProvider();

  console.log("Attempting sign-in with popup...");
  auth.signInWithPopup(provider)
    .then(result => {
      console.log("Login successful:", result.user);
    })
    .catch(error => {
      console.error("Login error:", error);
    });
}
if (loginBtn) {
  loginBtn.onclick = (e) => {
    if (loginBtn.classList && loginBtn.classList.contains('disabled-login')) {
      // Prevent opening duplicate login when overlay already provides login controls
      e && e.preventDefault();
      return;
    }
    // Guard against concurrent Google sign-in attempts
    if (window.googleAuthInProgress) return;
    return handleGoogleAuth(false);
  };
}
if (loginBtnOverlay) loginBtnOverlay.onclick = () => handleGoogleAuth(false);

// Unified Google auth handler for login and signup
async function handleGoogleAuth(isSignup = false) {
  // Prevent concurrent sign-in attempts
  if (window.googleAuthInProgress) return;
  window.googleAuthInProgress = true;
  try {
    setAuthLoading(true);
    const provider = new firebase.auth.GoogleAuthProvider();
    // Request additional scopes if you need more info
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    const additionalInfo = firebase.auth.Auth && result.additionalUserInfo ? result.additionalUserInfo : result.additionalUserInfo;

    // If the user is new, create a Firestore users doc and prompt for profile completion
    const isNew = result && result.additionalUserInfo && result.additionalUserInfo.isNewUser;
    if (isNew) {
      // create a user doc with available profile info
      const displayName = user.displayName || '';
      const email = user.email || '';
      const photoURL = user.photoURL || null;

      await db.collection('users').doc(user.uid).set({
        uid: user.uid,
        email,
        displayName,
        photoURL,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        verified: user.emailVerified || false,
        provider: 'google'
      }, { merge: true });

      // Optionally show a profile completion UI here
      showAuthMessage('Welcome! Your Google account has been used to create your profile. Please complete any missing details.', 'success');
      // Show the main app content
      await loadDataFromFirestore();
      renderBoard();
      showAppContent(true);
      return;
    }

    // Existing user - simply load data
    await loadDataFromFirestore();
    renderBoard();
    showAppContent(true);
  } catch (err) {
    // Add trace to help diagnose where the error came from
    console.trace && console.trace('Google auth error trace', err);

    // Common popup-related errors are expected when user cancels or when the popup is blocked.
    const code = err && err.code ? err.code : null;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      // Informational only — user closed the popup
      showAuthMessage('Google sign-in was cancelled.', 'info');
      console.debug('Google sign-in cancelled by user', err);
    } else if (code === 'auth/popup-blocked') {
      showAuthMessage('Popup blocked. Please allow popups for this site and try again.', 'error');
      console.warn('Popup blocked during Google sign-in', err);
    } else if (code === 'auth/account-exists-with-different-credential') {
      showAuthMessage('An account already exists with the same email address but different sign-in method. Please sign in using the original method.', 'error');
    } else {
      // Fallback: show a friendly message and keep the full error in console for debugging
      showAuthMessage('Google sign-in failed. Check console for details.', 'error');
      console.error('Google auth error', err);
    }
    // If the popup was blocked or cancelled, try a redirect fallback
    if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user')) {
      try {
        console.info('Attempting redirect fallback for Google sign-in');
        // small UI hint to user
        showAuthMessage('Popup blocked or cancelled — trying redirect sign-in. If nothing happens, enable popups.', 'info');
        // show the persistent banner so user knows we attempted a redirect
        const popupBlockedBanner = document.getElementById('popupBlockedBanner');
        if (popupBlockedBanner) popupBlockedBanner.style.display = 'block';
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithRedirect(provider);
        return;
      } catch (redirErr) {
        console.error('Redirect fallback failed', redirErr);
      }
    }
  } finally {
    window.googleAuthInProgress = false;
    setAuthLoading(false);
  }
}

// Wire new Google signup button
const signupGoogleBtn = document.getElementById('signupGoogleBtn');
if (signupGoogleBtn) signupGoogleBtn.onclick = () => handleGoogleAuth(true);

if (logoutBtn) logoutBtn.onclick = () => {
  console.log("Logout button clicked");
  auth.signOut().then(() => {
    console.log("User logged out successfully");
    showAppContent(false); // Hide app content after logout
  }).catch(error => {
    console.error("Logout error:", error);
  });
};

// Verification banner helpers
async function checkForRecentVerification() {
  try {
    const pendingEmail = localStorage.getItem('pendingVerificationEmail');
    if (!pendingEmail) return;

    const user = firebase.auth().currentUser;
    if (user && user.email === pendingEmail) {
      await user.reload();
      if (user.emailVerified) {
        showVerificationBanner(pendingEmail);
        return;
      }
    }

    // Also try to silently refresh auth state via getRedirectResult or token refresh
    // but avoid forcing sign-in. Banner will instruct the user to return and sign in.
  } catch (e) {
    console.warn('checkForRecentVerification failed', e);
  }
}

// Resend verification helper: prompts for password and resends verification link.
async function handleResendVerification() {
  try {
    const pendingEmail = localStorage.getItem('pendingVerificationEmail') || (document.getElementById('signupEmail') || {}).value;
    if (!pendingEmail) return showAuthMessage('No email available to resend verification to.', 'error');

    // Prompt user to enter their password so we can sign them in temporarily to call sendEmailVerification
    const pw = prompt(`Enter the password for ${pendingEmail} to resend the verification link:`);
    if (!pw) return showAuthMessage('Resend cancelled.', 'error');

    showAuthMessage('Resending verification link...', 'success');
    setAuthLoading(true);

    try {
      const cred = await auth.signInWithEmailAndPassword(pendingEmail, pw);
      const u = cred.user;
      if (!u) {
        showAuthMessage('Could not sign in to resend verification. Please try signing in normally.', 'error');
        return;
      }
      try {
        await u.sendEmailVerification();
        showAuthMessage('Verification email resent. Check your inbox and spam folder.', 'success');
        console.log('Resent verification to', pendingEmail);
      } catch (sendErr) {
        console.warn('Resend sendEmailVerification failed', sendErr);
        showAuthMessage('Could not resend verification. Please contact support.', 'error');
      }
      // Sign out after resending to keep flow consistent
      await auth.signOut();
    } catch (signErr) {
      console.warn('Resend sign-in failed', signErr);
      if (signErr && signErr.code === 'auth/wrong-password') {
        showAuthMessage('Incorrect password. Resend cancelled.', 'error');
      } else if (signErr && signErr.code === 'auth/user-not-found') {
        showAuthMessage('No account found for that email.', 'error');
      } else {
        showAuthMessage('Could not sign in to resend verification. Try signing in normally.', 'error');
      }
    }
  } finally {
    setAuthLoading(false);
  }
}

function showVerificationBanner(email) {
  // Avoid duplicate
  if (document.getElementById('verificationBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'verificationBanner';
  banner.style.position = 'fixed';
  banner.style.top = '12px';
  banner.style.left = '50%';
  banner.style.transform = 'translateX(-50%)';
  banner.style.background = '#e7f7ee';
  banner.style.border = '1px solid #c6f0d6';
  banner.style.padding = '10px 14px';
  banner.style.borderRadius = '8px';
  banner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
  banner.style.zIndex = 10001;
  banner.innerHTML = `Verified ${email}. <button id="verificationBannerSignIn" style="margin-left:10px;">Sign In</button> <button id="verificationBannerDismiss" style="margin-left:8px;">Dismiss</button>`;
  document.body.appendChild(banner);

  document.getElementById('verificationBannerSignIn').addEventListener('click', () => {
    localStorage.removeItem('pendingVerificationEmail');
    localStorage.removeItem('pendingDisplayName');
    showLoginUI();
    banner.remove();
  });
  document.getElementById('verificationBannerDismiss').addEventListener('click', () => {
    banner.remove();
  });
}

auth.onAuthStateChanged(async user => {
  if (user) {
    console.log("User logged in:", user.uid);
    try {
      const loggedEl = document.getElementById('loggedInUser');
      if (loggedEl) loggedEl.textContent = user.displayName || user.email || user.uid;
    } catch (e) { console.warn('Could not write loggedInUser element', e); }

    // If Firebase says the email is not verified, treat as unverified
    if (!user.emailVerified) {
      console.log('Email not verified for', user.email);
      await firebase.auth().signOut();
      localStorage.setItem('pendingVerificationEmail', user.email || '');
      window.location.href = '/verify.html?email=' + encodeURIComponent(user.email || '');
      return;
    }

    // Use client-side whitelist caching to decide premium access and avoid
    // unnecessary Firestore reads which would count against free-tier quotas.
    const isPremiumLocal = setPremiumForUser(user);
    if (isPremiumLocal) {
      console.info('Premium access granted from client whitelist — skipping Firestore reads.');
      // For whitelisted users, prefer localStorage snapshot to avoid reading
      // user documents from Firestore. If no local data exists, fall back to
      // a minimal read (optional). Here we avoid reads entirely to limit quota.
      renderBoard();
      showAppContent(true);
      return;
    }

    // Non-whitelisted users: perform a minimal verification check against
    // Firestore user doc. This is only executed when necessary to reduce reads.
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      const data = doc.exists ? doc.data() : null;
      if (data && data.verified === false) {
        console.log('User record not verified yet');
        await firebase.auth().signOut();
        localStorage.setItem('pendingVerificationEmail', user.email || '');
        window.location.href = '/verify.html?email=' + encodeURIComponent(user.email || '');
        return;
      }
    } catch (err) {
      console.warn('Could not read verification status from Firestore', err);
      // fall through; prefer to let Firebase emailVerified gate access
    }

    // Reset local state and load data for non-whitelisted users
    await loadDataFromFirestore();
    renderBoard();
    showAppContent(true);
  } else {
    console.log("User is not logged in.");
    // Reset local state when no user is logged in
    try {
      const loggedEl = document.getElementById('loggedInUser');
      if (loggedEl) loggedEl.textContent = '';
    } catch (e) { console.warn('Could not clear loggedInUser element', e); }
    resetLocalState();
    renderBoard();
    showAppContent(false);
  }
});

// Handle subscription success redirect
if (window.location.pathname === '/success' || window.location.search.includes('session_id')) {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');

  if (sessionId) {
    // Wait a moment for webhook to process
    setTimeout(async () => {
      const user = firebase.auth().currentUser;
      if (user) {
        await user.getIdToken(true); // Force token refresh
        // Show success message
        alert('🎉 Welcome to Premium! Your subscription is now active.');
        // Redirect to main app
        window.history.replaceState({}, document.title, "/");
        renderBoard(); // Refresh the board
      }
    }, 3000);
  }
}


function resetLocalState() {
  console.log("Resetting local state...");
  family = [
    { name: "Mom", color: "#ff6b6b", avatar: null },
    { name: "Dad", color: "#3399ff", avatar: null },
    { name: "Custom", color: "#33cc99", avatar: null },
    { name: "Custom", color: "#ffcc33", avatar: null },
  ];
  activeTabs = {};
  choreData = {};
  starsData = {};
  weeklyStars = {};
  lastReset = null;
  achievements = {};
  familyGoals = [];
  rewards = [
    { id: 1, name: "Extra Screen Time", cost: 10, description: "30 minutes extra device time" },
    { id: 2, name: "Choose Dinner", cost: 15, description: "Pick what family eats for dinner" },
    { id: 3, name: "Stay Up Late", cost: 20, description: "Stay up 1 hour past bedtime" },
    { id: 4, name: "Special Outing", cost: 50, description: "Choose a family activity" }
  ];
  redeemedRewards = {};
  choreDifficulties = {};
  choreFrequencies = {};
  choreWeeklyDays = {};
}

function initData() {

  activeTabs = JSON.parse(localStorage.getItem("activeTabs")) || {};

  family.forEach((member) => {
    if (!activeTabs[member.name]) {
      console.log("setting morning as active tab for member 1");
      activeTabs[member.name] = "Morning"; // default initial tab per member
      console.log("setting morning as active tab for member 2");

    }
    if (!choreData[member.name]) {
      console.log("setting morning as active tab for member 3");

      choreData[member.name] = {
        Morning: [...defaultChoresByTime.Morning],
        Afternoon: [...defaultChoresByTime.Afternoon],
        Evening: [...defaultChoresByTime.Evening],
      };
      console.log("setting morning as active tab for member 4");

    }
    if (!starsData[member.name]) starsData[member.name] = 0;
    if (!weeklyStars[member.name]) weeklyStars[member.name] = {};
  });
  autoResetDaily();
  saveAll();
  renderBoard();
  updateChart();
}

function shadeColor(color, percent) {
  let f = parseInt(color.slice(1), 16),
    t = percent < 0 ? 0 : 255,
    p = Math.abs(percent) / 100,
    R = f >> 16,
    G = (f >> 8) & 0x00ff,
    B = f & 0x0000ff;
  return (
    "#" +
    (0x1000000 +
      (Math.round((t - R) * p) + R) * 0x10000 +
      (Math.round((t - G) * p) + G) * 0x100 +
      (Math.round((t - B) * p) + B))
      .toString(16)
      .slice(1)
  );
}

function getInitials(name) {
  return name.split(" ").map((n) => n[0].toUpperCase()).join("");
}

// --- Calendar & Smart Suggestions ---
let calendarWeekOffset = 0; // 0 = current week, -1 previous, +1 next

function getStartOfWeek(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
  const start = new Date(now.setDate(diff));
  start.setHours(0, 0, 0, 0);
  if (offset !== 0) start.setDate(start.getDate() + offset * 7);
  return start;
}

function renderCalendar() {
  const start = getStartOfWeek(calendarWeekOffset);
  const calendarContent = document.getElementById('calendarContent');
  if (!calendarContent) return;
  // Clear existing
  calendarContent.innerHTML = '';

  const weekWrap = document.createElement('div');
  weekWrap.className = 'calendar-week';
  const header = document.createElement('div'); header.className = 'week-header';

  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const col = document.createElement('div'); col.className = 'week-day'; col.tabIndex = 0;
    const title = document.createElement('div'); title.className = 'day-title'; title.textContent = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    col.appendChild(title);

    const actions = document.createElement('div'); actions.className = 'day-actions';
    const addBtn = document.createElement('button'); addBtn.textContent = '+'; addBtn.title = 'Add'; addBtn.className = 'quick-action-btn';
    addBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openAddChoreForDate(d); });
    const editBtn = document.createElement('button'); editBtn.textContent = '✎'; editBtn.title = 'Edit'; editBtn.className = 'quick-action-btn';
    editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openEditChoresForDate(d); });
    const delBtn = document.createElement('button'); delBtn.textContent = '🗑'; delBtn.title = 'Delete'; delBtn.className = 'quick-action-btn';
    delBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openDeleteChoresForDate(d); });
    actions.appendChild(addBtn); actions.appendChild(editBtn); actions.appendChild(delBtn);
    col.appendChild(actions);

    const itemsWrap = document.createElement('div'); itemsWrap.className = 'day-items';
    const dayKey = d.toISOString().split('T')[0];
    family.forEach(member => {
      const secs = choreData[member.name] || {};
      Object.keys(secs).forEach(sec => {
        (secs[sec] || []).forEach(c => {
          const choreObj = typeof c === 'string' ? { title: c } : c;
          const occurs = choreObj.recurrence ? matchesRecurrence(choreObj.recurrence, d) : false;
          const createdAt = choreObj.createdAt ? new Date(choreObj.createdAt).toISOString().split('T')[0] : null;
          const assigned = choreObj.assignedDate ? String(choreObj.assignedDate) === dayKey : false;
          if (occurs || assigned || createdAt === dayKey) {
            const pill = document.createElement('div');
            pill.className = 'event-pill';
            const base = (family.find(f => f.name === member.name) || { color: '#4a90e2' }).color;
            pill.style.background = `linear-gradient(135deg, ${base}, ${shadeColor(base, -8)})`;
            pill.style.border = `1px solid ${shadeColor(base, -12)}`;
            pill.textContent = `${choreObj.title || choreObj.name || 'Chore'} — ${member.name}`;
            itemsWrap.appendChild(pill);
          }
        });
      });
    });

    col.appendChild(itemsWrap);
    weekWrap.appendChild(col);
  }

  calendarContent.appendChild(weekWrap);
}

function shiftWeek(delta) {
  calendarWeekOffset += delta;
  renderCalendar();
}

// Very small iCal export for the current week (basic, per-chore as all-day events)
function exportWeekICal() {
  const start = getStartOfWeek(calendarWeekOffset);
  const events = [];
  family.forEach(member => {
    const memberChores = (choreData[member.name] && Object.values(choreData[member.name]).flat()) || [];
    memberChores.forEach((c, idx) => {
      const choreObj = typeof c === 'string' ? { title: c } : c;
      const title = choreObj.title || choreObj.name || `Chore ${idx}`;
      if (choreObj.recurrence && (choreObj.recurrence.rrule || typeof choreObj.recurrence === 'string')) {
        // attach single event with RRULE
        const rruleStr = typeof choreObj.recurrence === 'string' ? choreObj.recurrence : (choreObj.recurrence.rrule || null);
        // use start date as the Monday of the week
        const dt = start.toISOString().split('T')[0].replace(/-/g, '');
        events.push({ uid: `${member.name}-${idx}`, title: `${title} — ${member.name}`, date: dt, rrule: rruleStr });
      } else {
        // we'll put the event on consecutive days across the week for demo
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const dt = d.toISOString().split('T')[0].replace(/-/g, '');
          events.push({ uid: `${member.name}-${idx}-${i}`, title: `${title} — ${member.name}`, date: dt });
        }
      }
    });
  });

  let ical = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//FamilyChores//EN\n';
  events.forEach(ev => {
    ical += 'BEGIN:VEVENT\n';
    ical += `UID:${ev.uid}\n`;
    ical += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n`;
    if (ev.rrule) {
      // Use DTSTART from first occurrence or given date
      ical += `DTSTART:${ev.date}T000000Z\n`;
      ical += `RRULE:${ev.rrule}\n`;
    } else {
      ical += `DTSTART;VALUE=DATE:${ev.date}\n`;
      ical += `DTEND;VALUE=DATE:${ev.date}\n`;
    }
    ical += `SUMMARY:${ev.title}\n`;
    ical += 'END:VEVENT\n';
  });
  ical += 'END:VCALENDAR';

  const blob = new Blob([ical], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `familychore-week-${(new Date()).toISOString().slice(0, 10)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Very simple recurrence matcher placeholder — can be improved later
function matchesRecurrence(recurrence, day) {
  // Support multiple formats: RRule string, object with rrule string, or daysOfWeek array
  if (!recurrence) return false;
  // If recurrence is an RRule string
  try {
    if (typeof recurrence === 'string' && window.RRule) {
      const rule = window.RRule.fromString(recurrence);
      return rule.all().some(dt => dt.toISOString().split('T')[0] === day.toISOString().split('T')[0]);
    }
    // If recurrence has an rrule property
    if (recurrence.rrule && window.RRule) {
      const rule = window.RRule.fromString(recurrence.rrule);
      return rule.all().some(dt => dt.toISOString().split('T')[0] === day.toISOString().split('T')[0]);
    }
    // Fallback: daysOfWeek: array with Monday=1..Sunday=7
    if (recurrence.daysOfWeek) {
      const dow = day.getDay() === 0 ? 7 : day.getDay();
      return recurrence.daysOfWeek.includes(dow);
    }
  } catch (e) {
    console.warn('Recurrence parse failed', recurrence, e);
  }
  return false;
}

// Calendar view state: 'week' or 'month'
let calendarViewMode = 'week';
let calendarMonthOffset = 0; // 0 = current month, +/- months

function toggleCalendarView() {
  calendarViewMode = calendarViewMode === 'week' ? 'month' : 'week';
  const viewToggle = document.getElementById('viewToggle');
  if (viewToggle) viewToggle.textContent = calendarViewMode === 'week' ? 'Month View' : 'Week View';
  // Render appropriate view with a simple fade/slide transition
  if (calendarViewMode === 'month') renderMonth(true);
  else renderCalendar();
}

function getStartOfMonth(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  first.setHours(0, 0, 0, 0);
  return first;
}

function shiftMonth(delta) {
  calendarMonthOffset += delta;
  renderMonth(delta > 0 ? 'next' : 'prev');
}

function renderMonth(transition) {
  // Build month grid for the month at calendarMonthOffset
  const start = getStartOfMonth(calendarMonthOffset);
  const year = start.getFullYear();
  const month = start.getMonth();

  // Determine first day to show (start on Monday)
  const firstDayDow = (new Date(year, month, 1)).getDay();
  // Convert Sunday(0) to 7 for Monday-start logic
  const lead = firstDayDow === 0 ? 6 : firstDayDow - 1;
  const cells = [];
  // 6 rows x 7 days
  const totalCells = 42;
  const firstShown = new Date(year, month, 1 - lead);

  for (let i = 0; i < totalCells; i++) {
    const d = new Date(firstShown);
    d.setDate(firstShown.getDate() + i);
    cells.push(d);
  }

  // Build DOM for month panel
  const panel = document.createElement('div');
  panel.className = 'calendar-panel';

  const header = document.createElement('div');
  header.className = 'calendar-header';
  header.innerHTML = `<div><strong>${start.toLocaleString(undefined, { month: 'long' })} ${year}</strong></div><div></div>`;
  panel.appendChild(header);

  const table = document.createElement('table');
  table.className = 'calendar-grid';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(dow => {
    const th = document.createElement('th'); th.textContent = dow; trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let r = 0; r < 6; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < 7; c++) {
      const idx = r * 7 + c;
      const day = cells[idx];
      const td = document.createElement('td');
      td.className = 'calendar-cell';
      td.tabIndex = 0;
      const dayNum = document.createElement('div'); dayNum.className = 'day-number'; dayNum.textContent = day.getDate();
      td.appendChild(dayNum);

      // Quick actions container
      const quick = document.createElement('div'); quick.className = 'quick-actions';
      const addBtn = document.createElement('button'); addBtn.className = 'quick-action-btn'; addBtn.title = 'Add'; addBtn.innerHTML = '+';
      addBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openAddChoreForDate(day); });
      const editBtn = document.createElement('button'); editBtn.className = 'quick-action-btn'; editBtn.title = 'Edit'; editBtn.innerHTML = '✎';
      editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openEditChoresForDate(day); });
      const delBtn = document.createElement('button'); delBtn.className = 'quick-action-btn'; delBtn.title = 'Delete'; delBtn.innerHTML = '🗑';
      delBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openDeleteChoresForDate(day); });
      quick.appendChild(addBtn); quick.appendChild(editBtn); quick.appendChild(delBtn);
      td.appendChild(quick);

      // Fill events for this day
      const itemsWrap = document.createElement('div'); itemsWrap.style.display = 'flex'; itemsWrap.style.flexDirection = 'column'; itemsWrap.style.gap = '6px'; itemsWrap.style.marginTop = '6px';
      const dayKey = day.toISOString().split('T')[0];
      const items = [];
      family.forEach(member => {
        const secs = choreData[member.name] || {};
        Object.keys(secs).forEach(sec => {
          (secs[sec] || []).forEach(c => {
            const choreObj = typeof c === 'string' ? { title: c } : c;
            const occurs = choreObj.recurrence ? matchesRecurrence(choreObj.recurrence, day) : false;
            const createdAt = choreObj.createdAt ? new Date(choreObj.createdAt).toISOString().split('T')[0] : null;
            const assigned = choreObj.assignedDate ? String(choreObj.assignedDate) === dayKey : false;
            // Show if recurrence says it occurs on this day OR if this chore was specifically assigned/created for this date
            if (occurs || assigned || createdAt === dayKey) {
              items.push({ title: choreObj.title || choreObj.name || 'Chore', member: member.name });
            }
          });
        });
      });

      items.forEach(it => {
        const pill = document.createElement('div');
        pill.className = 'event-pill';
        // pick a member color from `family` data; fallback to default
        const memberIndex = Math.max(0, family.findIndex(f => f.name === it.member));
        const memberObj = family[memberIndex] || { color: '#4a90e2' };
        const base = memberObj.color || '#4a90e2';
        const border = shadeColor(base, -12);
        pill.style.background = `linear-gradient(135deg, ${base}, ${shadeColor(base, -8)})`;
        pill.style.border = `1px solid ${border}`;
        pill.textContent = `${it.title} — ${it.member}`;
        pill.title = `${it.title} — ${it.member}`;
        itemsWrap.appendChild(pill);
      });

      td.appendChild(itemsWrap);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  panel.appendChild(table);

  // Perform panel swap with optional transition
  const existing = document.querySelector('#calendarContent .calendar-panel');
  const container = calendarContent || document.getElementById('calendarContent');
  if (!container) return;
  if (!existing) {
    container.innerHTML = '';
    container.appendChild(panel);
    return;
  }
  // Use a direction-aware animation helper for smoother transitions
  animatePanelSwitch(existing, panel, transition || 'next');
}

// Animate a panel switch between oldEl and newEl.
// direction: 'next' (slide left) | 'prev' (slide right) | any other => cross-fade
function animatePanelSwitch(oldEl, newEl, direction) {
  const container = oldEl && oldEl.parentNode ? oldEl.parentNode : (document.getElementById('calendarContent'));
  if (!container) return;

  // Prepare new element offscreen/transparent
  newEl.style.transition = 'none';
  newEl.style.opacity = '0';
  newEl.style.transform = (direction === 'next') ? 'translateX(18px) scale(0.995)' : (direction === 'prev' ? 'translateX(-18px) scale(0.995)' : 'translateY(6px) scale(0.995)');
  container.appendChild(newEl);

  // Force layout so the starting transform/opacity apply
  void newEl.offsetWidth;

  // Establish transition timing
  const dur = 360; // ms
  const timing = 'cubic-bezier(0.2,0.8,0.2,1)';
  newEl.style.transition = `transform ${dur}ms ${timing}, opacity ${dur}ms ease`;
  oldEl.style.transition = `transform ${dur}ms ${timing}, opacity ${dur}ms ease`;

  // Start animations
  requestAnimationFrame(() => {
    try {
      newEl.style.opacity = '1';
      newEl.style.transform = 'translateX(0) scale(1)';
      if (direction === 'next') {
        oldEl.style.transform = 'translateX(-18px) scale(0.98)';
      } else if (direction === 'prev') {
        oldEl.style.transform = 'translateX(18px) scale(0.98)';
      } else {
        oldEl.style.transform = 'translateY(-6px) scale(0.98)';
      }
      oldEl.style.opacity = '0';
    } catch (e) { console.warn('animatePanelSwitch start failed', e); }
  });

  // Cleanup after transition completes
  const cleanup = () => {
    try {
      if (oldEl && oldEl.parentNode) oldEl.parentNode.removeChild(oldEl);
      // Clear inline styles on newEl to allow CSS rules to take over
      newEl.style.transition = '';
      newEl.style.transform = '';
      newEl.style.opacity = '';
    } catch (e) { console.warn('animatePanelSwitch cleanup failed', e); }
    oldEl.removeEventListener('transitionend', onEnd);
  };

  const onEnd = (ev) => {
    // wait for the old element's opacity/transform transition to finish
    if (ev && (ev.propertyName === 'opacity' || ev.propertyName === 'transform')) {
      cleanup();
    }
  };

  // Fallback timeout in case transitionend doesn't fire
  oldEl.addEventListener('transitionend', onEnd);
  setTimeout(cleanup, dur + 100);
}

// Placeholder quick-action handlers (open simple prompts)
// Modal-based quick-action editor
function ensureQuickActionModal() {
  if (document.getElementById('quickActionModal')) return;
  const modal = document.createElement('div');
  modal.id = 'quickActionModal';
  modal.className = 'popup-overlay hidden';
  modal.innerHTML = `
    <div class="popup-content" role="dialog" aria-modal="true" aria-labelledby="qamTitle">
      <h2 id="qamTitle">Edit Chores</h2>
      <div id="qamDate" style="margin-bottom:8px;color:#555;"></div>
      <label for="qamMember">Member</label>
      <select id="qamMember"></select>
      <label for="qamSection">Section</label>
      <select id="qamSection"><option>Morning</option><option>Afternoon</option><option>Evening</option></select>
      <label for="qamTitleInput">Chore title</label>
      <input id="qamTitleInput" type="text" style="width:100%;padding:8px;margin-bottom:8px;" />
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
        <label style="font-weight:600;margin-right:8px;">Repeat weekly:</label>
        <div id="qamWeekdays" style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="weekday" data-day="1">M</button>
          <button class="weekday" data-day="2">T</button>
          <button class="weekday" data-day="3">W</button>
          <button class="weekday" data-day="4">T</button>
          <button class="weekday" data-day="5">F</button>
          <button class="weekday" data-day="6">S</button>
          <button class="weekday" data-day="7">S</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;">
        <button id="qamSave" style="min-width:100px;">Save</button>
        <button id="qamDelete" style="min-width:100px;">Delete</button>
        <button id="qamCancel" style="min-width:100px;">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Ensure overlay behaves correctly even if CSS is overridden elsewhere
  try {
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.display = 'none';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '20000';
    modal.style.backgroundColor = 'rgba(0,0,0,0.45)';
  } catch (e) { console.warn('Could not apply inline overlay styles', e); }

  // Wire buttons
  modal.querySelector('#qamCancel').addEventListener('click', () => { closeQuickActionModal(); });
  modal.querySelector('#qamDelete').addEventListener('click', () => { try { performQuickDelete(); } catch (e) { console.warn('performQuickDelete failed', e); alert('Could not delete. See console for details.'); } });
  modal.querySelector('#qamSave').addEventListener('click', () => { try { performQuickSave(); } catch (e) { console.warn('performQuickSave failed', e); alert('Could not save. See console for details.'); } });

  // Weekday buttons toggle + show/hide RRULE input
  modal.querySelectorAll('.weekday').forEach(b => b.addEventListener('click', (ev) => {
    try {
      ev.preventDefault();
      b.classList.toggle('active-weekday');
      // switch to weekly recurrence radio
      const weeklyRadio = modal.querySelector('input[name="qamRecType"][value="weekly"]');
      if (weeklyRadio) weeklyRadio.checked = true;
      // hide custom rrule field
      const rwrap = modal.querySelector('#qamRRuleWrap'); if (rwrap) rwrap.style.display = 'none';
    } catch (e) { console.warn('weekday toggle failed', e); }
  }));

  // Recurrence type radio handling
  modal.querySelectorAll('input[name="qamRecType"]').forEach(r => r.addEventListener('change', (ev) => {
    const val = ev.target.value;
    const rwrap = modal.querySelector('#qamRRuleWrap');
    if (rwrap) rwrap.style.display = (val === 'custom') ? 'block' : 'none';
    // If switching to none, clear weekday selections
    if (val === 'none') modal.querySelectorAll('#qamWeekdays .weekday').forEach(b => b.classList.remove('active-weekday'));
  }));

  // Accessibility: close on Escape, save on Enter, trap focus inside modal
  modal.addEventListener('keydown', (ev) => {
    try {
      if (ev.key === 'Escape') { closeQuickActionModal(); }
      if (ev.key === 'Enter' && document.activeElement && document.activeElement.id !== 'qamWeekdays') { ev.preventDefault(); performQuickSave(); }
      // simple focus trap
      if (ev.key === 'Tab') {
        const focusable = modal.querySelectorAll('button, [href], input, select, textarea');
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    } catch (e) { console.warn('modal key handler error', e); }
  });
  // expose helper to show/hide reliably
  modal._show = function () { modal.classList.remove('hidden'); modal.style.display = 'flex'; };
  modal._hide = function () { modal.classList.add('hidden'); modal.style.display = 'none'; };
}

let __qamState = null; // { date, member, section, originalIndex }

function openAddChoreForDate(date) {
  ensureQuickActionModal();
  const modal = document.getElementById('quickActionModal');
  try { modal._show(); } catch (e) { modal.classList.remove('hidden'); }
  document.getElementById('qamTitle').textContent = 'Add Chore';
  document.getElementById('qamDate').textContent = date.toDateString();
  // populate members
  const sel = document.getElementById('qamMember'); sel.innerHTML = '';
  family.forEach((m, idx) => { const o = document.createElement('option'); o.value = m.name; o.textContent = m.name; sel.appendChild(o); });
  document.getElementById('qamSection').value = 'Morning';
  document.getElementById('qamTitleInput').value = '';
  __qamState = { mode: 'add', date, member: family[0] && family[0].name, section: 'Morning', originalIndex: null };
  setTimeout(() => { document.getElementById('qamTitleInput').focus(); }, 40);
}

function openEditChoresForDate(date) {
  // Build list of matching chores for the date and show chooser
  const items = [];
  const dayKey = date.toISOString().split('T')[0];
  family.forEach(m => {
    const secs = choreData[m.name] || {};
    Object.keys(secs).forEach(sec => {
      (secs[sec] || []).forEach((c, idx) => {
        const choreObj = (typeof c === 'string') ? { title: c } : c;
        const occurs = choreObj.recurrence ? matchesRecurrence(choreObj.recurrence, date) : false;
        const createdAt = choreObj.createdAt ? new Date(choreObj.createdAt).toISOString().split('T')[0] : null;
        const assigned = choreObj.assignedDate ? String(choreObj.assignedDate) === dayKey : false;
        if (occurs || assigned || createdAt === dayKey) items.push({ member: m.name, section: sec, title: choreObj.title || choreObj.name || 'Chore', idx, raw: c });
      });
    });
  });
  if (items.length === 0) return alert('No editable chores found for ' + date.toDateString());
  ensureQuickActionModal();
  const modal = document.getElementById('quickActionModal');
  try { modal._show(); } catch (e) { modal.classList.remove('hidden'); }
  document.getElementById('qamTitle').textContent = 'Edit Chore';
  document.getElementById('qamDate').textContent = date.toDateString();
  const sel = document.getElementById('qamMember'); sel.innerHTML = '';
  family.forEach((m, idx) => { const o = document.createElement('option'); o.value = m.name; o.textContent = m.name; sel.appendChild(o); });
  // Populate matches list for user to choose
  const matchesEl = document.getElementById('qamMatchesList');
  matchesEl.innerHTML = '';
  items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'qam-match-row';
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '0.4rem';
    row.style.borderBottom = '1px solid #eee';
    const left = document.createElement('div');
    left.innerHTML = `<div style="font-weight:600">${it.title}</div><div style="font-size:0.85rem;color:#666">${it.member} • ${it.section}</div>`;
    const right = document.createElement('div');
    const chooseBtn = document.createElement('button');
    chooseBtn.textContent = 'Edit';
    chooseBtn.className = 'qam-btn';
    chooseBtn.addEventListener('click', () => {
      // Populate modal fields for this chosen item
      document.getElementById('qamMember').value = it.member;
      document.getElementById('qamSection').value = it.section;
      document.getElementById('qamTitleInput').value = it.title;
      // set state to edit this exact index
      __qamState = { mode: 'edit', date, member: it.member, section: it.section, originalIndex: it.idx, raw: it.raw };
      // Try to populate recurrence/rrule if stored
      try {
        const stored = it.raw;
        const rtypeWeekly = stored && stored.recurrence && stored.recurrence.daysOfWeek ? 'weekly' : (stored && stored.recurrence && stored.recurrence.rrule ? 'custom' : 'none');
        if (rtypeWeekly === 'weekly') {
          document.querySelector('input[name="qamRecType"][value="weekly"]').checked = true;
          modal.querySelectorAll('#qamWeekdays .weekday').forEach(b => b.classList.remove('active-weekday'));
          // stored.recurrence.daysOfWeek may be 1..7 (Mon=1..Sun=7) or 0..6 (Sun=0..Sat=6)
          (stored.recurrence.daysOfWeek || []).forEach(dRaw => {
            let d = parseInt(dRaw, 10);
            if (isNaN(d)) return;
            if (d > 6) d = d % 7; // convert 7 -> 0 (Sunday)
            // Try to match either data-day format (some modals use 0..6, some 1..7)
            let b = modal.querySelector(`#qamWeekdays .weekday[data-day="${d}"]`);
            if (!b) b = modal.querySelector(`#qamWeekdays .weekday[data-day="${d === 0 ? 7 : d}"]`);
            if (b) b.classList.add('active-weekday');
          });
        } else if (rtypeWeekly === 'custom') {
          document.querySelector('input[name="qamRecType"][value="custom"]').checked = true;
          modal.querySelector('#qamRRuleInput').value = stored.recurrence.rrule || '';
          modal.querySelector('#qamRRuleWrap').style.display = 'block';
        } else {
          document.querySelector('input[name="qamRecType"][value="none"]').checked = true;
          modal.querySelectorAll('#qamWeekdays .weekday').forEach(b => b.classList.remove('active-weekday'));
        }
      } catch (e) { console.warn('populate recurrence failed', e); }
      setTimeout(() => { document.getElementById('qamTitleInput').focus(); }, 30);
    });
    right.appendChild(chooseBtn);
    row.appendChild(left);
    row.appendChild(right);
    matchesEl.appendChild(row);
  });
  // focus first input
  setTimeout(() => { document.getElementById('qamTitleInput').focus(); }, 40);
}

function openDeleteChoresForDate(date) {
  // open edit flow then user can delete
  openEditChoresForDate(date);
}

function closeQuickActionModal() {
  const modal = document.getElementById('quickActionModal');
  if (!modal) return;
  try { modal._hide(); } catch (e) { modal.classList.add('hidden'); }
  __qamState = null;
}

function performQuickSave() {
  try {
    if (!__qamState) return closeQuickActionModal();
    const title = (document.getElementById('qamTitleInput') || {}).value.trim();
    const member = (document.getElementById('qamMember') || {}).value;
    const section = (document.getElementById('qamSection') || {}).value;
    if (!title) return alert('Enter a chore title');
    choreData[member] = choreData[member] || { Morning: [], Afternoon: [], Evening: [] };

    // read recurrence type and weekday recurrence selection
    const recType = (document.querySelector('input[name="qamRecType"]:checked') || {}).value || 'none';
    const weekdayBtns = Array.from(document.querySelectorAll('#qamWeekdays .weekday'));
    // dataset day can be 0..6 (Sun..Sat) or 1..7 (Mon..Sun) depending on modal version; normalize to 0..6
    const daysOfWeekRaw = weekdayBtns.filter(b => b.classList.contains('active-weekday')).map(b => parseInt(b.dataset.day, 10));
    const daysOfWeek = daysOfWeekRaw.map(d => (isNaN(d) ? null : (d > 6 ? d % 7 : d))).filter(d => d !== null);
    let recurrence = null;
    if (recType === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
      // convert JS weekday 0..6 (Sun..Sat) to BYDAY tokens (MO,TU etc.) and 1..7 Monday-based days for matchesRecurrence
      const bydayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
      const byday = daysOfWeek.map(d => bydayMap[d]).join(',');
      // Build simple RRULE and also keep daysOfWeek as array 1..7 where Monday=1 for matchesRecurrence
      const dowForMatch = daysOfWeek.map(d => (d === 0 ? 7 : d));
      recurrence = { daysOfWeek: dowForMatch, rrule: `FREQ=WEEKLY;BYDAY=${byday}` };
    } else if (recType === 'custom') {
      const rtext = (document.getElementById('qamRRuleInput') || {}).value.trim();
      if (rtext) recurrence = { rrule: rtext };
    }

    if (__qamState.mode === 'add') {
      const item = { title, createdAt: new Date().toISOString() };
      // attach assignedDate for calendar day mapping
      try { item.assignedDate = (__qamState.date && __qamState.date.toISOString) ? __qamState.date.toISOString().split('T')[0] : null; } catch (e) { item.assignedDate = null; }
      if (recurrence) item.recurrence = recurrence;
      choreData[member][section].push(item);
    } else if (__qamState.mode === 'edit') {
      const arr = choreData[member] && choreData[member][section];
      if (!arr || !arr[__qamState.originalIndex]) return alert('Original chore not found');
      const existing = arr[__qamState.originalIndex];
      if (existing && typeof existing === 'object') {
        existing.title = title;
        if (recurrence) existing.recurrence = recurrence; else delete existing.recurrence;
      } else {
        // replace string value with object
        arr[__qamState.originalIndex] = { title, createdAt: new Date().toISOString(), recurrence: recurrence || undefined };
      }
    }
    saveAll();
    closeQuickActionModal();
    renderMonth();
  } catch (e) {
    console.warn('performQuickSave error', e);
    alert('Could not save chore. See console for details.');
  }
}

function performQuickDelete() {
  try {
    console.debug('performQuickDelete start', __qamState);
    if (!__qamState) return closeQuickActionModal();
    if (__qamState.mode !== 'edit') return alert('Nothing to delete');
    const member = __qamState.member || (document.getElementById('qamMember') || {}).value;
    const section = __qamState.section || (document.getElementById('qamSection') || {}).value;
    const idx = __qamState.originalIndex;
    const arr = choreData[member] && choreData[member][section];
    console.debug('deleting from', member, section, 'index', idx, 'arrLen', arr && arr.length);
    if (!arr || !arr[idx]) { console.warn('Original chore not found for delete', member, section, idx); return alert('Original chore not found'); }
    if (!confirm('Delete this chore?')) return;
    arr.splice(idx, 1);
    saveAll();
    closeQuickActionModal();
    renderMonth();
    console.debug('performQuickDelete completed');
  } catch (e) {
    console.warn('performQuickDelete error', e);
    alert('Could not delete chore. See console for details.');
  }
}

// Smart Suggestions removed
function countsForMember(name) { return (choreData[name] && Object.values(choreData[name]).flat().length) || 0; }

function getEmojiForChore(chore) {
  try {
    const raw = (typeof chore === 'string') ? chore : (chore && (chore.title || chore.name) ? (chore.title || chore.name) : '');
    const c = String(raw || '').toLowerCase();
    if (c.includes("brush")) return "🪥";
    if (c.includes("clean")) return "🧹";
    if (c.includes("bed")) return "🛏️";
    if (c.includes("wash")) return "🧼";
    if (c.includes("cook")) return "🍳";
    if (c.includes("toy")) return "🧸";
    if (c.includes("dish")) return "🍽️";
    if (c.includes("vacuum")) return "🧹";
    if (c.includes("laundry")) return "🧺";
    if (c.includes("homework") || c.includes("study")) return "📚";
    if (c.includes("breakfast") || c.includes("eat")) return "🍽️";
    if (c.includes("lunch")) return "🥪";
    if (c.includes("dinner")) return "🍽️";
    if (c.includes("outside") || c.includes("play")) return "⚽";
    if (c.includes("read") || c.includes("book")) return "📖";
    if (c.includes("prepare") || c.includes("ready")) return "🎒";
    if (c.includes("hand")) return "🧼";
    if (c.includes("teeth")) return "🦷";
    if (c.includes("shower") || c.includes("bath")) return "🚿";
    if (c.includes("dress") || c.includes("clothes")) return "👕";
    if (c.includes("organize") || c.includes("tidy")) return "📦";
    if (c.includes("water") || c.includes("plant")) return "🌱";
    if (c.includes("pet") || c.includes("dog") || c.includes("cat")) return "🐕";
    if (c.includes("trash") || c.includes("garbage")) return "🗑️";
    if (c.includes("sweep") || c.includes("mop")) return "🧽";
    if (c.includes("dust")) return "🪶";
    if (c.includes("fold")) return "👔";
    if (c.includes("iron")) return "🪙";
    if (c.includes("garden")) return "🌻";
    if (c.includes("car") || c.includes("wash")) return "🚗";
    if (c.includes("walk")) return "🚶";
    if (c.includes("exercise") || c.includes("workout")) return "💪";
    if (c.includes("music") || c.includes("practice")) return "🎵";
    if (c.includes("art") || c.includes("draw")) return "🎨";
    if (c.includes("help")) return "🤝";
    return "✅";
  } catch (e) {
    console.warn('getEmojiForChore error', e, chore);
    return '✅';
  }
}

function triggerAllChoresCompleteAnimation(member) {
  // Create full-screen celebration overlay
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.background = "rgba(0, 0, 0, 0.8)";
  overlay.style.zIndex = "9999";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.animation = "fadeIn 0.5s ease-in";

  // Create celebration message
  const message = document.createElement("div");
  message.style.color = "white";
  message.style.fontSize = "3rem";
  message.style.fontWeight = "bold";
  message.style.textAlign = "center";
  message.style.marginBottom = "2rem";
  message.style.textShadow = "2px 2px 4px rgba(0,0,0,0.5)";
  message.innerHTML = `🎉 AMAZING! 🎉<br>${member.name} completed ALL chores!<br>🌟 SUPERSTAR! 🌟`;

  // Create fireworks container
  const fireworksContainer = document.createElement("div");
  fireworksContainer.style.position = "absolute";
  fireworksContainer.style.width = "100%";
  fireworksContainer.style.height = "100%";
  fireworksContainer.style.pointerEvents = "none";

  overlay.appendChild(message);
  overlay.appendChild(fireworksContainer);
  document.body.appendChild(overlay);

  // Create multiple firework bursts
  const fireworkEmojis = ["🎆", "🎇", "✨", "💫", "🌟", "⭐", "🎊", "🎉"];
  const colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7", "#dda0dd"];

  for (let i = 0; i < 20; i++) {
    setTimeout(() => {
      createFirework(fireworksContainer, fireworkEmojis, colors);
    }, i * 200);
  }

  // Create confetti rain
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      createConfetti(fireworksContainer);
    }, i * 100);
  }

  // Auto-close after 5 seconds or click to close
  const closeAnimation = () => {
    overlay.style.animation = "fadeOut 0.5s ease-out";
    setTimeout(() => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    }, 500);
  };

  overlay.addEventListener("click", closeAnimation);
  setTimeout(closeAnimation, 5000);
}

function createFirework(container, emojis, colors) {
  const centerX = Math.random() * window.innerWidth;
  const centerY = Math.random() * window.innerHeight;

  for (let i = 0; i < 8; i++) {
    const firework = document.createElement("div");
    firework.style.position = "absolute";
    firework.style.left = centerX + "px";
    firework.style.top = centerY + "px";
    firework.style.fontSize = "2rem";
    firework.style.pointerEvents = "none";
    firework.textContent = emojis[Math.floor(Math.random() * emojis.length)];

    const angle = (i * 45) * (Math.PI / 180);
    const distance = 100 + Math.random() * 100;
    const endX = centerX + Math.cos(angle) * distance;
    const endY = centerY + Math.sin(angle) * distance;

    firework.style.transform = `translate(-50%, -50%)`;
    firework.style.transition = "all 1s ease-out";

    container.appendChild(firework);

    setTimeout(() => {
      firework.style.left = endX + "px";
      firework.style.top = endY + "px";
      firework.style.opacity = "0";
      firework.style.transform = `translate(-50%, -50%) scale(2)`;
    }, 50);

    setTimeout(() => {
      if (container.contains(firework)) {
        container.removeChild(firework);
      }
    }, 1050);
  }
}

function createConfetti(container) {
  const confetti = document.createElement("div");
  confetti.style.position = "absolute";
  confetti.style.left = Math.random() * window.innerWidth + "px";
  confetti.style.top = "-20px";
  confetti.style.fontSize = "1.5rem";
  confetti.style.pointerEvents = "none";

  const confettiTypes = ["🎊", "🎉", "⭐", "✨", "💫", "🌟"];
  confetti.textContent = confettiTypes[Math.floor(Math.random() * confettiTypes.length)];

  confetti.style.animation = `confettiFall ${2 + Math.random() * 3}s linear forwards`;

  container.appendChild(confetti);

  setTimeout(() => {
    if (container.contains(confetti)) {
      container.removeChild(confetti);
    }
  }, 5000);
}
// function to allow reorder of chores 
function addDragAndDropHandlers(list, memberName, timeLabel) {
  let draggedIndex = null;

  // Ensure choreData exists for this member and timeLabel to avoid runtime errors
  if (!choreData[memberName]) {
    choreData[memberName] = { Morning: [], Afternoon: [], Evening: [] };
  }
  if (!Array.isArray(choreData[memberName][timeLabel])) {
    choreData[memberName][timeLabel] = [];
  }

  list.querySelectorAll(".chore").forEach((choreElem, index) => {
    choreElem.addEventListener("dragstart", (e) => {
      draggedIndex = index;
      e.dataTransfer.effectAllowed = "move";
      choreElem.classList.add("dragging");
    });

    choreElem.addEventListener("dragend", (e) => {
      draggedIndex = null;
      choreElem.classList.remove("dragging");
    });

    choreElem.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const bounding = choreElem.getBoundingClientRect();
      const offset = e.clientY - bounding.top;
      if (offset > bounding.height / 2) {
        choreElem.style["border-bottom"] = "2px solid #4a90e2";
        choreElem.style["border-top"] = "";
      } else {
        choreElem.style["border-top"] = "2px solid #4a90e2";
        choreElem.style["border-bottom"] = "";
      }
    });

    choreElem.addEventListener("dragleave", (e) => {
      choreElem.style["border-top"] = "";
      choreElem.style["border-bottom"] = "";
    });

    choreElem.addEventListener("drop", (e) => {
      e.preventDefault();
      choreElem.style["border-top"] = "";
      choreElem.style["border-bottom"] = "";

      if (draggedIndex === null || draggedIndex === index) return;

      try {
        const bounding = choreElem.getBoundingClientRect();
        const offset = e.clientY - bounding.top;
        const dropIndex = index;

        // Remove dragged chore from old position
        const chores = choreData[memberName][timeLabel];
        if (!chores || draggedIndex >= chores.length) return;

        const [draggedChore] = chores.splice(draggedIndex, 1);

        // Insert at new position depending on drop location
        const insertIndex = offset > bounding.height / 2 ? dropIndex + 1 : dropIndex;
        chores.splice(insertIndex, 0, draggedChore);

        saveAll();
        renderBoard();
        updateChart();
      } catch (error) {
        console.error('Error during drag and drop:', error);
        renderBoard(); // Reset the board state
      }
    });
  });
}

function renderBoard() {
  //console.log("Rendering board with data:", choreData); // Debug log

  const board = document.getElementById("kanban");
  board.innerHTML = "";

  family.forEach((member) => {
    // Defensive initialization: ensure per-member data structures exist
    if (!choreData[member.name]) {
      choreData[member.name] = {
        Morning: Array.isArray(defaultChoresByTime.Morning) ? [...defaultChoresByTime.Morning] : [],
        Afternoon: Array.isArray(defaultChoresByTime.Afternoon) ? [...defaultChoresByTime.Afternoon] : [],
        Evening: Array.isArray(defaultChoresByTime.Evening) ? [...defaultChoresByTime.Evening] : []
      };
    }
    if (!starsData[member.name] && starsData[member.name] !== 0) starsData[member.name] = 0;
    if (!weeklyStars[member.name]) weeklyStars[member.name] = {};
    // Ensure there's always a selected tab per member (default to Morning)
    if (!activeTabs[member.name]) activeTabs[member.name] = 'Morning';

    const column = document.createElement("div");
    column.className = "column";
    column.style.backgroundColor = member.color + "22";

    // Member header with avatar and name
    const header = document.createElement("div");
    header.className = "member-header";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.backgroundColor = member.color;
    avatar.style.cursor = "pointer";
    avatar.title = `Click to change ${member.name}'s avatar`;

    if (member.avatar) {
      avatar.style.backgroundImage = `url(${member.avatar})`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
      avatar.textContent = "";
    } else {
      avatar.textContent = getInitials(member.name);
    }

    // Add click event to change avatar
    avatar.addEventListener("click", () => {
      showAvatarChangePopup(member);
    });

    const name = document.createElement("div");
    name.className = "member-name";
    name.textContent = member.name;

    header.appendChild(avatar);
    header.appendChild(name);
    column.appendChild(header);

    // Add chore button
    // Add chore button
    const addBtn = document.createElement("button");
    addBtn.className = "add-chore-btn";
    addBtn.textContent = "+";
    addBtn.style.color = member.color;
    addBtn.title = `Add chore for ${member.name}`;

    // Delete member button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-member-btn";
    deleteBtn.textContent = "×";
    deleteBtn.style.position = "absolute";
    deleteBtn.style.top = "0.6rem";
    deleteBtn.style.right = "3rem";
    deleteBtn.style.background = "transparent";
    deleteBtn.style.border = "none";
    deleteBtn.style.fontSize = "1.5rem";
    deleteBtn.style.color = "#ff4444";
    deleteBtn.style.cursor = "pointer";
    deleteBtn.style.padding = "0";
    deleteBtn.style.width = "auto";
    deleteBtn.style.height = "auto";
    deleteBtn.title = `Delete ${member.name}`;
    deleteBtn.addEventListener("click", () => deleteMember(member.name));
    addBtn.addEventListener("click", () => {
      // Create popup elements
      const popup = document.createElement("div");
      popup.style.position = "fixed";
      popup.style.top = "50%";
      popup.style.left = "50%";
      popup.style.transform = "translate(-50%, -50%)";
      popup.style.background = "white";
      popup.style.padding = "1rem";
      popup.style.borderRadius = "8px";
      popup.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";
      popup.style.zIndex = 1000;

      // Chore Name
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Chore Name:";
      nameLabel.style.display = "block";
      nameLabel.style.marginBottom = "0.2rem";
      const addInput = document.createElement("input");
      addInput.type = "text";
      addInput.placeholder = `New chore for ${member.name}`;
      addInput.style.marginBottom = "0.5rem";
      addInput.style.width = "100%";

      // Time
      const timeLabelEl = document.createElement("label");
      timeLabelEl.textContent = "Time:";
      timeLabelEl.style.display = "block";
      timeLabelEl.style.marginBottom = "0.2rem";
      const select = document.createElement("select");
      select.style.width = "100%";
      select.style.marginBottom = "0.5rem";
      timeSections.forEach(({ label }) => {
        console.log("morning error renderboard 1");
        const option = document.createElement("option");
        option.value = label;
        option.textContent = label;
        select.appendChild(option);
      });

      // Difficulty
      const diffLabel = document.createElement("label");
      diffLabel.textContent = "Difficulty:";
      diffLabel.style.display = "block";
      diffLabel.style.marginBottom = "0.2rem";
      const difficultySelect = document.createElement("select");
      difficultySelect.style.width = "100%";
      difficultySelect.style.marginBottom = "0.5rem";
      [
        { value: "easy", text: "🟢 Easy (1 ⭐)" },
        { value: "medium", text: "🟡 Medium (2 ⭐)" },
        { value: "hard", text: "🔴 Hard (3 ⭐)" }
      ].forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.text;
        difficultySelect.appendChild(option);
      });

      // Frequency
      const freqLabel = document.createElement("label");
      freqLabel.textContent = "Frequency:";
      freqLabel.style.display = "block";
      freqLabel.style.marginBottom = "0.2rem";
      const frequencySelect = document.createElement("select");
      frequencySelect.style.width = "100%";
      frequencySelect.style.marginBottom = "0.5rem";
      [
        { value: "none", text: "None" },
        { value: "daily", text: "Daily Chore" },
        { value: "weekly", text: "Weekly Chore" }
      ].forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.text;
        frequencySelect.appendChild(option);
      });

      // Helper to create days of week checkboxes
      function createDaysOfWeekCheckboxes(selectedDays = []) {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const container = document.createElement("div");
        // Add label for days of week
        const daysLabel = document.createElement("label");
        daysLabel.textContent = "Days of Week:";
        daysLabel.style.display = "block";
        daysLabel.style.marginBottom = "0.2rem";
        container.appendChild(daysLabel);
        container.style.display = "flex";
        container.style.flexWrap = "wrap";
        container.style.gap = "0.5rem";
        days.forEach(day => {
          const label = document.createElement("label");
          label.style.display = "flex";
          label.style.alignItems = "center";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = day;
          if (selectedDays.includes(day)) checkbox.checked = true;
          label.appendChild(checkbox);
          label.appendChild(document.createTextNode(day));
          container.appendChild(label);
        });
        return container;
      }

      // Days of week checkboxes
      let daysCheckboxesContainer = null;
      function updateDaysCheckboxesAdd() {
        if (daysCheckboxesContainer && daysCheckboxesContainer.parentNode) daysCheckboxesContainer.parentNode.removeChild(daysCheckboxesContainer);
        if (frequencySelect.value === "weekly") {
          daysCheckboxesContainer = createDaysOfWeekCheckboxes();
          popup.appendChild(daysCheckboxesContainer);
        } else {
          daysCheckboxesContainer = null;
        }
      }
      frequencySelect.addEventListener("change", updateDaysCheckboxesAdd);
      updateDaysCheckboxesAdd();

      // In Add Chore popup creation:
      // After appending daysCheckboxesContainer (inside updateDaysCheckboxesAdd), move the addBtnPopup and cancelBtn below the checkboxes
      function moveAddButtonsBelowCheckboxes() {
        if (daysCheckboxesContainer && addBtnPopup && cancelBtn) {
          if (addBtnPopup.parentNode) addBtnPopup.parentNode.removeChild(addBtnPopup);
          if (cancelBtn.parentNode) cancelBtn.parentNode.removeChild(cancelBtn);
          daysCheckboxesContainer.parentNode.appendChild(addBtnPopup);
          daysCheckboxesContainer.parentNode.appendChild(cancelBtn);
        }
      }
      frequencySelect.addEventListener("change", moveAddButtonsBelowCheckboxes);
      updateDaysCheckboxesAdd = (function (orig) {
        return function () {
          orig && orig();
          moveAddButtonsBelowCheckboxes();
        };
      })(updateDaysCheckboxesAdd);
      moveAddButtonsBelowCheckboxes();

      const addBtnPopup = document.createElement("button");
      addBtnPopup.textContent = "Add";
      addBtnPopup.style.marginRight = "0.5rem";

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";

      popup.appendChild(nameLabel);
      popup.appendChild(addInput);
      popup.appendChild(timeLabelEl);
      popup.appendChild(select);
      popup.appendChild(diffLabel);
      popup.appendChild(difficultySelect);
      popup.appendChild(freqLabel);
      popup.appendChild(frequencySelect);
      if (daysCheckboxesContainer) popup.appendChild(daysCheckboxesContainer);
      popup.appendChild(addBtnPopup);
      popup.appendChild(cancelBtn);
      document.body.appendChild(popup);

      addBtnPopup.addEventListener("click", () => {
        const choreName = addInput.value.trim();
        const selectedTab = select.value;
        const difficulty = difficultySelect.value;
        const frequency = frequencySelect.value;
        let selectedDays = [];
        if (frequency === "weekly" && daysCheckboxesContainer) {
          selectedDays = Array.from(daysCheckboxesContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
          if (selectedDays.length === 0) {
            alert("Please select at least one day for a weekly chore.");
            return;
          }
        }
        if (!choreName) return alert("Please enter a chore name.");
        if (!selectedTab) return alert("Please select a time section.");
        choreData[member.name][selectedTab].push(choreName);
        // Save difficulty
        const choreKey = `${member.name}-${choreName}`;
        choreDifficulties[choreKey] = difficulty;
        choreFrequencies[choreKey] = frequency;
        choreWeeklyDays[choreKey] = selectedDays;
        localStorage.setItem("choreFrequencies", JSON.stringify(choreFrequencies));
        localStorage.setItem("choreWeeklyDays", JSON.stringify(choreWeeklyDays));
        saveAll();
        renderBoard();
        updateChart();
        document.body.removeChild(popup);
      });

      cancelBtn.addEventListener("click", () => {
        document.body.removeChild(popup);
      });
    });

    column.appendChild(addBtn);
    column.appendChild(deleteBtn);

    // Create tabs container
    const tabs = document.createElement("div");
    tabs.className = "tabs";

    // Create tab contents container
    const tabContentsContainer = document.createElement("div");

    timeSections.forEach(({ label, icon }, index) => {
      console.log("morning error renderboard 2");
      // Create tab button
      const tabBtn = document.createElement("button");
      tabBtn.className = "tab-button";
      if (activeTabs[member.name] === label) tabBtn.classList.add("active");
      tabBtn.innerHTML = `<span class="tab-icon">${icon}</span>${label}`;
      tabs.appendChild(tabBtn);

      // Create tab content container
      const tabContent = document.createElement("div");
      tabContent.className = "tab-content";
      if (activeTabs[member.name] === label) tabContent.classList.add("active");


      // Create chore list inside tab content
      const list = document.createElement("ul");
      list.className = "chore-list";

      const today = new Date();
      const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
      const chores = (choreData[member.name][label] || []).filter((chore) => {

        console.log("morning error chores 1 - " + choreData[member.name][label]);

        const choreKey = `${member.name}-${chore}`;
        const freq = choreFrequencies[choreKey];
        if (freq === 'weekly') {
          const days = choreWeeklyDays[choreKey] || [];
          return days.includes(dayName);
        }
        return true;
      });
      chores.forEach((chore, choreIndex) => {
        const li = document.createElement("li");
        // Normalize chore display title whether the stored item is a string or an object
        const choreTitle = (typeof chore === 'string') ? chore : (chore && (chore.title || chore.name) ? (chore.title || chore.name) : String(chore));
        li.className = "chore";
        li.style.backgroundColor = shadeColor(member.color, -30);
        li.setAttribute("draggable", "true");
        // Get difficulty and star count
        const choreKey = `${member.name}-${choreTitle}`;
        const difficulty = choreDifficulties[choreKey] || "easy";
        const stars = difficultyStars[difficulty] || 1;
        let starDisplay = '';
        if (difficulty === "easy") starDisplay = '🟢 1⭐';
        else if (difficulty === "medium") starDisplay = '🟡 2⭐';
        else if (difficulty === "hard") starDisplay = '🔴 3⭐';
        // Safely escape angle brackets in title for insertion into innerHTML
        const safeTitle = (choreTitle || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        li.innerHTML = `
  <span class="chore-number">${choreIndex + 1}.</span>
  <span class="chore-emoji">${getEmojiForChore(chore)}</span>
  <span class="chore-text">${safeTitle}</span>
  <span class="chore-stars" style="margin-left:0.5rem; font-size:0.95em;">${starDisplay}</span>
  <button class="edit-chore-btn" title="Edit chore ⚙️" style="margin-left:auto; background:none; border:none; color:white; cursor:pointer;">⚙️</button>
`;
        const editBtn = li.querySelector(".edit-chore-btn");
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // prevent chore completion on click

          // Create the popup
          const popup = document.createElement("div");
          popup.style.position = "fixed";
          popup.style.top = "50%";
          popup.style.left = "50%";
          popup.style.transform = "translate(-50%, -50%)";
          popup.style.background = "white";
          popup.style.padding = "1rem";
          popup.style.borderRadius = "8px";
          popup.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";
          popup.style.zIndex = 1000;

          // Chore Name
          const nameLabel = document.createElement("label");
          nameLabel.textContent = "Chore Name:";
          nameLabel.style.display = "block";
          nameLabel.style.marginBottom = "0.2rem";
          const editInput = document.createElement("input");
          editInput.type = "text";
          editInput.value = choreTitle;
          editInput.style.marginBottom = "0.5rem";
          editInput.style.width = "100%";

          // Time
          const timeLabelEl = document.createElement("label");
          timeLabelEl.textContent = "Time:";
          timeLabelEl.style.display = "block";
          timeLabelEl.style.marginBottom = "0.2rem";
          const select = document.createElement("select");
          select.style.width = "100%";
          select.style.marginBottom = "0.5rem";
          timeSections.forEach(({ label: timeLabel }) => {
            console.log("morning error renderboard 3");
            const option = document.createElement("option");
            option.value = timeLabel;
            option.textContent = timeLabel;
            if (timeLabel === label) option.selected = true;
            select.appendChild(option);
          });

          // Difficulty
          const diffLabel = document.createElement("label");
          diffLabel.textContent = "Difficulty:";
          diffLabel.style.display = "block";
          diffLabel.style.marginBottom = "0.2rem";
          const difficultySelect = document.createElement("select");
          difficultySelect.style.width = "100%";
          difficultySelect.style.marginBottom = "0.5rem";
          [
            { value: "easy", text: "🟢 Easy (1 ⭐)" },
            { value: "medium", text: "🟡 Medium (2 ⭐)" },
            { value: "hard", text: "🔴 Hard (3 ⭐)" }
          ].forEach(opt => {
            const option = document.createElement("option");
            option.value = opt.value;
            option.textContent = opt.text;
            difficultySelect.appendChild(option);
          });
          // Set current value if exists
          const choreKey = `${member.name}-${choreTitle}`;
          difficultySelect.value = choreDifficulties[choreKey] || "easy";

          // Frequency
          const freqLabel = document.createElement("label");
          freqLabel.textContent = "Frequency:";
          freqLabel.style.display = "block";
          freqLabel.style.marginBottom = "0.2rem";
          const editFrequencySelect = document.createElement("select");
          editFrequencySelect.style.width = "100%";
          editFrequencySelect.style.marginBottom = "0.5rem";
          [
            { value: "none", text: "None" },
            { value: "daily", text: "Daily Chore" },
            { value: "weekly", text: "Weekly Chore" }
          ].forEach(opt => {
            const option = document.createElement("option");
            option.value = opt.value;
            option.textContent = opt.text;
            editFrequencySelect.appendChild(option);
          });
          // Set current value if exists
          const editChoreKey = `${member.name}-${choreTitle}`;
          // Set default frequency to 'none' if not set
          editFrequencySelect.value = (editChoreKey in choreFrequencies) ? choreFrequencies[editChoreKey] : "none";
          // Helper to create days of week checkboxes
          function createDaysOfWeekCheckboxes(selectedDays = []) {
            const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const container = document.createElement("div");
            container.style.display = "flex";
            container.style.flexWrap = "wrap";
            container.style.gap = "0.5rem";
            days.forEach(day => {
              const label = document.createElement("label");
              label.style.display = "flex";
              label.style.alignItems = "center";
              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.value = day;
              if (selectedDays.includes(day)) checkbox.checked = true;
              label.appendChild(checkbox);
              label.appendChild(document.createTextNode(day));
              container.appendChild(label);
            });
            return container;
          }

          // Days of week checkboxes
          let editDaysCheckboxesContainer = null;
          function updateDaysCheckboxesEdit() {
            if (editDaysCheckboxesContainer && editDaysCheckboxesContainer.parentNode) editDaysCheckboxesContainer.parentNode.removeChild(editDaysCheckboxesContainer);
            if (editFrequencySelect.value === "weekly") {
              const editChoreKey = `${member.name}-${chore}`;
              const selected = choreWeeklyDays[editChoreKey] || [];
              editDaysCheckboxesContainer = createDaysOfWeekCheckboxes(selected);
              popup.appendChild(editDaysCheckboxesContainer);
            } else {
              editDaysCheckboxesContainer = null;
            }
          }
          editFrequencySelect.addEventListener("change", updateDaysCheckboxesEdit);
          updateDaysCheckboxesEdit();

          // Buttons
          const saveBtn = document.createElement("button");
          saveBtn.textContent = "Save";
          saveBtn.style.marginRight = "0.5rem";
          saveBtn.style.padding = '0.5rem 1rem';
          saveBtn.style.borderRadius = '6px';

          const cancelBtn = document.createElement("button");
          cancelBtn.textContent = "Cancel";
          cancelBtn.style.marginRight = "0.5rem";
          cancelBtn.style.padding = '0.5rem 1rem';
          cancelBtn.style.borderRadius = '6px';

          const deleteBtn = document.createElement("button");
          deleteBtn.textContent = "Delete";
          deleteBtn.style.background = '#7e2f27ff';
          deleteBtn.style.color = 'white';
          deleteBtn.style.border = 'none';
          deleteBtn.style.padding = '0.5rem 1rem';
          deleteBtn.style.borderRadius = '6px';
          deleteBtn.style.marginRight = '0';

          // Button row (Save, Cancel, Delete)
          const btnRow = document.createElement('div');
          btnRow.style.display = 'flex';
          btnRow.style.gap = '0.5rem';
          btnRow.style.marginTop = '0.5rem';
          btnRow.appendChild(saveBtn);
          btnRow.appendChild(cancelBtn);
          btnRow.appendChild(deleteBtn);

          // Build popup
          popup.appendChild(nameLabel);
          popup.appendChild(editInput);
          popup.appendChild(timeLabelEl);
          popup.appendChild(select);
          popup.appendChild(diffLabel);
          popup.appendChild(difficultySelect);
          popup.appendChild(freqLabel);
          popup.appendChild(editFrequencySelect);
          if (editDaysCheckboxesContainer) popup.appendChild(editDaysCheckboxesContainer);
          popup.appendChild(btnRow);
          document.body.appendChild(popup);

          // If days checkboxes are added/removed, keep button row always at the bottom
          function updateButtonRowPosition() {
            // Remove btnRow if already present
            if (btnRow.parentNode) btnRow.parentNode.removeChild(btnRow);
            // Always append at the end
            popup.appendChild(btnRow);
          }
          editFrequencySelect.addEventListener("change", () => {
            updateDaysCheckboxesEdit();
            updateButtonRowPosition();
          });

          // Save logic
          saveBtn.addEventListener("click", () => {
            const newText = editInput.value.trim();
            const newTab = select.value;
            const newDifficulty = difficultySelect.value;
            const newFrequency = editFrequencySelect.value;

            let newSelectedDays = [];
            if (newFrequency === "weekly" && editDaysCheckboxesContainer) {
              newSelectedDays = Array.from(editDaysCheckboxesContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
              if (newSelectedDays.length === 0) {
                alert("Please select at least one day for a weekly chore.");
                return;
              }
            }

            if (!newText) return alert("Please enter chore text.");

            // If tab is changed, move to end of new tab
            if (newTab !== label) {
              // Remove old chore from current tab
              choreData[member.name][label].splice(choreIndex, 1);
              choreData[member.name][newTab].push(newText);
            } else {
              // Only update text/difficulty, keep position
              // Preserve object shape if original was an object
              if (typeof chore === 'string') choreData[member.name][label][choreIndex] = newText;
              else {
                const existing = choreData[member.name][label][choreIndex];
                if (existing && typeof existing === 'object') existing.title = newText;
                else choreData[member.name][label][choreIndex] = newText;
              }
            }
            // Save difficulty
            const newChoreKey = `${member.name}-${newText}`;
            choreDifficulties[newChoreKey] = newDifficulty;
            choreFrequencies[newChoreKey] = newFrequency;
            choreWeeklyDays[newChoreKey] = newSelectedDays;

            saveAll();
            renderBoard();
            updateChart();
            document.body.removeChild(popup);
          });

          // Delete logic
          deleteBtn.addEventListener("click", () => {
            showConfirmPopup(`Are you sure you want to delete the chore "${choreTitle}"?`, () => {
              choreData[member.name][label].splice(choreIndex, 1);
              // Remove difficulty, frequency, and weekly days entries
              const delChoreKey = `${member.name}-${choreTitle}`;
              delete choreDifficulties[delChoreKey];
              delete choreFrequencies[delChoreKey];
              delete choreWeeklyDays[delChoreKey];
              saveAll();
              renderBoard();
              updateChart();
              document.body.removeChild(popup);
            });
          });

          // Cancel logic
          cancelBtn.addEventListener("click", () => {
            document.body.removeChild(popup);
          });
        });

        li.addEventListener("click", () => {
          // Check if chore requires photo proof
          /*if (photoProofChores.some(photoChore => chore.toLowerCase().includes(photoChore.toLowerCase()))) {
            showPhotoProofModal(member, chore, () => {
              completeChore(member, label, choreIndex, chore);
            });
            return;
          }*/

          // Check difficulty and show modal if not set
          /* const choreKey = `${member.name}-${chore}`;
           if (!choreDifficulties[choreKey]) {
             showDifficultyModal(member, chore, () => {
               completeChore(member, label, choreIndex, chore);
             });
             return;
           }*/

          showConfirmPopup(`Mark chore "${choreTitle}" as completed?`, () => {
            // pass the original stored chore (object or string) to completeChore
            completeChore(member, label, choreIndex, chore);
          });
        });
        list.appendChild(li);
      });
      // Celebration container for emojis
      const celebrationContainer = document.createElement("div");
      celebrationContainer.className = "celebration-container";
      celebrationContainer.style.position = "relative";
      celebrationContainer.style.overflow = "visible";
      celebrationContainer.style.minHeight = "40px";

      // Congratulatory message container
      const congratsMessage = document.createElement("div");
      congratsMessage.className = "congrats-message";
      congratsMessage.style.position = "absolute";
      congratsMessage.style.top = "50%";
      congratsMessage.style.left = "50%";
      congratsMessage.style.transform = "translate(-50%, -50%)";
      congratsMessage.style.fontSize = "1.2rem";
      congratsMessage.style.fontWeight = "bold";
      congratsMessage.style.color = "#4a90e2";
      congratsMessage.style.userSelect = "none";
      congratsMessage.style.opacity = "0";
      congratsMessage.style.pointerEvents = "none";
      congratsMessage.style.transition = "opacity 0.4s ease";

      tabContent.appendChild(celebrationContainer);
      tabContent.appendChild(congratsMessage);


      //to call drag & drop handler
      addDragAndDropHandlers(list, member.name, label);

      tabContent.appendChild(list);
      tabContentsContainer.appendChild(tabContent);

      // Tab button click event
      /* tabBtn.addEventListener("click", () => {
         // Remove active class from all buttons and tab contents
         tabs.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
         tabContentsContainer.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));
 
         // Add active class to clicked tab and corresponding content
         tabBtn.classList.add("active");
         tabContent.classList.add("active");
       });*/
      tabBtn.addEventListener("click", () => {
        // Update activeTabs for this member
        activeTabs[member.name] = label;

        // Remove active classes from this member's tabs
        tabs.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
        tabContentsContainer.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));

        // Add active class to clicked tab and content
        tabBtn.classList.add("active");
        tabContent.classList.add("active");
      });

    });

    column.appendChild(tabs);
    column.appendChild(tabContentsContainer);

    // Stars and score row (unchanged)
    const statsRow = document.createElement("div");
    statsRow.className = "score-stars-row";
    const starsDiv = document.createElement("div");
    starsDiv.className = "stars";
    starsDiv.style.backgroundColor = shadeColor(member.color, -30);

    // Add stars count and remove/deduct icon
    starsDiv.innerHTML = `⭐ <span class="star-count">${starsData[member.name] || 0}</span> <span class="deduct-star-icon" title="Deduct stars" style="cursor:pointer; margin-left:6px; color:#b71c1c; font-size:1.1em; vertical-align:middle;">➖</span>`;
    // Deduct icon click handler with popup
    const deductIcon = starsDiv.querySelector('.deduct-star-icon');
    deductIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      let currentStars = starsData[member.name] || 0;
      if (currentStars <= 0) {
        alert('No stars to deduct!');
        return;
      }
      // Create popup
      const popup = document.createElement('div');
      popup.className = 'popup-overlay';
      popup.innerHTML = `
        <div class="popup-content" style="max-width:340px;">
          <h2>Deduct Stars</h2>
          <label>How many stars to deduct?<br><input type="number" id="deductStarsInput" min="1" max="${currentStars}" value="1" style="width:100%;margin-bottom:0.7rem;"></label><br>
          <label>Reason for deduction:<br><input type="text" id="deductReasonInput" maxlength="60" placeholder="Reason (optional)" style="width:100%;margin-bottom:0.7rem;"></label>
          <div style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:flex-end;">
            <button id="deductStarsConfirm">Deduct</button>
            <button id="deductStarsCancel">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(popup);
      document.getElementById('deductStarsInput').focus();
      document.getElementById('deductStarsConfirm').onclick = function () {
        const toDeduct = parseInt(document.getElementById('deductStarsInput').value);
        const reason = document.getElementById('deductReasonInput').value.trim();
        if (!toDeduct || isNaN(toDeduct) || toDeduct < 1) return;
        if (toDeduct > currentStars) {
          alert('Cannot deduct more stars than available!');
          return;
        }
        starsData[member.name] -= toDeduct;
        if (!redeemedRewards[member.name]) redeemedRewards[member.name] = [];
        redeemedRewards[member.name].push({
          name: reason ? `Manual Deduction: ${reason}` : 'Manual Deduction',
          cost: toDeduct,
          date: new Date().toDateString()
        });
        saveAll();
        document.body.removeChild(popup);
        renderBoard();
        updateChart && updateChart();
      };
      document.getElementById('deductStarsCancel').onclick = function () {
        document.body.removeChild(popup);
      };
    });

    const totalChores = Object.values(choreData[member.name]).reduce((acc, val) => acc + val.length, 0) + (starsData[member.name] || 0);
    const scoreDiv = document.createElement("div");
    scoreDiv.className = "score";
    scoreDiv.style.backgroundColor = shadeColor(member.color, -30);
    scoreDiv.textContent = `${starsData[member.name]} / ${totalChores}`;

    statsRow.appendChild(starsDiv);
    statsRow.appendChild(scoreDiv);
    column.appendChild(statsRow);

    // Add data attribute for easier targeting
    column.setAttribute('data-member', member.name);
    board.appendChild(column);
  });

  saveAll();
  // Fallback: ensure each member column has an active tab; if not, activate the first tab (Morning)
  try {
    document.querySelectorAll('#kanban .column').forEach(col => {
      const activeBtn = col.querySelector('.tab-button.active');
      if (!activeBtn) {
        const firstBtn = col.querySelector('.tab-button');
        if (firstBtn) firstBtn.click();
      }
    });
  } catch (e) { console.warn('auto-activate tab fallback failed', e); }
}

function completeChore(member, timeLabel, choreIndex, chore) {
  // Defensive guards: ensure data structures exist for this member
  if (!choreData[member.name]) {
    choreData[member.name] = { Morning: [], Afternoon: [], Evening: [] };
  }
  if (!Array.isArray(choreData[member.name][timeLabel])) {
    choreData[member.name][timeLabel] = [];
  }
  if (!starsData[member.name] && starsData[member.name] !== 0) starsData[member.name] = 0;
  if (!weeklyStars[member.name]) weeklyStars[member.name] = {};

  const choreKey = `${member.name}-${chore}`;
  const difficulty = choreDifficulties[choreKey] || 'easy';
  const starsEarned = difficultyStars[difficulty];

  choreData[member.name][timeLabel].splice(choreIndex, 1);
  starsData[member.name] += starsEarned;

  const today = getDayKey();
  if (!weeklyStars[member.name][today]) weeklyStars[member.name][today] = 0;
  weeklyStars[member.name][today] += starsEarned;

  // Log completed chore to dailyChoreLogs
  if (!dailyChoreLogs[member.name]) dailyChoreLogs[member.name] = [];
  dailyChoreLogs[member.name].push({
    chore,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    stars: starsEarned
  });
  localStorage.setItem('dailyChoreLogs', JSON.stringify(dailyChoreLogs));

  // Check achievements
  checkAchievements(member, chore, starsEarned);

  // Update family goals progress
  updateGoalsProgress(starsEarned);

  saveAll();

  // Check if all chores are completed for this member
  const totalChores = Object.values(choreData[member.name]).reduce((sum, chores) => sum + chores.length, 0);
  if (totalChores === 0) {
    triggerAllChoresCompleteAnimation(member);
  }

  //To show emojis + message for animation
  const emojis = ["🎉", "❤️", "✨", "🥳", "🎊", "💫"];
  const celebrationContainer = document.querySelector(`[data-member="${member.name}"] .celebration-container`);
  const congratsMessage = document.querySelector(`[data-member="${member.name}"] .congrats-message`);

  if (celebrationContainer && congratsMessage) {
    // Clear previous emojis/messages
    celebrationContainer.innerHTML = "";
    congratsMessage.textContent = `🎉 Great job, ${member.name}! +${starsEarned} ⭐`;
    congratsMessage.classList.add("show");

    // Remove message after 2 seconds
    setTimeout(() => {
      congratsMessage.classList.remove("show");
    }, 2000);

    // Create and animate emojis
    for (let i = 0; i < 7; i++) {
      const emojiSpan = document.createElement("span");
      emojiSpan.className = "celebration-emoji";
      emojiSpan.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      emojiSpan.style.left = (Math.random() * 80 + 10) + "%";
      emojiSpan.style.bottom = "0px";

      celebrationContainer.appendChild(emojiSpan);

      emojiSpan.addEventListener("animationend", () => {
        emojiSpan.remove();
      });
    }
  }

  renderBoard();
  updateChart();
}

// Voice Recognition System
function initVoiceRecognition() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    voiceRecognition = new SpeechRecognition();
    voiceRecognition.continuous = false;
    voiceRecognition.interimResults = false;
    voiceRecognition.lang = 'en-US';

    voiceRecognition.onstart = function () {
      document.getElementById('voiceStatus').textContent = 'Listening... Say something like "Add brush teeth to Mom morning"';
      document.getElementById('voiceButton').textContent = '🎤 Listening...';
    };

    voiceRecognition.onresult = function (event) {
      const result = event.results[0][0].transcript;
      document.getElementById('voiceResult').textContent = `You said: "${result}"`;
      processVoiceCommand(result);
    };

    voiceRecognition.onerror = function (event) {
      document.getElementById('voiceStatus').textContent = `Error: ${event.error}`;
      document.getElementById('voiceButton').textContent = '🎤 Start Listening';
    };

    voiceRecognition.onend = function () {
      document.getElementById('voiceButton').textContent = '🎤 Start Listening';
    };
  }
}

function processVoiceCommand(command) {
  const lowerCommand = command.toLowerCase();

  // Pattern: "add [chore] to [member] [time]"
  const addPattern = /add (.+) to (\w+) (morning|afternoon|evening)/i;
  const match = lowerCommand.match(addPattern);

  if (match) {
    const choreName = match[1].trim();
    const memberName = match[2].charAt(0).toUpperCase() + match[2].slice(1);
    const timeLabel = match[3].charAt(0).toUpperCase() + match[3].slice(1);

    const member = family.find(m => m.name.toLowerCase() === memberName.toLowerCase());

    if (member && timeSections.find(t => t.label === timeLabel)) {
      // Ensure structures exist
      if (!choreData[member.name]) choreData[member.name] = { Morning: [], Afternoon: [], Evening: [] };
      if (!Array.isArray(choreData[member.name][timeLabel])) choreData[member.name][timeLabel] = [];
      choreData[member.name][timeLabel].push(choreName);
      document.getElementById('voiceStatus').textContent = `✅ Added "${choreName}" to ${member.name}'s ${timeLabel} chores!`;
      saveAll();
      renderBoard();
      updateChart();
    } else {
      document.getElementById('voiceStatus').textContent = `❌ Could not find member "${memberName}" or time "${timeLabel}"`;
    }
  } else {
    document.getElementById('voiceStatus').textContent = `❌ Could not understand command. Try: "Add brush teeth to Mom morning"`;
  }
}

// Achievement System
function checkAchievements(member, chore, starsEarned) {
  if (!achievements[member.name]) achievements[member.name] = {};

  const memberAchievements = achievements[member.name];
  const today = getDayKey();

  // First chore of the day
  if (starsData[member.name] === starsEarned) {
    awardBadge(member.name, 'early_bird', 'Early Bird', '🌅', 'First chore of the day!');
  }

  // Streak achievements
  const streak = calculateStreak(member.name);
  if (streak === 7 && !memberAchievements['week_warrior']) {
    awardBadge(member.name, 'week_warrior', 'Week Warrior', '🔥', '7 days in a row!');
  } else if (streak === 30 && !memberAchievements['month_master']) {
    awardBadge(member.name, 'month_master', 'Month Master', '👑', '30 days in a row!');
  }

  // Star milestones
  const totalStars = getTotalLifetimeStars(member.name);
  if (totalStars >= 100 && !memberAchievements['century_club']) {
    awardBadge(member.name, 'century_club', 'Century Club', '💯', '100 total stars earned!');
  } else if (totalStars >= 500 && !memberAchievements['star_collector']) {
    awardBadge(member.name, 'star_collector', 'Star Collector', '⭐', '500 total stars earned!');
  }

  // Difficulty achievements
  if (choreDifficulties[`${member.name}-${chore}`] === 'hard' && !memberAchievements['challenge_accepted']) {
    awardBadge(member.name, 'challenge_accepted', 'Challenge Accepted', '💪', 'Completed a hard chore!');
  }
}

function awardBadge(memberName, badgeId, badgeName, emoji, description) {
  if (!achievements[memberName]) achievements[memberName] = {};
  achievements[memberName][badgeId] = {
    name: badgeName,
    emoji: emoji,
    description: description,
    earnedDate: new Date().toISOString()
  };

  // Show achievement notification
  showAchievementNotification(memberName, badgeName, emoji, description);
  saveAll();
}

function showModal(modal) {
  const modalContent = modal.querySelector('.popup-content') || modal.querySelector('.modal-content');
  modal.style.display = 'flex';

  requestAnimationFrame(() => {
    modal.classList.add('active');

    if (modalContent) {
      modalContent.style.transform = 'scale(0.85) translateY(20px)';
      modalContent.style.opacity = '0';

      requestAnimationFrame(() => {
        modalContent.classList.add('show');
        modalContent.style.transform = 'scale(1) translateY(0)';
        modalContent.style.opacity = '1';
      });
    }
  });
}

function hideModal(modal) {
  const modalContent = modal.querySelector('.popup-content') || modal.querySelector('.modal-content');

  if (modalContent) {
    modalContent.classList.remove('show');
    modalContent.style.transform = 'scale(0.85) translateY(20px)';
    modalContent.style.opacity = '0';
  }

  modal.classList.remove('active');

  setTimeout(() => {
    modal.style.display = 'none';
    if (modalContent) {
      modalContent.style.transform = '';
      modalContent.style.opacity = '';
    }
  }, 400);
}
// Close Goals Modal functionality
const closeGoalsModalBtn = document.getElementById('closeGoalsModal');
if (closeGoalsModalBtn) {
  closeGoalsModalBtn.addEventListener('click', () => {
    hideModal(goalsModal);
  });
}

function showAchievementNotification(memberName, badgeName, emoji, description) {
  const notification = document.createElement('div');
  notification.className = 'achievement-notification';
  notification.innerHTML = `
    <div class="achievement-content">
      <span class="achievement-emoji">${emoji}</span>
      <div class="achievement-text">
        <strong>${memberName} earned:</strong><br>
        ${badgeName}<br>
        <small>${description}</small>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 100);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 4000);
}

// Global handler: clicking outside popup-content or pressing Escape closes top-most popup-overlay
document.addEventListener('click', (e) => {
  try {
    const overlays = Array.from(document.querySelectorAll('.popup-overlay'));
    if (!overlays || overlays.length === 0) return;
    const top = overlays[overlays.length - 1];
    if (!top) return;
    // If click target is the overlay itself (i.e., outside content), close it
    if (e.target === top) {
      top.remove();
    }
  } catch (err) { /* ignore */ }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlays = Array.from(document.querySelectorAll('.popup-overlay'));
    if (overlays && overlays.length) {
      overlays[overlays.length - 1].remove();
    }
  }
});

function calculateStreak(memberName) {
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dateKey = checkDate.toISOString().split("T")[0];

    if (weeklyStars[memberName] && weeklyStars[memberName][dateKey] > 0) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function getTotalLifetimeStars(memberName) {
  if (!weeklyStars[memberName]) return 0;
  return Object.values(weeklyStars[memberName]).reduce((sum, stars) => sum + stars, 0);
}

// Family Goals System
function updateGoalsProgress(starsEarned) {
  const today = getDayKey();

  familyGoals.forEach(goal => {
    if (goal.active && goal.endDate >= today) {
      goal.currentProgress += starsEarned;

      if (goal.currentProgress >= goal.target && !goal.completed) {
        goal.completed = true;
        goal.completedDate = today;
        showGoalCompletedNotification(goal);
      }
    }
  });

  saveAll();
}

function showGoalCompletedNotification(goal) {
  const notification = document.createElement('div');
  notification.className = 'goal-notification';
  notification.innerHTML = `
    <div class="goal-content">
      <span class="goal-emoji">🎯</span>
      <div class="goal-text">
        <strong>Family Goal Achieved!</strong><br>
        ${goal.title}<br>
        <small>Reward: ${goal.reward}</small>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 100);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 5000);
}

// Photo Proof System
/*function showPhotoProofModal(member, chore, onComplete) {
  const modal = document.getElementById('photoModal');
  const choreInfo = document.getElementById('photoChoreInfo');

  choreInfo.textContent = `📸 Take a photo to prove "${chore}" is completed by ${member.name}`;
  currentPhotoChore = { member, chore, onComplete };

  modal.style.display = 'block';
}*/

// Difficulty Selection System
function showDifficultyModal(member, chore, onComplete) {
  const modal = document.getElementById('difficultyModal');
  const choreInfo = document.getElementById('difficultyChoreInfo');

  choreInfo.textContent = `Select difficulty level for "${chore}" - ${member.name}`;
  currentDifficultyChore = { member, chore, onComplete };

  modal.style.display = 'block';
}

// Notification System
function initNotifications() {
  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      showNotificationBanner();
    } else if (Notification.permission === 'granted') {
      scheduleReminders();
    }
  }
}

function showNotificationBanner() {
  const banner = document.getElementById('notificationBanner');
  banner.style.display = 'flex';

  document.getElementById('enableNotifications').addEventListener('click', () => {
    Notification.requestPermission().then(permission => {
      notificationPermission = permission;
      localStorage.setItem('notificationPermission', permission);
      banner.style.display = 'none';

      if (permission === 'granted') {
        scheduleReminders();
      }
    });
  });

  document.getElementById('dismissNotifications').addEventListener('click', () => {
    banner.style.display = 'none';
    localStorage.setItem('notificationPermission', 'dismissed');
  });
}

function scheduleReminders() {
  // Schedule reminders for incomplete chores
  const now = new Date();
  const reminderTimes = [
    { hour: 8, minute: 0, period: 'Morning' },
    { hour: 14, minute: 0, period: 'Afternoon' },
    { hour: 19, minute: 0, period: 'Evening' }
  ];

  reminderTimes.forEach(time => {
    const reminderTime = new Date();
    reminderTime.setHours(time.hour, time.minute, 0, 0);

    if (reminderTime > now) {
      const timeUntilReminder = reminderTime.getTime() - now.getTime();
      setTimeout(() => {
        sendChoreReminders(time.period);
      }, timeUntilReminder);
    }
  });
}

function sendChoreReminders(period) {
  family.forEach(member => {
    const chores = choreData[member.name][period] || [];
    if (chores.length > 0) {
      new Notification(`Chore Reminder for ${member.name}`, {
        body: `${chores.length} ${period.toLowerCase()} chores remaining!`,
        icon: '⭐',
        tag: `chore-reminder-${member.name}-${period}`
      });
    }
  });
}

function resetDailyChores() {
  // Only clear daily logs/history, not main data
  dailyChoreLogs = {};
  dailyDeductLogs = {};
  lastReset = new Date().toDateString();
  localStorage.setItem('dailyChoreLogs', JSON.stringify(dailyChoreLogs));
  localStorage.setItem('dailyDeductLogs', JSON.stringify(dailyDeductLogs));
  localStorage.setItem('lastReset', lastReset);
  // Optionally, update UI if needed
  renderBoard();
  updateChart();
}

function autoResetDaily() {
  const today = new Date().toDateString();
  if (lastReset !== today) resetDailyChores();
}

function saveAll() {
  try {
    localStorage.setItem("family", JSON.stringify(family));
    localStorage.setItem("choreData", JSON.stringify(choreData));
    localStorage.setItem("starsData", JSON.stringify(starsData));
    localStorage.setItem("weeklyStars", JSON.stringify(weeklyStars));
    localStorage.setItem("lastReset", lastReset);
    localStorage.setItem("activeTabs", JSON.stringify(activeTabs));
    localStorage.setItem("achievements", JSON.stringify(achievements));
    localStorage.setItem("familyGoals", JSON.stringify(familyGoals));
    localStorage.setItem("rewards", JSON.stringify(rewards));
    localStorage.setItem("redeemedRewards", JSON.stringify(redeemedRewards));
    // localStorage.setItem("chorePhotos", JSON.stringify(chorePhotos));
    localStorage.setItem("choreDifficulties", JSON.stringify(choreDifficulties));
    localStorage.setItem("choreFrequencies", JSON.stringify(choreFrequencies));
    localStorage.setItem("choreWeeklyDays", JSON.stringify(choreWeeklyDays));
    // Save to Firestore (if user is logged in)
    const user = firebase.auth().currentUser;
    if (user) {
      const userDoc = db.collection("users").doc(user.uid);
      userDoc.set({
        family,
        choreData,
        starsData,
        weeklyStars,
        lastReset,
        achievements,
        rewards,
        redeemedRewards,
        choreDifficulties,
        choreFrequencies,
        choreWeeklyDays
      }).then(() => {
        console.log("Data synced to Firestore!");
      }).catch((error) => {
        console.error("Error syncing data to Firestore:", error);
      });
    }
  } catch (error) {
    console.error('Error saving data:', error);
  }
}


// Modal Event Listeners
function initModalEventListeners() {
  // Voice Modal
  const voiceButton = document.getElementById('voiceButton');
  const closeVoiceModal = document.getElementById('closeVoiceModal');

  if (voiceButton) {
    voiceButton.addEventListener('click', () => {
      if (voiceRecognition) {
        voiceRecognition.start();
      } else {
        document.getElementById('voiceStatus').textContent = 'Voice recognition not supported in this browser';
      }
    });
  }

  // Photo Modal
  //const photoModal = document.getElementById('photoModal');
  //const startCamera = document.getElementById('startCamera');
  //const takePhoto = document.getElementById('takePhoto');
  //const confirmPhoto = document.getElementById('confirmPhoto');
  //const retakePhoto = document.getElementById('retakePhoto');

  /*if (startCamera) {
    startCamera.addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = document.getElementById('cameraPreview');
        video.srcObject = stream;
        video.style.display = 'block';
        startCamera.style.display = 'none';
        takePhoto.style.display = 'inline-block';
      } catch (error) {
        alert('Camera access denied or not available');
      }
    });
  }

  if (takePhoto) {
    takePhoto.addEventListener('click', () => {
      const video = document.getElementById('cameraPreview');
      const canvas = document.getElementById('photoCanvas');
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);

      const photoData = canvas.toDataURL('image/jpeg', 0.8);
      document.getElementById('photoPreview').innerHTML = `<img src="${photoData}" style="max-width: 100%; border-radius: 10px;">`;

      takePhoto.style.display = 'none';
      confirmPhoto.style.display = 'inline-block';
      retakePhoto.style.display = 'inline-block';
    });
  }

  if (confirmPhoto) {
    confirmPhoto.addEventListener('click', () => {
      const photoData = document.getElementById('photoCanvas').toDataURL('image/jpeg', 0.8);
      const choreKey = `${currentPhotoChore.member.name}-${currentPhotoChore.chore}`;
      chorePhotos[choreKey] = photoData;

      // Stop camera
      const video = document.getElementById('cameraPreview');
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
      }

      photoModal.style.display = 'none';
      currentPhotoChore.onComplete();
      saveAll();
    });
  }*/

  // Difficulty Modal
  const difficultyModal = document.getElementById('difficultyModal');
  const difficultyButtons = document.querySelectorAll('.difficulty-btn');

  difficultyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const difficulty = btn.dataset.difficulty;
      const choreKey = `${currentDifficultyChore.member.name}-${currentDifficultyChore.chore}`;
      choreDifficulties[choreKey] = difficulty;

      difficultyModal.style.display = 'none';
      currentDifficultyChore.onComplete();
      saveAll();
    });
  });

  // Add Goal Modal functionality
  const addGoalBtn = document.getElementById('addGoalBtn');
  if (addGoalBtn) {
    addGoalBtn.addEventListener('click', () => {
      const title = prompt('Goal Title:');
      if (!title) return;

      const description = prompt('Goal Description:');
      if (!description) return;

      const target = parseInt(prompt('Target Stars:'));
      if (!target || target <= 0) return;

      const reward = prompt('Reward for completing this goal:');
      if (!reward) return;

      const endDate = prompt('End Date (DD-MM-YYYY):');
      if (!endDate) return;

      const newGoal = {
        id: Date.now().toString(),
        title,
        description,
        target,
        currentProgress: 0,
        reward,
        endDate,
        active: true,
        completed: false
      };

      familyGoals.push(newGoal);
      saveAll();
      renderGoals();
      showModal(goalsModal);  // Show modal with enhanced animation
    });
  }

  // Add Reward Modal functionality
  const addRewardBtn = document.getElementById('addRewardBtn');
  if (addRewardBtn) {
    addRewardBtn.addEventListener('click', () => {
      // Create interactive popup for adding a new reward
      const popup = document.createElement('div');
      popup.className = 'popup-overlay';
      popup.innerHTML = `
        <div class="popup-content">
          <h2>Add New Reward</h2>
          <label>Name:<br><input type="text" id="newRewardName" style="width:100%;margin-bottom:0.5rem;"></label><br>
          <label>Description:<br><input type="text" id="newRewardDesc" style="width:100%;margin-bottom:0.5rem;"></label><br>
          <label>Cost (⭐):<br><input type="number" id="newRewardCost" min="1" style="width:100%;margin-bottom:0.5rem;"></label><br>
          <div style="margin-top:1rem;display:flex;gap:0.5rem;">
            <button id="saveNewReward">Add</button>
            <button id="cancelNewReward">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(popup);

      document.getElementById('saveNewReward').onclick = function () {
        const name = document.getElementById('newRewardName').value.trim();
        const description = document.getElementById('newRewardDesc').value.trim();
        const cost = parseInt(document.getElementById('newRewardCost').value);
        if (!name || !description || isNaN(cost) || cost < 1) {
          alert('Please fill all fields correctly.');
          return;
        }
        const newReward = {
          id: Date.now(),
          name,
          description,
          cost
        };
        rewards.push(newReward);
        saveAll();
        renderRewards();
        document.body.removeChild(popup);
      };
      document.getElementById('cancelNewReward').onclick = function () {
        document.body.removeChild(popup);
      };
    });
  }

  // Leaderboard tabs
  const leaderboardTabs = document.querySelectorAll('.leaderboard-tabs .tab-btn');
  leaderboardTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      leaderboardTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderLeaderboard();
    });
  });

  // Close modal functionality
  const modals = ['voiceModal', 'photoModal', 'badgesModal', 'goalsModal', 'rewardModal', 'leaderboardModal', 'difficultyModal'];
  modals.forEach(modalId => {
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById(`close${modalId.charAt(0).toUpperCase() + modalId.slice(1, -5)}Modal`);

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';

        // Stop camera if photo modal is being closed
        /* if (modalId === 'photoModal') {
           const video = document.getElementById('cameraPreview');
           if (video.srcObject) {
             video.srcObject.getTracks().forEach(track => track.stop());
           }
         }*/
      });
    }

    window.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';

        /*if (modalId === 'photoModal') {
          const video = document.getElementById('cameraPreview');
          if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
          }
        }*/
      }
    });
  });
}

function updateChart() {
  const ctx = document.getElementById("progressChart");
  const labels = family.map((m) => m.name);
  const data = family.map((m) => starsData[m.name] || 0);
  const colors = family.map((m) => m.color + "CC");

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
  } else {
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Chores Completed Today",
          data,
          backgroundColor: colors,
          borderColor: colors.map(c => c.replace("CC", "FF")),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Stars" }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}

// Title avatar functionality
let titleAvatarData = localStorage.getItem("titleAvatarData") || null;

function initTitleAvatar() {
  const titleAvatar = document.getElementById("titleAvatar");
  if (titleAvatarData) {
    titleAvatar.style.backgroundImage = `url(${titleAvatarData})`;
    titleAvatar.style.backgroundSize = "cover";
    titleAvatar.style.backgroundPosition = "center";
    titleAvatar.textContent = "";
  }

  titleAvatar.addEventListener("click", showTitleAvatarPopup);

  // Make title text editable
  const titleText = document.querySelector('#pageTitle span:last-child');
  if (titleText) {
    titleText.addEventListener("click", showTitleEditPopup);
    titleText.style.cursor = "pointer";
    titleText.title = "Click to edit title";
  }
}

function showTitleEditPopup() {
  const currentTitle = document.querySelector('#pageTitle span:last-child').textContent;
  const popup = document.createElement("div");
  popup.className = "popup-overlay";
  popup.innerHTML = `
    <div class="popup-content">
      <h2>Edit Title</h2>
      <label>
        Title Text:
        <input type="text" id="titleTextInput" value="${currentTitle}" style="margin-top: 0.5rem;" />
      </label>
      <div class="popup-buttons">
        <button id="titleTextConfirm">Save</button>
        <button id="titleTextCancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  const titleInput = document.getElementById("titleTextInput");
  const confirmBtn = document.getElementById("titleTextConfirm");
  const cancelBtn = document.getElementById("titleTextCancel");

  titleInput.focus();
  titleInput.select();

  confirmBtn.addEventListener("click", () => {
    const newTitle = titleInput.value.trim();
    if (newTitle) {
      document.querySelector('#pageTitle span:last-child').textContent = newTitle;
      localStorage.setItem("familyChoresTitle", newTitle);
    }
    document.body.removeChild(popup);
  });

  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(popup);
  });

  // Save on Enter key
  titleInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      confirmBtn.click();
    }
  });
}

function loadCustomTitle() {
  const savedTitle = localStorage.getItem("familyChoresTitle");
  if (savedTitle) {
    const titleText = document.querySelector('#pageTitle span:last-child');
    if (titleText) {
      titleText.textContent = savedTitle;
    }
  }
}

function showTitleAvatarPopup() {
  const popup = document.createElement("div");
  popup.className = "popup-overlay";
  popup.innerHTML = `
    <div class="popup-content">
      <h2>Change Title Avatar</h2>
      <div style="text-align: center; margin-bottom: 1rem;">
        <div class="avatar-preview" style="width: 80px; height: 80px; border-radius: 50%; margin: 0 auto; background: linear-gradient(135deg, #4a90e2, #357abd); display: flex; align-items: center; justify-content: center; font-size: 2rem; color: white; font-weight: bold; ${titleAvatarData ? `background-image: url(${titleAvatarData}); background-size: cover; background-position: center;` : ''}">${titleAvatarData ? '' : '👨‍👩‍👧‍👦'}</div>
      </div>
      <label>
        Upload Picture (optional):
        <input type="file" id="titleAvatarFileInput" accept="image/*" style="margin-top: 0.5rem;" />
      </label>
      <div class="popup-buttons">
        <button id="titleAvatarConfirm">Save</button>
        <button id="titleAvatarRemove">Remove Picture</button>
        <button id="titleAvatarCancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  const fileInput = document.getElementById("titleAvatarFileInput");
  const preview = popup.querySelector(".avatar-preview");
  const confirmBtn = document.getElementById("titleAvatarConfirm");
  const removeBtn = document.getElementById("titleAvatarRemove");
  const cancelBtn = document.getElementById("titleAvatarCancel");

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        preview.style.backgroundImage = `url(${e.target.result})`;
        preview.style.backgroundSize = "cover";
        preview.style.backgroundPosition = "center";
        preview.textContent = "";
      };
      reader.readAsDataURL(file);
    }
  });

  confirmBtn.addEventListener("click", () => {
    const file = fileInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        titleAvatarData = e.target.result;
        localStorage.setItem("titleAvatarData", titleAvatarData);
        const titleAvatar = document.getElementById("titleAvatar");
        titleAvatar.style.backgroundImage = `url(${titleAvatarData})`;
        titleAvatar.style.backgroundSize = "cover";
        titleAvatar.style.backgroundPosition = "center";
        titleAvatar.textContent = "";
        document.body.removeChild(popup);
      };
      reader.readAsDataURL(file);
    } else {
      document.body.removeChild(popup);
    }
  });

  removeBtn.addEventListener("click", () => {
    titleAvatarData = null;
    localStorage.removeItem("titleAvatarData");
    const titleAvatar = document.getElementById("titleAvatar");
    titleAvatar.style.backgroundImage = "";
    titleAvatar.textContent = "👨‍👩‍👧‍👦";
    document.body.removeChild(popup);
  });

  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(popup);
  });
}

// Render Functions for New Features
// Add Daily Logs button to the page (top right corner)
function addDailyLogsButton() {
  let btn = document.getElementById('dailyLogsBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'dailyLogsBtn';
    btn.textContent = 'Daily Logs';
    btn.style.position = 'fixed';
    btn.style.top = '1.5rem';
    btn.style.right = '1.5rem';
    btn.style.zIndex = 2100;
    btn.style.background = '#7e2f27ff';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '8px';
    btn.style.padding = '0.7rem 1.5rem';
    btn.style.fontWeight = 'bold';
    btn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.12)';
    btn.onclick = showDailyLogsPopup;
    document.body.appendChild(btn);
  }
}

// Call this after page load
window.addEventListener('DOMContentLoaded', addDailyLogsButton);
// Show daily logs popup
function showDailyLogsPopup() {
  const popup = document.createElement('div');
  popup.className = 'popup-overlay';
  let html = `<div class="popup-content" style="max-width:900px;max-height:80vh;overflow-y:auto;position:relative;z-index:2100;padding-top:18px;padding-bottom:18px;">
  <button id="closeDailyLogsTop" aria-label="Close" style="position:absolute;right:12px;top:12px;border:none;background:#7e2f27ff;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,0.12);color:#fff;width:40px;height:40px;font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .12s ease, box-shadow .12s ease;">×</button>
    <h2 style="text-align:center;margin-top:6px;">Daily Logs</h2>
    <div style="display:flex;gap:1.5rem;flex-wrap:wrap;justify-content:center;">`;
  family.forEach(member => {
    // Completed chores
    const completed = (dailyChoreLogs[member.name] || []).map(log => `<span style='display:inline-block;background:#e3fcec;color:#2c7a7b;padding:0.3rem 0.7rem;border-radius:6px;margin:0.15rem 0.2rem;font-size:0.95rem;'>${log.chore} <small>(${log.time})</small></span>`).join('');
    // Deducted stars
    const deducted = (dailyDeductLogs[member.name] || []).map(log => `<span style='display:inline-block;background:#ffeaea;color:#c0392b;padding:0.3rem 0.7rem;border-radius:6px;margin:0.15rem 0.2rem;font-size:0.95rem;'>-${log.amount} ⭐ <small>(${log.reason})</small></span>`).join('');
    // Earned stars (from completed chores)
    const earned = (dailyChoreLogs[member.name] || []).reduce((sum, log) => sum + (log.stars || 0), 0);
    // Redeemed rewards (subtract cost from earned stars)
    const redeemed = Array.isArray(redeemedRewards[member.name])
      ? redeemedRewards[member.name].filter(r => r.date === new Date().toDateString())
      : [];
    const redeemedHtml = redeemed.length ? redeemed.map(r => `<span style='display:inline-block;background:#f7e9ff;color:#7e2f27;padding:0.3rem 0.7rem;border-radius:6px;margin:0.15rem 0.2rem;font-size:0.95rem;'>${r.name} (-${r.cost} ⭐)</span>`).join('') : '<span style="color:#aaa;">None</span>';
    // Deducted stars (manual deductions)
    const deductedStars = (dailyDeductLogs[member.name] || []).reduce((sum, log) => sum + (log.amount || 0), 0);
    // Net stars for the day
    const netStars = earned - deductedStars - redeemed.reduce((sum, r) => sum + (r.cost || 0), 0);
    // Total lifetime stars
    const lifetimeStars = starsData[member.name] || 0;
    html += `<div style="background:#f9f9f9;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.07);padding:1.2rem 1.5rem;min-width:220px;max-width:320px;flex:1;display:flex;flex-direction:column;align-items:flex-start;">
      <h3 style="margin-bottom:0.7rem;color:#4a90e2;">${member.name}</h3>
      <div style="margin-bottom:0.5rem;"><strong>Completed Chores:</strong><br>${completed || '<span style=\"color:#aaa;\">None</span>'}</div>
      <div style="margin-bottom:0.5rem;"><strong>Deducted Stars:</strong><br>${deducted || '<span style=\"color:#aaa;\">None</span>'}</div>
      <div style="margin-bottom:0.5rem;"><strong>Earned Stars (Today):</strong> <span style="color:#f39c12;">${earned} ⭐</span></div>
      <div style="margin-bottom:0.5rem;"><strong>Net Stars (Today, after deductions & rewards):</strong> <span style="color:#2c3e50;">${netStars} ⭐</span></div>
      <div style="margin-bottom:0.5rem;"><strong>Total Lifetime Stars:</strong> <span style="color:#357abd;">${lifetimeStars} ⭐</span></div>
      <div style="margin-bottom:0.5rem;"><strong>Redeemed Rewards:</strong><br>${redeemedHtml}</div>
    </div>`;
  });
  html += `</div><div style="text-align:right;"><button id="closeDailyLogs" style="margin-top:1.5rem;padding:0.5rem 1.2rem;border-radius:6px;background:#7e2f27ff;color:white;border:none;">Close</button></div></div>`;
  popup.innerHTML = html;
  document.body.appendChild(popup);
  // Top-right close button (inside popup)
  const topClose = popup.querySelector('#closeDailyLogsTop');
  if (topClose) topClose.addEventListener('click', () => { if (popup && popup.parentNode) popup.parentNode.removeChild(popup); });

  // Bottom close button (existing)
  const bottomClose = popup.querySelector('#closeDailyLogs');
  if (bottomClose) bottomClose.addEventListener('click', () => { if (popup && popup.parentNode) popup.parentNode.removeChild(popup); });

  // Clicking outside the popup-content (on the overlay) should close it
  popup.addEventListener('click', (e) => {
    if (e.target === popup) {
      if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
    }
  });

  // Close on Escape for this overlay
  const escHandler = (e) => { if (e.key === 'Escape') { if (popup && popup.parentNode) popup.parentNode.removeChild(popup); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}
function renderBadges() {
  const content = document.getElementById('badgesContent');
  let html = '';

  family.forEach(member => {
    html += `<div class="member-badges">
      <h3>${member.name}'s Badges</h3>
      <div class="badges-grid">`;

    const memberAchievements = achievements[member.name] || {};

    if (Object.keys(memberAchievements).length === 0) {
      html += '<p class="no-badges">No badges earned yet. Complete chores to earn achievements!</p>';
    } else {
      Object.values(memberAchievements).forEach(badge => {
        html += `
          <div class="badge-item">
            <span class="badge-emoji">${badge.emoji}</span>
            <div class="badge-info">
              <strong>${badge.name}</strong>
              <p>${badge.description}</p>
              <small>Earned: ${new Date(badge.earnedDate).toLocaleDateString()}</small>
            </div>
          </div>
        `;
      });
    }

    html += '</div></div>';
  });

  content.innerHTML = html;
}

function renderGoals() {
  const content = document.getElementById('goalsContent');
  let html = '';

  if (familyGoals.length === 0) {
    html = '<p class="no-goals">No family goals set. Create a goal to work together!</p>';
  } else {
    familyGoals.forEach(goal => {
      const progress = Math.min((goal.currentProgress / goal.target) * 100, 100);
      const status = goal.completed ? '✅ Completed' : goal.active ? '🔄 Active' : '⏸️ Inactive';

      html += `
        <div class="goal-item ${goal.completed ? 'completed' : ''}">
          <div class="goal-header">
            <h4>${goal.title}</h4>
            <span class="goal-status">${status}</span>
          </div>
          <p>${goal.description}</p>
          <div class="goal-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="progress-text">${goal.currentProgress} / ${goal.target} ⭐</span>
                   </div>
          <div class="goal-details">
            <span class="goal-reward">🎁 ${goal.reward}</span>
            <span class="goal-deadline">📅 ${new Date(goal.endDate).toLocaleDateString()}</span>
          </div>
          ${goal.completed ? '' : `<button onclick="deleteGoal('${goal.id}')">🗑️ Delete</button>`}
        </div>
      `;
    });
  }

  content.innerHTML = html;
}

function renderRewards() {
  const content = document.getElementById('rewardContent');
  let html = '<div class="rewards-grid">';

  rewards.forEach(reward => {
    const canAfford = family.some(member => starsData[member.name] >= reward.cost);

    html += `
      <div class="reward-item ${canAfford ? 'affordable' : 'expensive'}">
        <h4>${reward.name}</h4>
        <p>${reward.description}</p>
        <div class="reward-cost">💰 ${reward.cost} ⭐</div>
        <select class="member-select" data-reward-id="${reward.id}">
          <option value="">Choose member</option>
          ${family.map(member =>
      `<option value="${member.name}" ${starsData[member.name] >= reward.cost ? '' : 'disabled'}>
              ${member.name} (${starsData[member.name]} ⭐)
            </option>`
    ).join('')}
        </select>
        <div class="reward-btn-row" style="display:flex; gap:0.5rem; margin-top:0.7rem; align-items:center; flex-wrap:wrap;">
          <button onclick="redeemReward(${reward.id})" class="redeem-btn">🎁 Redeem</button>
          <button class="edit-reward-btn" data-reward-id="${reward.id}" style="color:#1976d2;">✏️ Edit</button>
          <button class="delete-reward-btn" data-reward-id="${reward.id}" style="color:#b71c1c;">🗑️ Delete</button>
        </div>
      </div>
    `;
  });



  html += '</div>';
  content.innerHTML = html;

  // Add event listeners for edit and delete buttons
  content.querySelectorAll('.edit-reward-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const rewardId = parseInt(this.getAttribute('data-reward-id'));
      showEditRewardPopup(rewardId);
    });
  });
  content.querySelectorAll('.delete-reward-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const rewardId = parseInt(this.getAttribute('data-reward-id'));
      deleteReward(rewardId);
    });
  });
}

// Show popup to edit a reward
function showEditRewardPopup(rewardId) {
  const reward = rewards.find(r => r.id === rewardId);
  if (!reward) return;

  const popup = document.createElement('div');
  popup.className = 'popup-overlay';
  popup.innerHTML = `
    <div class="popup-content">
      <h2>Edit Reward</h2>
      <label>Name:<br><input type="text" id="editRewardName" value="${reward.name}" style="width:100%;margin-bottom:0.5rem;"></label><br>
      <label>Description:<br><input type="text" id="editRewardDesc" value="${reward.description}" style="width:100%;margin-bottom:0.5rem;"></label><br>
      <label>Cost (⭐):<br><input type="number" id="editRewardCost" value="${reward.cost}" min="1" style="width:100%;margin-bottom:0.5rem;"></label><br>
      <div style="margin-top:1rem;display:flex;gap:0.5rem;">
        <button id="saveEditReward">Save</button>
        <button id="cancelEditReward">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);

  document.getElementById('saveEditReward').onclick = function () {
    const newName = document.getElementById('editRewardName').value.trim();
    const newDesc = document.getElementById('editRewardDesc').value.trim();
    const newCost = parseInt(document.getElementById('editRewardCost').value);
    if (!newName || !newDesc || isNaN(newCost) || newCost < 1) {
      alert('Please fill all fields correctly.');
      return;
    }
    reward.name = newName;
    reward.description = newDesc;
    reward.cost = newCost;
    saveAll();
    renderRewards();
    document.body.removeChild(popup);
  };
  document.getElementById('cancelEditReward').onclick = function () {
    document.body.removeChild(popup);
  };
}

// Delete a reward
function deleteReward(rewardId) {
  const reward = rewards.find(r => r.id === rewardId);
  if (!reward) return;
  showConfirmPopup(`Are you sure you want to delete the reward "${reward.name}"?`, () => {
    rewards = rewards.filter(r => r.id !== rewardId);
    saveAll();
    renderRewards();
  });
}

// Show a custom confirmation popup (global)
function showConfirmPopup(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.style.zIndex = 9999;
  overlay.innerHTML = `
    <div class="popup-content" style="max-width:350px;text-align:center;">
      <p style="margin-bottom:1.5rem;">${message}</p>
      <div style="display:flex;justify-content:center;gap:1rem;">
        <button id="confirmYes" style="background:#7e2f27ff;color:white;padding:0.5rem 1.2rem;border:none;border-radius:6px;">Yes</button>
        <button id="confirmNo" style="background:#ccc;color:#222;padding:0.5rem 1.2rem;border:none;border-radius:6px;">No</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#confirmYes').onclick = () => {
    document.body.removeChild(overlay);
    if (onConfirm) onConfirm();
  };
  overlay.querySelector('#confirmNo').onclick = () => {
    document.body.removeChild(overlay);
  };
}

function renderLeaderboard() {
  const content = document.getElementById('leaderboardContent');
  const period = document.querySelector('.tab-btn.active').dataset.period;

  let rankings = [];

  // Always show current total stars (after redemptions) for each member
  rankings = family.map(member => {
    return { name: member.name, stars: starsData[member.name] || 0, color: member.color };
  });

  rankings.sort((a, b) => b.stars - a.stars);

  const titles = ['👑 Champion', '🥈 Runner-up', '🥉 Third Place', '⭐ Star Player'];

  let html = '<div class="leaderboard-list">';
  rankings.forEach((member, index) => {
    const title = titles[index] || '🌟 Participant';
    html += `
      <div class="leaderboard-item" style="border-left: 4px solid ${member.color}">
        <span class="rank">#${index + 1}</span>
        <span class="member-name">${member.name}</span>
        <span class="member-title">${title}</span>
        <span class="member-stars">${member.stars} ⭐</span>
      </div>
    `;
  });
  html += '</div>';

  content.innerHTML = html;
}

// Helper Functions
function deleteGoal(goalId) {
  if (confirm('Are you sure you want to delete this goal?')) {
    familyGoals = familyGoals.filter(goal => goal.id !== goalId);
    saveAll();
    renderGoals();
  }
}

function redeemReward(rewardId) {
  const select = document.querySelector(`select[data-reward-id="${rewardId}"]`);
  const memberName = select.value;

  if (!memberName) {
    alert('Please select a family member');
    return;
  }

  const reward = rewards.find(r => r.id === rewardId);
  const member = family.find(m => m.name === memberName);

  if (starsData[memberName] < reward.cost) {
    alert(`${memberName} doesn't have enough stars!`);
    return;
  }

  if (confirm(`Redeem "${reward.name}" for ${memberName}? This will cost ${reward.cost} ⭐`)) {
    starsData[memberName] -= reward.cost;

    if (!redeemedRewards[memberName]) redeemedRewards[memberName] = [];
    redeemedRewards[member.name].push({
      name: reward.name,
      cost: reward.cost,
      date: new Date().toDateString()
    });
    localStorage.setItem('redeemedRewards', JSON.stringify(redeemedRewards));
    saveAll();
    renderRewards();
    renderLeaderboard();
    renderRewards();
    updateChart();

    alert(`🎉 ${memberName} redeemed "${reward.name}"! Enjoy your reward!`);
  }
}

// (Initialization moved to the primary DOMContentLoaded handler earlier in the file)
//document.getElementById("resetButton").addEventListener("click", resetDailyChores);
document.getElementById("sidebarReset").addEventListener("click", function () {
  showConfirmPopup("Are you sure you want to reset daily logs and stats? This cannot be undone.", function () {
    resetDailyChores();
  });
});
// Weekly Summary Modal Setup
const modal = document.getElementById("weeklyModal");
//const openBtn = document.getElementById("weeklySummaryButton");
const openBtn = document.getElementById("sidebarWeeklySummary");
const closeBtn = document.getElementById("closeWeeklyModal");
const contentDiv = document.getElementById("weeklySummaryContent");
const exportBtn = document.getElementById("exportWeeklyBtn");
const resetBtn = document.getElementById("resetWeeklyBtn");


// Add member functionality
function addNewMember(name, color, avatar = null) {
  if (!name.trim()) {
    alert("Please enter a valid name.");
    return;
  }

  // Check if member already exists
  if (family.find(member => String(member && member.name || '').toLowerCase() === String(name || '').toLowerCase())) {
    alert("A member with this name already exists.");
    return;
  }

  const newMember = { name: name.trim(), color: color, avatar: avatar };
  family.push(newMember);

  console.log("setting morning as active tab for member 4.1");

  // Initialize data for new member
  choreData[newMember.name] = {
    Morning: [...defaultChoresByTime.Morning],
    Afternoon: [...defaultChoresByTime.Afternoon],
    Evening: [...defaultChoresByTime.Evening],
  };
  console.log("setting morning as active tab for member 5");

  starsData[newMember.name] = 0;
  weeklyStars[newMember.name] = {};
  activeTabs[newMember.name] = "Morning";
  console.log("setting morning as active tab for member 6");


  saveAll();
  renderBoard();
  updateChart();
}

function deleteMember(memberName) {
  if (confirm(`Are you sure you want to delete ${memberName}? This will remove all their chores and progress.`)) {
    // Remove from family array
    family = family.filter(member => member.name !== memberName);

    // Remove all data for this member
    delete choreData[memberName];
    delete starsData[memberName];
    delete weeklyStars[memberName];
    delete activeTabs[memberName];

    saveAll();
    renderBoard();
    updateChart();
  }
}

function showAvatarChangePopup(member) {
  // Create popup overlay
  const popup = document.createElement("div");
  popup.className = "popup-overlay";
  popup.innerHTML = `
    <div class="popup-content">
      <h2>Change Avatar for ${member.name}</h2>
      <div style="text-align: center; margin-bottom: 1rem;">
        <div class="avatar-preview" style="width: 80px; height: 80px; border-radius: 50%; margin: 0 auto; background-color: ${member.color}; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: white; font-weight: bold; ${member.avatar ? `background-image: url(${member.avatar}); background-size: cover; background-position: center;` : ''}">${member.avatar ? '' : getInitials(member.name)}</div>
      </div>
      <label>
        Upload Picture (optional):
        <input type="file" id="avatarFileInput" accept="image/*" style="margin-top: 0.5rem;" />
      </label>
           <div class="popup-buttons">
        <button id="avatarConfirm">Save</button>
        <button id="avatarRemove">Remove Picture</button>
        <button id="avatarCancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  const fileInput = document.getElementById("avatarFileInput");
  const preview = popup.querySelector(".avatar-preview");
  const confirmBtn = document.getElementById("avatarConfirm");
  const removeBtn = document.getElementById("avatarRemove");
  const cancelBtn = document.getElementById("avatarCancel");

  // File input change handler
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        preview.style.backgroundImage = `url(${e.target.result})`;
        preview.style.backgroundSize = "cover";
        preview.style.backgroundPosition = "center";
        preview.textContent = "";
      };
      reader.readAsDataURL(file);
    }
  });

  // Confirm button
  confirmBtn.addEventListener("click", () => {
    const file = fileInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const memberIndex = family.findIndex(m => m.name === member.name);
        if (memberIndex !== -1) {
          family[memberIndex].avatar = e.target.result;
          saveAll();
          renderBoard();
          updateChart();
        }
        document.body.removeChild(popup);
      };
      reader.readAsDataURL(file);
    } else {
      // No new file selected, just close popup
      document.body.removeChild(popup);
    }
  });

  // Remove button
  removeBtn.addEventListener("click", () => {
    const memberIndex = family.findIndex(m => m.name === member.name);
    if (memberIndex !== -1) {
      family[memberIndex].avatar = null;
      saveAll();
      renderBoard();
      updateChart();
    }
    document.body.removeChild(popup);
  });

  // Cancel button
  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(popup);
  });
}
openBtn.addEventListener("click", () => {
  renderWeeklySummary();
  modal.style.display = "block";
});

closeBtn.addEventListener("click", () => {
  modal.style.display = "none";
});

window.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});

// Render Weekly Summary
function renderWeeklySummary() {
  let html = "<table class='weekly-summary-table'><tr><th>Name</th>";
  const dates = getPast7Dates();
  dates.forEach(d => html += `<th>${d}</th>`);
  html += `<th>Total</th></tr>`;

  family.forEach((member) => {
    let row = `<tr class="member-row">`;
    row += `<td class="member-name-cell" style="background-color: ${member.color}; color: white;">${member.name}</td>`;
    let total = 0;
    dates.forEach(date => {
      const val = weeklyStars[member.name]?.[date] || 0;
      total += val;
      const cellColor = val > 0 ? `background-color: ${member.color}22; color: ${member.color}; font-weight: bold;` : '';
      row += `<td style="${cellColor}">${val}</td>`;
    });
    row += `<td style="background-color: ${member.color}; color: white; font-weight: bold;">${total}</td></tr>`;
    html += row;
  });

  html += "</table>";
  contentDiv.innerHTML = html;
}

// Weather and time functionality
function updateDateTime() {
  const now = new Date();
  const dateOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  const timeOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };

  const dateElement = document.getElementById('currentDate');
  const timeElement = document.getElementById('currentTime');

  if (dateElement && timeElement) {
    dateElement.textContent = now.toLocaleDateString('en-US', dateOptions);
    timeElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
  }
}

async function fetchWeather() {
  try {
    console.log('Requesting location permission...');

    // Check if geolocation is supported
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by this browser');
    }

    // Request location permission explicitly
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    console.log('Geolocation permission status:', permission.state);

    if (permission.state === 'denied') {
      throw new Error('Geolocation permission denied');
    }

    // Get user's location
    const position = await getCurrentPosition();
    const { latitude, longitude } = position.coords;
    console.log('Location obtained:', latitude, longitude);

    // Use environment variable or prompt user for API key
    const API_KEY = localStorage.getItem('weatherApiKey') || '5e112bbfbd8dbd717a36c2810642aed4';

    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric`
    );

    if (!response.ok) {
      console.error('Weather API response not OK:', response.status, response.statusText);
      throw new Error(`Weather API failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('Weather data received:', data);

    const weather = {
      temperature: Math.round(data.main.temp),
      condition: mapWeatherCondition(data.weather[0].main.toLowerCase()),
      description: data.weather[0].description,
      emoji: getWeatherEmoji(data.weather[0].main.toLowerCase()),
      location: data.name
    };

    updateWeatherDisplay(weather);
    updateBackgroundForWeather(weather.condition);
  } catch (error) {
    console.error('Weather fetch error:', error.message);

    // Show user-friendly error message
    if (error.message.includes('permission') || error.message.includes('geolocation')) {
      updateWeatherDisplay({
        temperature: '--',
        condition: 'partly-cloudy',
        description: 'Location access needed',
        emoji: '📍',
        location: 'Enable location access'
      });

      // Show alert to user
      setTimeout(() => {
        alert('Please enable location access to get weather updates. Check your browser settings and allow location permission for this site.');
      }, 1000);
    } else {
      // Try fallback weather service
      try {
        console.log('Trying fallback weather service...');
        const fallbackWeather = await fetchFallbackWeather();
        updateWeatherDisplay(fallbackWeather);
        updateBackgroundForWeather(fallbackWeather.condition);
      } catch (fallbackError) {
        console.error('Fallback weather failed:', fallbackError);
        updateWeatherDisplay({
          temperature: 22,
          condition: 'partly-cloudy',
          description: 'Weather unavailable',
          emoji: '🌤️',
          location: 'No location'
        });
      }
    }
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 300000 // 5 minutes
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('Position obtained successfully');
        resolve(position);
      },
      (error) => {
        console.error('Geolocation error:', error);
        let errorMessage = 'Location access failed';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied by user';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }

        reject(new Error(errorMessage));
      },
      options
    );
  });
}

async function fetchFallbackWeather() {
  try {
    // Using wttr.in for weather data (no API key required)
    const weatherResponse = await fetch(
      `https://wttr.in/?format=j1`
    );

    if (!weatherResponse.ok) {
      throw new Error('Fallback weather service failed');
    }

    const weatherData = await weatherResponse.json();
    const current = weatherData.current_condition[0];
    const location = weatherData.nearest_area[0];

    return {
      temperature: Math.round(current.temp_C),
      condition: mapWeatherCondition(current.weatherDesc[0].value.toLowerCase()),
      description: current.weatherDesc[0].value,
      emoji: getWeatherEmoji(current.weatherDesc[0].value.toLowerCase()),
      location: location.areaName[0].value || 'Your Location'
    };
  } catch (error) {
    console.error('Fallback weather service error:', error);
    throw error;
  }
}

async function fetchWeatherByIP() {
  // Keep the original function as backup
  try {
    const ipResponse = await fetch('https://ipapi.co/json/');
    const ipData = await ipResponse.json();

    const weatherResponse = await fetch(
      `https://wttr.in/${ipData.city}?format=j1`
    );
    const weatherData = await weatherResponse.json();

    const current = weatherData.current_condition[0];
    return {
      temperature: Math.round(current.temp_C),
      condition: mapWeatherCondition(current.weatherDesc[0].value.toLowerCase()),
      description: current.weatherDesc[0].value,
      emoji: getWeatherEmoji(current.weatherDesc[0].value.toLowerCase()),
      location: ipData.city
    };
  } catch (error) {
    throw new Error('IP-based weather failed');
  }
}

function mapWeatherCondition(condition) {
  if (condition.includes('rain') || condition.includes('drizzle') || condition.includes('shower')) return 'rainy';
  if (condition.includes('snow') || condition.includes('blizzard')) return 'snowy';
  if (condition.includes('cloud') || condition.includes('overcast')) return 'cloudy';
  if (condition.includes('clear') || condition.includes('sunny')) return 'sunny';
  if (condition.includes('mist') || condition.includes('fog')) return 'foggy';
  if (condition.includes('thunder') || condition.includes('storm')) return 'stormy';
  return 'partly-cloudy';
}

function getWeatherEmoji(condition) {
  if (condition.includes('rain') || condition.includes('drizzle')) return '🌧️';
  if (condition.includes('snow')) return '❄️';
  if (condition.includes('cloud') || condition.includes('overcast')) return '☁️';
  if (condition.includes('clear') || condition.includes('sunny')) return '☀️';
  if (condition.includes('mist') || condition.includes('fog')) return '🌫️';
  if (condition.includes('thunder') || condition.includes('storm')) return '⛈️';
  return '⛅';
}

function updateWeatherDisplay(weather) {
  const tempElement = document.getElementById('temperature');
  const emojiElement = document.getElementById('weatherEmoji');
  const descElement = document.getElementById('weatherDesc');
  const locationElement = document.getElementById('weatherLocation');

  if (tempElement) tempElement.textContent = `${weather.temperature}°C`;
  if (emojiElement) emojiElement.textContent = weather.emoji;
  if (descElement) descElement.textContent = weather.description;
  if (locationElement) locationElement.textContent = weather.location || '';
}

function updateBackgroundForWeather(condition) {
  const body = document.body;

  // Remove existing weather animations
  const existingAnimations = document.querySelectorAll('.weather-animation');
  existingAnimations.forEach(el => el.remove());

  const backgrounds = {
    'sunny': 'linear-gradient(135deg, #87CEEB 0%, #98D8E8 50%, #FFD700 100%)',
    'partly-cloudy': 'linear-gradient(135deg, #87CEEB 0%, #B0E0E6 50%, #F0F8FF 100%)',
    'cloudy': 'linear-gradient(135deg, #708090 0%, #A9A9A9 50%, #D3D3D3 100%)',
    'rainy': 'linear-gradient(135deg, #2C3E50 0%, #4A6741 50%, #34495E 100%)',
    'snowy': 'linear-gradient(135deg, #E6E6FA 0%, #F0F8FF 50%, #F5F5F5 100%)',
    'foggy': 'linear-gradient(135deg, #B0C4DE 0%, #D3D3D3 50%, #F5F5F5 100%)',
    'stormy': 'linear-gradient(135deg, #2C3E50 0%, #34495E 50%, #4A4A4A 100%)'
  };

  body.style.background = backgrounds[condition] || backgrounds['partly-cloudy'];

  // Add weather animations
  createWeatherAnimation(condition);
}

function createWeatherAnimation(condition) {
  const animationContainer = document.createElement('div');
  animationContainer.className = 'weather-animation';
  animationContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: -1;
    overflow: hidden;
  `;

  if (condition === 'rainy') {
    createRainAnimation(animationContainer);
  } else if (condition === 'snowy') {
    createSnowAnimation(animationContainer);
  } else if (condition === 'sunny') {
    createSunAnimation(animationContainer);
  } else if (condition === 'cloudy' || condition === 'partly-cloudy') {
    createCloudAnimation(animationContainer);
  } else if (condition === 'stormy') {
    createStormAnimation(animationContainer);
  } else if (condition === 'foggy') {
    createFogAnimation(animationContainer);
  }

  document.body.appendChild(animationContainer);
}

function createRainAnimation(container) {
  for (let i = 0; i < 100; i++) {
    const raindrop = document.createElement('div');
    raindrop.style.cssText = `
      position: absolute;
      width: 2px;
      height: 20px;
      background: linear-gradient(to bottom, transparent, #4A90E2);
      left: ${Math.random() * 100}%;
      animation: rainfall ${0.5 + Math.random() * 0.5}s linear infinite;
      animation-delay: ${Math.random() * 2}s;
    `;
    container.appendChild(raindrop);
  }
}

function createSnowAnimation(container) {
  for (let i = 0; i < 50; i++) {
    const snowflake = document.createElement('div');
    snowflake.innerHTML = '❄️';
    snowflake.style.cssText = `
      position: absolute;
      font-size: ${10 + Math.random() * 10}px;
      left: ${Math.random() * 100}%;
      animation: snowfall ${3 + Math.random() * 2}s linear infinite;
      animation-delay: ${Math.random() * 3}s;
      opacity: ${0.6 + Math.random() * 0.4};
    `;
    container.appendChild(snowflake);
  }
}

function createSunAnimation(container) {
  const sun = document.createElement('div');
  sun.innerHTML = '☀️';
  sun.style.cssText = `
  position: absolute; /* Keep this for regular flow with the document */
    font-size: 50px;
    top: 5%; /* Adjust as needed */
    right: 10%; /* Adjust as needed for a more natural flow */
    animation: sunpulse 4s ease-in-out infinite;
    filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.6));

  `;
  container.appendChild(sun);
}

function createCloudAnimation(container) {
  for (let i = 0; i < 3; i++) {
    const cloud = document.createElement('div');
    cloud.innerHTML = '☁️';
    cloud.style.cssText = `
      position: absolute;
      font-size: ${30 + Math.random() * 20}px;
      top: ${5 + Math.random() * 20}%;
      left: ${Math.random() * 80}%;
      animation: clouddrift ${10 + Math.random() * 5}s linear infinite;
      opacity: ${0.7 + Math.random() * 0.3};
    `;
    container.appendChild(cloud);
  }
}

function createStormAnimation(container) {
  // Add lightning effect
  const lightning = document.createElement('div');
  lightning.style.cssText = `
    position: absolute;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.9);
    animation: lightning 3s ease-in-out infinite;
    opacity: 0;
  `;
  container.appendChild(lightning);

  // Add rain
  createRainAnimation(container);
}

function createFogAnimation(container) {
  for (let i = 0; i < 5; i++) {
    const fog = document.createElement('div');
    fog.style.cssText = `
      position: absolute;
      width: 200px;
      height: 100px;
      background: rgba(211, 211, 211, 0.6);
      border-radius: 50px;
      top: ${20 + Math.random() * 60}%;
      left: ${Math.random() * 100}%;
      animation: fogdrift ${8 + Math.random() * 4}s linear infinite;
      filter: blur(3px);
    `;
    container.appendChild(fog);
  }
}

// Initialize weather and time
function initWeatherAndTime() {
  updateDateTime();

  // Try to get weather immediately, then retry every 30 seconds if failed
  fetchWeather().catch(() => {
    console.log('Initial weather fetch failed, will retry...');
    setTimeout(() => fetchWeather(), 30000);
  });

  // Update time every second
  setInterval(updateDateTime, 1000);

  // Update weather every 10 minutes
  setInterval(fetchWeather, 600000);
}

// Get past 7 dates (ISO format)
function getPast7Dates() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

// Export to CSV
exportBtn.addEventListener("click", () => {
  const dates = getPast7Dates();
  let csv = ["Name," + dates.join(",") + ",Total"];

  family.forEach((member) => {
    let row = [member.name];
    let total = 0;
    dates.forEach((date) => {
      const val = weeklyStars[member.name]?.[date] || 0;
      total += val;
      row.push(val);
    });
    row.push(total);
    csv.push(row.join(","));
  });

  const blob = new Blob([csv.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `weekly-stars-${getDayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Reset Weekly
resetBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to reset all weekly data?")) {
    weeklyStars = {};
    saveAll();
    renderWeeklySummary();
    alert("Weekly stars reset!");
  }
});

// Add Member Popup elements
const addMemberPopup = document.getElementById("addMemberPopup");
const addMemberNameInput = document.getElementById("newMemberName");
const addMemberColorInput = document.getElementById("newMemberColor");
const addMemberConfirm = document.getElementById("addMemberConfirm");
const addMemberCancel = document.getElementById("addMemberCancel");

// Add Member Popup buttons
if (addMemberConfirm) {
  addMemberConfirm.addEventListener("click", () => {
    const name = addMemberNameInput.value;
    const color = addMemberColorInput.value;
    const avatarInput = document.getElementById("newMemberAvatar");
    const avatarFile = avatarInput.files[0];

    if (avatarFile) {
      const reader = new FileReader();
      reader.onload = function (e) {
        addNewMember(name, color, e.target.result);
        addMemberPopup.classList.add("hidden");
      };
      reader.readAsDataURL(avatarFile);
    } else {
      addNewMember(name, color);
      addMemberPopup.classList.add("hidden");
    }
  });
}

if (addMemberCancel) {
  addMemberCancel.addEventListener("click", () => {
    addMemberPopup.classList.add("hidden");
  });
}

// Progress Chart Modal Setup
const chartModal = document.getElementById("progressChartModal");
//const openChartBtn = document.getElementById("progressChartButton");
const openChartBtn = document.getElementById("sidebarProgressChart");
const closeChartBtn = document.getElementById("closeProgressChartModal");

openChartBtn.addEventListener("click", () => {
  chartModal.style.display = "block";
  updateChart(); // render chart inside modal
});

closeChartBtn.addEventListener("click", () => {
  chartModal.style.display = "none";
});

window.addEventListener("click", (e) => {
  if (e.target === chartModal) chartModal.style.display = "none";
});
async function loadDataFromFirestore() {
  const user = firebase.auth().currentUser;
  if (user) {
    const userDoc = db.collection("users").doc(user.uid);
    const doc = await userDoc.get();
    if (doc.exists) {
      const data = doc.data();
      family = data.family || [];
      choreData = data.choreData || {};
      starsData = data.starsData || {};
      weeklyStars = data.weeklyStars || {};
      lastReset = data.lastReset || null;
      achievements = data.achievements || {};
      rewards = data.rewards || [];
      redeemedRewards = data.redeemedRewards || {};
      choreDifficulties = data.choreDifficulties || {};
      choreFrequencies = data.choreFrequencies || {};
      choreWeeklyDays = data.choreWeeklyDays || {};

      console.log("Data loaded from Firestore!");
    } else {
      console.log("No data found in Firestore for this user.");
    }
  }
}

