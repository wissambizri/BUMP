// Firebase JS SDK init (web-friendly).
// On native (Expo Go), Phone Auth via the JS SDK requires reCAPTCHA which
// only works on web. The signup/auth screens detect Platform.OS === 'web'
// and use Firebase there; on native they show a "use web preview" message.

import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  Auth,
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyBMarK7LSMteZX28uQzHkN-VuVUarKPj3M",
  authDomain: "bump-app-35ba2.firebaseapp.com",
  projectId: "bump-app-35ba2",
  storageBucket: "bump-app-35ba2.firebasestorage.app",
  messagingSenderId: "172970633257",
  appId: "1:172970633257:web:50bc629b59f40f72db1438",
  measurementId: "G-3XMKKMD0J4",
};

// Suppress reCAPTCHA's internal "Cannot read properties of null" exceptions
// from bubbling up to Expo's dev RedBox. These errors are non-fatal to the
// underlying phone-auth flow; Google's lib handles them internally but Expo
// catches all uncaught errors and shows them as if they crashed the app.
function installRecaptchaErrorFilter() {
  if (typeof window === "undefined") return;
  const isRecaptcha = (msg: any, src?: string) => {
    const s = (src || "") + " " + (msg?.message || msg || "");
    return (
      s.includes("recaptcha") ||
      s.includes("gstatic.com/recaptcha") ||
      (s.includes("Cannot read properties of null") && s.includes("style"))
    );
  };
  window.addEventListener(
    "error",
    (e) => {
      if (isRecaptcha(e.error || e.message, e.filename)) {
        e.preventDefault();
        e.stopImmediatePropagation?.();
      }
    },
    true
  );
  window.addEventListener(
    "unhandledrejection",
    (e) => {
      const reason: any = e.reason;
      if (isRecaptcha(reason, reason?.fileName || reason?.stack)) {
        e.preventDefault();
        e.stopImmediatePropagation?.();
      }
    },
    true
  );
}
installRecaptchaErrorFilter();

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _verifier: RecaptchaVerifier | null = null;
let _containerId: string | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  _app = getApps()[0] || initializeApp(firebaseConfig);
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getFirebaseAuth_();
  return _auth;
}

function getFirebaseAuth_(): Auth {
  return getAuth(getFirebaseApp());
}

/** Fully resets verifier + DOM container. Call before creating a new verifier
 * to avoid the reCAPTCHA "Cannot read properties of null (reading 'style')"
 * crash that happens when React re-renders and removes the iframe under it.
 */
export function resetFirebasePhoneAuth() {
  try {
    if (_verifier) {
      try {
        _verifier.clear();
      } catch {}
    }
  } finally {
    _verifier = null;
  }
  // Remove old container DOM nodes
  if (typeof document !== "undefined" && _containerId) {
    const old = document.getElementById(_containerId);
    if (old && old.parentNode) {
      try {
        old.parentNode.removeChild(old);
      } catch {}
    }
  }
  // Also clean any orphan reCAPTCHA iframes Google sometimes leaves behind
  if (typeof document !== "undefined") {
    document
      .querySelectorAll('iframe[src*="recaptcha"]')
      .forEach((el) => {
        try {
          el.parentNode && el.parentNode.removeChild(el);
        } catch {}
      });
    document
      .querySelectorAll('div[style*="z-index: 2000000000"]')
      .forEach((el) => {
        try {
          el.parentNode && el.parentNode.removeChild(el);
        } catch {}
      });
  }
  _containerId = null;
}

function createFreshContainer(): string {
  // Always create a new, unique container id so React never tries to "manage" it.
  const id = `recaptcha-container-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.id = id;
    // Visible "I'm not a robot" widget — far more stable on mobile Safari than invisible.
    // Center it near the top so users can see it clearly.
    div.style.position = "fixed";
    div.style.top = "50%";
    div.style.left = "50%";
    div.style.transform = "translate(-50%, -50%)";
    div.style.zIndex = "999999";
    div.style.background = "white";
    div.style.padding = "20px";
    div.style.borderRadius = "12px";
    div.style.boxShadow = "0 10px 40px rgba(0,0,0,0.5)";
    document.body.appendChild(div);
  }
  _containerId = id;
  return id;
}

export async function sendPhoneOtp(phoneE164: string): Promise<ConfirmationResult> {
  // Always start fresh — this prevents the "null style" reCAPTCHA crash.
  resetFirebasePhoneAuth();
  const auth = getFirebaseAuth();
  const containerId = createFreshContainer();
  _verifier = new RecaptchaVerifier(auth, containerId, {
    // "normal" = visible "I'm not a robot" checkbox.
    // Far more stable on mobile Safari than "invisible".
    size: "normal",
    callback: () => {
      // User checked the box — Firebase will now proceed to send SMS
    },
    "expired-callback": () => {
      // reCAPTCHA expired — user must re-check next attempt
    },
  });
  try {
    await _verifier.render();
    const confirmation = await signInWithPhoneNumber(auth, phoneE164, _verifier);
    // Once SMS is sent, we can hide the reCAPTCHA box
    if (typeof document !== "undefined" && _containerId) {
      const el = document.getElementById(_containerId);
      if (el) el.style.display = "none";
    }
    return confirmation;
  } catch (err) {
    // On any error, clean up so the next attempt starts fresh
    resetFirebasePhoneAuth();
    throw err;
  }
}

export async function verifyPhoneOtpAndGetIdToken(
  confirmation: ConfirmationResult,
  code: string
): Promise<string> {
  const result = await confirmation.confirm(code);
  const idToken = await result.user.getIdToken(true);
  return idToken;
}
