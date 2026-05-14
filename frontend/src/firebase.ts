// Firebase JS SDK init (web-only).
// On native (Expo Go), Phone Auth via the JS SDK requires reCAPTCHA which
// only works on web. We lazy-load firebase modules to avoid bundling errors
// and module-load crashes on native.

import { Platform } from "react-native";

export const firebaseConfig = {
  apiKey: "AIzaSyBMarK7LSMteZX28uQzHkN-VuVUarKPj3M",
  authDomain: "bump-app-35ba2.firebaseapp.com",
  projectId: "bump-app-35ba2",
  storageBucket: "bump-app-35ba2.firebasestorage.app",
  messagingSenderId: "172970633257",
  appId: "1:172970633257:web:50bc629b59f40f72db1438",
  measurementId: "G-3XMKKMD0J4",
};

const isWeb = Platform.OS === "web";

// Suppress reCAPTCHA's internal "Cannot read properties of null" exceptions
// from bubbling up to Expo's dev RedBox.
function installRecaptchaErrorFilter() {
  if (!isWeb) return;
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
// Only install on web; on native this is a no-op
if (isWeb) installRecaptchaErrorFilter();

// Lazy-loaded firebase modules. We avoid static imports because the JS SDK
// has module-load side effects that crash on React Native (Expo Go).
let _app: any = null;
let _auth: any = null;
let _verifier: any = null;
let _containerId: string | null = null;

async function getFb() {
  if (!isWeb) {
    throw new Error(
      "Firebase Phone Auth requires the web preview. On the mobile app, please use Email login."
    );
  }
  if (_app && _auth) return { app: _app, auth: _auth };
  // Dynamic imports so native bundles don't pull firebase
  const fbApp = await import("firebase/app");
  const fbAuth = await import("firebase/auth");
  _app = fbApp.getApps()[0] || fbApp.initializeApp(firebaseConfig);
  _auth = fbAuth.getAuth(_app);
  return { app: _app, auth: _auth, fbAuth };
}

export function resetFirebasePhoneAuth() {
  if (!isWeb) return;
  try {
    if (_verifier) {
      try {
        _verifier.clear();
      } catch {}
    }
  } finally {
    _verifier = null;
  }
  if (typeof document !== "undefined" && _containerId) {
    const old = document.getElementById(_containerId);
    if (old && old.parentNode) {
      try {
        old.parentNode.removeChild(old);
      } catch {}
    }
  }
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
  const id = `recaptcha-container-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.id = id;
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

export async function sendPhoneOtp(phoneE164: string): Promise<any> {
  resetFirebasePhoneAuth();
  const { auth, fbAuth } = (await getFb()) as any;
  const containerId = createFreshContainer();
  _verifier = new fbAuth.RecaptchaVerifier(auth, containerId, {
    size: "normal",
    callback: () => {},
    "expired-callback": () => {},
  });
  try {
    await _verifier.render();
    const confirmation = await fbAuth.signInWithPhoneNumber(auth, phoneE164, _verifier);
    if (typeof document !== "undefined" && _containerId) {
      const el = document.getElementById(_containerId);
      if (el) el.style.display = "none";
    }
    return confirmation;
  } catch (err) {
    resetFirebasePhoneAuth();
    throw err;
  }
}

export async function verifyPhoneOtpAndGetIdToken(
  confirmation: any,
  code: string
): Promise<string> {
  const result = await confirmation.confirm(code);
  const idToken = await result.user.getIdToken(true);
  return idToken;
}
