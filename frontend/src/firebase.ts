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
    // Keep it offscreen but visible enough that reCAPTCHA can layout the challenge popup.
    div.style.position = "fixed";
    div.style.top = "0";
    div.style.left = "0";
    div.style.width = "1px";
    div.style.height = "1px";
    div.style.overflow = "hidden";
    div.style.opacity = "0.01";
    div.style.pointerEvents = "auto"; // reCAPTCHA still needs interaction
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
    size: "invisible",
    callback: () => {
      // reCAPTCHA solved — sendVerificationCode will fire automatically
    },
    "expired-callback": () => {
      // reCAPTCHA expired — user will see fresh challenge on next attempt
    },
  });
  try {
    // Render must succeed before signInWithPhoneNumber to avoid race conditions
    await _verifier.render();
    const confirmation = await signInWithPhoneNumber(auth, phoneE164, _verifier);
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
