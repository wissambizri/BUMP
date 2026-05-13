// Firebase JS SDK init (web-friendly).
// On native (Expo Go), Phone Auth via the JS SDK requires reCAPTCHA which
// only works on web. The signup/auth screens detect Platform.OS === 'web'
// and use Firebase there; on native they fall back to the existing Twilio
// /auth/phone flow until you build with @react-native-firebase via EAS.

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

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  _app = getApps()[0] || initializeApp(firebaseConfig);
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  return _auth;
}

let _verifier: RecaptchaVerifier | null = null;

/** Create or reuse an invisible reCAPTCHA verifier (web only). */
export function getRecaptchaVerifier(containerId = "recaptcha-container"): RecaptchaVerifier {
  if (_verifier) return _verifier;
  const auth = getFirebaseAuth();
  // Ensure the container exists on the DOM (web only).
  if (typeof document !== "undefined" && !document.getElementById(containerId)) {
    const div = document.createElement("div");
    div.id = containerId;
    div.style.position = "fixed";
    div.style.bottom = "0";
    div.style.right = "0";
    div.style.zIndex = "-1";
    document.body.appendChild(div);
  }
  _verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
  return _verifier;
}

export async function sendPhoneOtp(phoneE164: string): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth();
  const verifier = getRecaptchaVerifier();
  return await signInWithPhoneNumber(auth, phoneE164, verifier);
}

export async function verifyPhoneOtpAndGetIdToken(
  confirmation: ConfirmationResult,
  code: string
): Promise<string> {
  const result = await confirmation.confirm(code);
  const idToken = await result.user.getIdToken(true);
  return idToken;
}

/** Reset state — call when user cancels / changes number. */
export function resetFirebasePhoneAuth() {
  try {
    if (_verifier) {
      _verifier.clear();
    }
  } catch {}
  _verifier = null;
}
