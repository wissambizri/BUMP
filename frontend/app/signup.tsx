import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken } from "../src/api";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";
import {
  sendPhoneOtp as fbSendPhoneOtp,
  verifyPhoneOtpAndGetIdToken as fbVerifyOtp,
  resetFirebasePhoneAuth,
} from "../src/firebase";

type Step = "method" | "identifier" | "otp" | "profile";
type Method = "email" | "phone" | null;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+\d{8,16}$/;

export default function SignupScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method>(null);
  const [busy, setBusy] = useState(false);

  // identifier
  const [identifier, setIdentifier] = useState("");

  // otp + scope token
  const [otp, setOtp] = useState("");
  const [scopeToken, setScopeToken] = useState<string | null>(null);

  // Firebase phone (web only): we keep the ConfirmationResult here
  const fbConfirmRef = useRef<any>(null);
  const [fbIdToken, setFbIdToken] = useState<string | null>(null);
  const useFirebasePhone = Platform.OS === "web";

  // profile data
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [username, setUsername] = useState("");
  const [usernameOk, setUsernameOk] = useState<null | { ok: boolean; reason?: string }>(null);
  const [password, setPassword] = useState("");

  // resend cooldown
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<any>(null);

  useEffect(() => () => {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
  }, []);

  const startCooldown = () => {
    setCooldown(30);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          clearInterval(cooldownTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const pickMethod = (m: Method) => {
    setMethod(m);
    setIdentifier("");
    setStep("identifier");
  };

  const goBack = () => {
    if (step === "method") return router.back();
    if (step === "identifier") return setStep("method");
    if (step === "otp") return setStep("identifier");
    if (step === "profile") return setStep("otp");
  };

  const validIdentifier = () => {
    const v = identifier.trim();
    if (method === "email") return EMAIL_RE.test(v);
    if (method === "phone") return PHONE_RE.test(v);
    return false;
  };

  const sendOtp = async () => {
    if (!validIdentifier()) {
      Alert.alert(
        "Invalid",
        method === "email"
          ? "Enter a valid email (you@example.com)"
          : "Enter a phone in international format (+14155550100)"
      );
      return;
    }
    setBusy(true);
    try {
      if (method === "email") {
        // Check existence first to give a friendly error
        try {
          const check = await api.identify(identifier.trim().toLowerCase());
          if (check.exists) {
            Alert.alert("Already registered", "Try logging in instead.", [
              { text: "Cancel" },
              { text: "Go to log in", onPress: () => router.replace("/auth") },
            ]);
            setBusy(false);
            return;
          }
        } catch {}
        const res = await api.emailOtpSend(identifier.trim().toLowerCase(), "signup");
        if (res?.dev_code) {
          Alert.alert(
            "Dev code (sandbox)",
            `Real email not delivered (Resend sandbox).\nUse this code to verify: ${res.dev_code}`
          );
        }
      } else {
        // Phone — check existence
        try {
          const check = await api.identify(identifier.trim());
          if (check.exists) {
            Alert.alert("Already registered", "Try logging in instead.", [
              { text: "Cancel" },
              { text: "Go to log in", onPress: () => router.replace("/auth") },
            ]);
            setBusy(false);
            return;
          }
        } catch {}
        if (useFirebasePhone) {
          // Web: use Firebase Phone Auth (real SMS via Google, no Twilio trial limits)
          try {
            const confirmation = await fbSendPhoneOtp(identifier.trim());
            fbConfirmRef.current = confirmation;
          } catch (fe: any) {
            console.error("Firebase send failed:", fe);
            Alert.alert(
              "Couldn't send code",
              fe?.message || "Firebase Phone Auth failed. Falling back to SMS provider."
            );
            // Fallback to Twilio if Firebase fails
            await api.phoneSend(identifier.trim());
          }
        } else {
          // Native Expo Go: Firebase JS phone auth needs reCAPTCHA (web-only). Use Twilio.
          await api.phoneSend(identifier.trim());
        }
      }
      startCooldown();
      setOtp("");
      setStep("otp");
    } catch (e: any) {
      Alert.alert("Couldn't send code", e?.response?.data?.detail || "Try again");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length < 4) return Alert.alert("Code", "Enter the 6-digit code");
    setBusy(true);
    try {
      if (method === "email") {
        const res = await api.emailOtpVerify(
          identifier.trim().toLowerCase(),
          otp,
          "signup"
        );
        setScopeToken(res.scope_token);
        setStep("profile");
      } else {
        // Phone
        if (useFirebasePhone && fbConfirmRef.current) {
          // Web Firebase: get an ID token, stash it for the final exchange
          try {
            const idToken = await fbVerifyOtp(fbConfirmRef.current, otp);
            setFbIdToken(idToken);
            setStep("profile");
          } catch (fe: any) {
            Alert.alert("Invalid code", fe?.message || "Try again");
          }
        } else {
          // Twilio path: store the code for the final signup call
          setScopeToken(otp);
          setStep("profile");
        }
      }
    } catch (e: any) {
      Alert.alert("Invalid code", e?.response?.data?.detail || "Try again");
    } finally {
      setBusy(false);
    }
  };

  const checkUsername = async (u: string) => {
    setUsername(u);
    setUsernameOk(null);
    if (!u) return;
    if (!USERNAME_RE.test(u)) {
      setUsernameOk({ ok: false, reason: "3–20 letters, digits, or _" });
      return;
    }
    try {
      const res = await api.usernameCheck(u);
      setUsernameOk({ ok: !!res.available, reason: res.reason });
    } catch {}
  };

  const finishSignup = async () => {
    const a = parseInt(age, 10);
    if (!firstName.trim()) return Alert.alert("Missing", "Enter your first name");
    if (isNaN(a) || a < 18) return Alert.alert("Age", "You must be 18+");
    if (method === "email" && password.length < 6) {
      return Alert.alert("Password", "At least 6 characters");
    }
    if (username && usernameOk && !usernameOk.ok) {
      return Alert.alert("Username", usernameOk.reason || "Taken");
    }
    setBusy(true);
    try {
      // Phone + Firebase web path: exchange Firebase ID token for our JWT
      if (method === "phone" && fbIdToken) {
        const res = await api.firebaseExchange(fbIdToken, {
          first_name: firstName.trim(),
          age: a,
          username: username || undefined,
        });
        await setToken(res.token);
        await refresh();
        resetFirebasePhoneAuth();
        router.replace("/profile-setup");
        return;
      }
      if (!scopeToken) return Alert.alert("Error", "Verification expired \u2014 start over");
      const res = await api.signup({
        identifier:
          method === "email" ? identifier.trim().toLowerCase() : identifier.trim(),
        code: scopeToken,
        username: username || undefined,
        password: method === "email" ? password : undefined,
        first_name: firstName.trim(),
        age: a,
      });
      await setToken(res.token);
      await refresh();
      router.replace("/profile-setup");
    } catch (e: any) {
      Alert.alert("Couldn't create account", e?.response?.data?.detail || "Try again");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    try {
      if (method === "email") {
        const r = await api.emailOtpSend(identifier.trim().toLowerCase(), "signup");
        if (r?.dev_code) {
          Alert.alert("Dev code (sandbox)", `Use this code: ${r.dev_code}`);
        } else {
          Alert.alert("Sent", "A new code is on the way");
        }
      } else {
        await api.phoneSend(identifier.trim());
        Alert.alert("Sent", "A new code is on the way");
      }
      startCooldown();
    } catch (e: any) {
      Alert.alert("Couldn't resend", e?.response?.data?.detail || "Try again");
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <TouchableOpacity testID="signup-back" onPress={goBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.brand}>BUMP</Text>
            <View style={{ width: 26 }} />
          </View>

          {/* Step indicator */}
          <View style={styles.dots}>
            {(["method", "identifier", "otp", "profile"] as Step[]).map((s, i) => {
              const idx = ["method", "identifier", "otp", "profile"].indexOf(step);
              return (
                <View
                  key={s}
                  style={[styles.dot, i <= idx && styles.dotActive]}
                />
              );
            })}
          </View>

          {step === "method" && (
            <>
              <Text style={styles.h1}>Create{"\n"}your account.</Text>
              <Text style={styles.sub}>Sign up in less than a minute. 18+ only.</Text>

              <TouchableOpacity
                testID="signup-email-method"
                style={styles.methodBtn}
                onPress={() => pickMethod("email")}
              >
                <View style={styles.methodIcon}>
                  <Ionicons name="mail" size={22} color={colors.volt} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodTitle}>Continue with email</Text>
                  <Text style={styles.methodSub}>We'll send a 6-digit code</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                testID="signup-phone-method"
                style={styles.methodBtn}
                onPress={() => pickMethod("phone")}
              >
                <View style={styles.methodIcon}>
                  <Ionicons name="call" size={22} color={colors.volt} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodTitle}>Continue with phone</Text>
                  <Text style={styles.methodSub}>SMS code (Firebase)</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>

              <Text style={styles.divider}>OR</Text>

              <TouchableOpacity
                testID="have-account"
                onPress={() => router.replace("/auth")}
                style={styles.loginRow}
              >
                <Text style={styles.loginText}>
                  Already have an account?{" "}
                  <Text style={styles.loginCta}>Log in</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "identifier" && (
            <>
              <Text style={styles.h1}>
                {method === "email" ? "Your\nemail." : "Your\nphone."}
              </Text>
              <Text style={styles.sub}>
                {method === "email"
                  ? "We'll send a 6-digit code to verify it."
                  : "International format (+14155550100). Standard SMS rates apply."}
              </Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name={method === "email" ? "mail" : "call"}
                  size={18}
                  color={colors.volt}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  testID="signup-identifier-input"
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder={method === "email" ? "you@example.com" : "+14155550100"}
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={method === "email" ? "email-address" : "phone-pad"}
                  style={styles.input}
                  onSubmitEditing={sendOtp}
                />
              </View>
              <TouchableOpacity
                testID="signup-send-otp"
                style={[styles.cta, (busy || !validIdentifier()) && { opacity: 0.5 }]}
                onPress={sendOtp}
                disabled={busy || !validIdentifier()}
              >
                {busy ? (
                  <ActivityIndicator color={colors.inverse} />
                ) : (
                  <Text style={styles.ctaText}>Send code</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === "otp" && (
            <>
              <Text style={styles.h1}>Verify{"\n"}your code.</Text>
              <Text style={styles.sub}>
                Sent to {identifier}.{" "}
                <Text style={{ color: colors.volt, fontWeight: "700" }}>
                  Check spam if you don't see it.
                </Text>
              </Text>
              <TextInput
                testID="signup-otp-input"
                value={otp}
                onChangeText={setOtp}
                placeholder="••••••"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.codeInput]}
              />
              <TouchableOpacity
                testID="signup-verify"
                style={[styles.cta, busy && { opacity: 0.5 }]}
                onPress={verifyOtp}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.inverse} />
                ) : (
                  <Text style={styles.ctaText}>Verify</Text>
                )}
              </TouchableOpacity>
              <View style={styles.resendRow}>
                <Text style={styles.resendMuted}>Didn't get it?</Text>
                <TouchableOpacity disabled={cooldown > 0} onPress={resend}>
                  <Text
                    style={[
                      styles.resendLink,
                      cooldown > 0 && { color: colors.textTertiary },
                    ]}
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === "profile" && (
            <>
              <Text style={styles.h1}>One last{"\n"}step.</Text>
              <Text style={styles.sub}>Pick how others will see you.</Text>

              <TextInput
                testID="signup-first-name"
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
              />
              <TextInput
                testID="signup-age-input"
                value={age}
                onChangeText={setAge}
                placeholder="Age (18+)"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.input}
              />
              <View style={styles.inputWrap}>
                <Text style={{ color: colors.textTertiary, marginRight: 4, fontSize: 16 }}>@</Text>
                <TextInput
                  testID="signup-username-input"
                  value={username}
                  onChangeText={checkUsername}
                  placeholder="username (optional)"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                {usernameOk && username ? (
                  <Ionicons
                    name={usernameOk.ok ? "checkmark-circle" : "close-circle"}
                    size={18}
                    color={usernameOk.ok ? colors.volt : "#ff6b6b"}
                  />
                ) : null}
              </View>
              {usernameOk && username && !usernameOk.ok && (
                <Text style={styles.hintErr}>{usernameOk.reason}</Text>
              )}
              {method === "email" && (
                <TextInput
                  testID="signup-password-input"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password (6+ chars)"
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry
                  style={styles.input}
                />
              )}
              <TouchableOpacity
                testID="signup-finish"
                style={[styles.cta, busy && { opacity: 0.5 }]}
                onPress={finishSignup}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.inverse} />
                ) : (
                  <Text style={styles.ctaText}>Create account</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.terms}>
                By tapping "Create account" you agree to BUMP's Terms and
                acknowledge our Privacy Policy.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  scroll: { padding: 24, paddingTop: 12, paddingBottom: 80 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  brand: {
    color: colors.volt,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -1,
  },
  dots: { flexDirection: "row", gap: 6, marginBottom: 28 },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.elevated },
  dotActive: { backgroundColor: colors.volt },
  h1: {
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.5,
    lineHeight: 42,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
  },
  methodBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    marginBottom: 12,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(225,255,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  methodTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  methodSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  divider: {
    color: colors.textTertiary,
    textAlign: "center",
    fontSize: 11,
    letterSpacing: 2,
    marginVertical: 18,
  },
  loginRow: { alignItems: "center", padding: 8 },
  loginText: { color: colors.textSecondary, fontSize: 14 },
  loginCta: { color: colors.volt, fontWeight: "800" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 16,
    fontSize: 16,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  codeInput: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 14,
    textAlign: "center",
  },
  cta: {
    backgroundColor: colors.volt,
    paddingVertical: 18,
    borderRadius: 999,
    alignItems: "center",
    marginTop: 8,
  },
  ctaText: { color: colors.inverse, fontSize: 17, fontWeight: "800" },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 16,
    gap: 6,
  },
  resendMuted: { color: colors.textSecondary, fontSize: 13 },
  resendLink: { color: colors.volt, fontSize: 13, fontWeight: "700" },
  hintErr: { color: "#ff8a8a", fontSize: 12, marginTop: -6, marginBottom: 8, marginLeft: 4 },
  terms: {
    color: colors.textTertiary,
    fontSize: 11,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 16,
  },
});
