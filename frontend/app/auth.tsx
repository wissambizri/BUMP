import { useEffect, useMemo, useRef, useState } from "react";
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

type Step =
  | "identifier"
  | "login_password"
  | "login_phone_otp"
  | "signup_email_otp"
  | "signup_email_profile"
  | "signup_phone_otp"
  | "signup_phone_profile";

type IdentifyRes = {
  kind: "email" | "phone" | "username";
  exists: boolean;
  next: "password" | "otp_phone" | "otp_email";
};

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function detectKind(s: string): "email" | "phone" | "username" | null {
  const v = s.trim();
  if (!v) return null;
  if (/^\+\d{8,16}$/.test(v)) return "phone";
  if (v.includes("@") && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "email";
  if (USERNAME_RE.test(v)) return "username";
  return null;
}

export default function AuthScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("identifier");
  const [busy, setBusy] = useState(false);

  // identifier state
  const [identifier, setIdentifier] = useState("");
  const [resolved, setResolved] = useState<IdentifyRes | null>(null);

  // login
  const [password, setPassword] = useState("");

  // signup
  const [emailCode, setEmailCode] = useState("");
  const [scopeToken, setScopeToken] = useState<string | null>(null);
  const [phoneCode, setPhoneCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [username, setUsername] = useState("");
  const [usernameOk, setUsernameOk] = useState<null | { ok: boolean; reason?: string }>(null);
  const [signupPassword, setSignupPassword] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownTimer = useRef<any>(null);

  const idKind = useMemo(() => detectKind(identifier), [identifier]);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const startCooldown = () => {
    setResendCooldown(30);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const onContinue = async () => {
    const kind = detectKind(identifier);
    if (!kind) {
      Alert.alert(
        "Invalid",
        "Enter a valid email, phone (+14155550100), or username (3–20 letters/digits/_)"
      );
      return;
    }
    setBusy(true);
    try {
      const res: IdentifyRes = await api.identify(identifier.trim());
      setResolved(res);
      if (res.exists) {
        if (res.next === "otp_phone") {
          await api.phoneSend(identifier.trim());
          startCooldown();
          setStep("login_phone_otp");
        } else {
          setStep("login_password");
        }
      } else {
        if (kind === "phone") {
          await api.phoneSend(identifier.trim());
          startCooldown();
          setStep("signup_phone_otp");
        } else if (kind === "email") {
          const r = await api.emailOtpSend(identifier.trim().toLowerCase(), "signup");
          if (r?.dev_code) {
            Alert.alert(
              "Dev code (sandbox)",
              `Real email not delivered (Resend sandbox).\nUse this code: ${r.dev_code}`
            );
          }
          startCooldown();
          setStep("signup_email_otp");
        }
      }
    } catch (e: any) {
      Alert.alert("Try again", e?.response?.data?.detail || "Could not continue");
    } finally {
      setBusy(false);
    }
  };

  const onLoginPassword = async () => {
    if (!password) return;
    setBusy(true);
    try {
      const res = await api.loginUnified({ identifier: identifier.trim(), password });
      await setToken(res.token);
      await refresh();
      router.replace(res.user?.gender ? "/(tabs)/home" : "/profile-setup");
    } catch (e: any) {
      Alert.alert("Login failed", e?.response?.data?.detail || "Try again");
    } finally {
      setBusy(false);
    }
  };

  const onLoginPhoneOtp = async () => {
    if (phoneCode.length < 4) return;
    setBusy(true);
    try {
      const res = await api.loginUnified({ identifier: identifier.trim(), code: phoneCode });
      await setToken(res.token);
      await refresh();
      router.replace(res.user?.gender ? "/(tabs)/home" : "/profile-setup");
    } catch (e: any) {
      Alert.alert("Invalid code", e?.response?.data?.detail || "Try again");
    } finally {
      setBusy(false);
    }
  };

  const onVerifyEmailOtp = async () => {
    if (emailCode.length < 4) return;
    setBusy(true);
    try {
      const res = await api.emailOtpVerify(
        identifier.trim().toLowerCase(),
        emailCode,
        "signup"
      );
      setScopeToken(res.scope_token);
      setStep("signup_email_profile");
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

  const onSignupEmail = async () => {
    if (!firstName || !age || !signupPassword) {
      return Alert.alert("Missing", "Fill name, age, and password");
    }
    const a = parseInt(age, 10);
    if (isNaN(a) || a < 18) return Alert.alert("Age", "Must be 18+");
    if (signupPassword.length < 6) return Alert.alert("Password", "At least 6 characters");
    if (username && usernameOk && !usernameOk.ok) {
      return Alert.alert("Username", usernameOk.reason || "Taken");
    }
    setBusy(true);
    try {
      const res = await api.signup({
        identifier: identifier.trim().toLowerCase(),
        code: scopeToken!,
        password: signupPassword,
        username: username || undefined,
        first_name: firstName,
        age: a,
      });
      await setToken(res.token);
      await refresh();
      router.replace("/profile-setup");
    } catch (e: any) {
      Alert.alert("Sign up failed", e?.response?.data?.detail || "Try again");
    } finally {
      setBusy(false);
    }
  };

  const onSignupPhone = async () => {
    if (phoneCode.length < 4) {
      return Alert.alert("Code", "Enter the SMS code");
    }
    if (!firstName || !age) return Alert.alert("Missing", "Fill name and age");
    const a = parseInt(age, 10);
    if (isNaN(a) || a < 18) return Alert.alert("Age", "Must be 18+");
    if (username && usernameOk && !usernameOk.ok) {
      return Alert.alert("Username", usernameOk.reason || "Taken");
    }
    setBusy(true);
    try {
      const res = await api.signup({
        identifier: identifier.trim(),
        code: phoneCode,
        username: username || undefined,
        first_name: firstName,
        age: a,
      });
      await setToken(res.token);
      await refresh();
      router.replace("/profile-setup");
    } catch (e: any) {
      Alert.alert("Sign up failed", e?.response?.data?.detail || "Try again");
    } finally {
      setBusy(false);
    }
  };

  const onResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      if (step === "signup_phone_otp" || step === "login_phone_otp") {
        await api.phoneSend(identifier.trim());
      } else if (step === "signup_email_otp") {
        const r = await api.emailOtpSend(identifier.trim().toLowerCase(), "signup");
        if (r?.dev_code) {
          Alert.alert("Dev code (sandbox)", `Use this code: ${r.dev_code}`);
        }
      }
      startCooldown();
      if (step !== "signup_email_otp") Alert.alert("Sent", "A new code is on the way");
    } catch (e: any) {
      Alert.alert("Could not resend", e?.response?.data?.detail || "Try again");
    }
  };

  const reset = () => {
    setStep("identifier");
    setResolved(null);
    setPassword("");
    setEmailCode("");
    setPhoneCode("");
    setScopeToken(null);
    setFirstName("");
    setAge("");
    setUsername("");
    setUsernameOk(null);
    setSignupPassword("");
  };

  const headline = () => {
    switch (step) {
      case "identifier":
        return "Welcome\nto BUMP.";
      case "login_password":
        return "Welcome\nback.";
      case "login_phone_otp":
        return "Check\nyour texts.";
      case "signup_email_otp":
        return "Verify\nyour email.";
      case "signup_email_profile":
        return "Almost\nthere.";
      case "signup_phone_otp":
        return "Verify\nyour phone.";
      case "signup_phone_profile":
        return "Almost\nthere.";
    }
  };

  const sub = () => {
    switch (step) {
      case "identifier":
        return "Email, phone, or username — we'll figure it out.";
      case "login_password":
        return `Logging in as ${identifier}`;
      case "login_phone_otp":
        return `Code sent to ${identifier}`;
      case "signup_email_otp":
        return `6-digit code sent to ${identifier}`;
      case "signup_email_profile":
        return `${identifier} verified.`;
      case "signup_phone_otp":
        return `6-digit code sent to ${identifier}`;
      case "signup_phone_profile":
        return `${identifier} verified.`;
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
            {step !== "identifier" && (
              <TouchableOpacity testID="auth-back" onPress={reset} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
            <Text style={styles.brand}>BUMP</Text>
          </View>

          <Text style={styles.h1}>{headline()}</Text>
          <Text style={styles.sub}>{sub()}</Text>

          {/* STEP: identifier */}
          {step === "identifier" && (
            <>
              <View style={styles.inputWrap}>
                <Ionicons
                  name={
                    idKind === "phone"
                      ? "call"
                      : idKind === "email"
                      ? "mail"
                      : idKind === "username"
                      ? "at"
                      : "person-outline"
                  }
                  size={18}
                  color={idKind ? colors.volt : colors.textTertiary}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  testID="auth-identifier"
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="Email, phone (+1…) or username"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={styles.input}
                  onSubmitEditing={onContinue}
                />
              </View>
              {identifier.length > 0 && !idKind && (
                <Text style={styles.hintErr}>
                  Format: email (you@x.com), phone (+14155550100), or 3–20 letters/digits/_
                </Text>
              )}
              <TouchableOpacity
                testID="auth-continue"
                style={[styles.cta, (busy || !idKind) && { opacity: 0.5 }]}
                onPress={onContinue}
                disabled={busy || !idKind}
              >
                <Text style={styles.ctaText}>{busy ? "..." : "Continue"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="demo-fill"
                onPress={() => setIdentifier("ava@bump.app")}
                style={{ marginTop: 14 }}
              >
                <Text style={styles.demoText}>
                  Demo: ava@bump.app / demo1234
                </Text>
              </TouchableOpacity>

              <View style={styles.signupRow}>
                <Text style={styles.signupMuted}>New to BUMP?</Text>
                <TouchableOpacity
                  testID="go-signup"
                  onPress={() => router.push("/signup")}
                >
                  <Text style={styles.signupCta}>Create account</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* STEP: login with password */}
          {step === "login_password" && (
            <>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed" size={18} color={colors.textTertiary} style={{ marginRight: 8 }} />
                <TextInput
                  testID="auth-password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry
                  style={styles.input}
                  onSubmitEditing={onLoginPassword}
                />
              </View>
              <TouchableOpacity
                testID="auth-login"
                style={[styles.cta, busy && { opacity: 0.5 }]}
                onPress={onLoginPassword}
                disabled={busy}
              >
                <Text style={styles.ctaText}>{busy ? "..." : "Log in"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="auth-forgot"
                onPress={() => router.push(`/forgot?identifier=${encodeURIComponent(identifier)}`)}
                style={{ marginTop: 16 }}
              >
                <Text style={styles.link}>Forgot password?</Text>
              </TouchableOpacity>
            </>
          )}

          {/* STEP: login via phone OTP */}
          {step === "login_phone_otp" && (
            <>
              <TextInput
                testID="auth-phone-code"
                value={phoneCode}
                onChangeText={setPhoneCode}
                placeholder="6-digit code"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.codeInput]}
              />
              <TouchableOpacity
                testID="auth-verify-phone"
                style={[styles.cta, busy && { opacity: 0.5 }]}
                onPress={onLoginPhoneOtp}
                disabled={busy}
              >
                <Text style={styles.ctaText}>{busy ? "..." : "Verify & log in"}</Text>
              </TouchableOpacity>
              <ResendRow cooldown={resendCooldown} onPress={onResendOtp} />
            </>
          )}

          {/* STEP: signup → email OTP */}
          {step === "signup_email_otp" && (
            <>
              <TextInput
                testID="auth-email-code"
                value={emailCode}
                onChangeText={setEmailCode}
                placeholder="6-digit code"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.codeInput]}
              />
              <TouchableOpacity
                testID="auth-verify-email"
                style={[styles.cta, busy && { opacity: 0.5 }]}
                onPress={onVerifyEmailOtp}
                disabled={busy}
              >
                <Text style={styles.ctaText}>{busy ? "..." : "Verify"}</Text>
              </TouchableOpacity>
              <ResendRow cooldown={resendCooldown} onPress={onResendOtp} />
            </>
          )}

          {/* STEP: signup → email profile */}
          {step === "signup_email_profile" && (
            <SignupProfileForm
              firstName={firstName}
              setFirstName={setFirstName}
              age={age}
              setAge={setAge}
              username={username}
              setUsername={checkUsername}
              usernameOk={usernameOk}
              password={signupPassword}
              setPassword={setSignupPassword}
              showPassword
              busy={busy}
              onSubmit={onSignupEmail}
            />
          )}

          {/* STEP: signup → phone OTP (also collects profile in one screen) */}
          {step === "signup_phone_otp" && (
            <>
              <TextInput
                testID="auth-signup-phone-code"
                value={phoneCode}
                onChangeText={setPhoneCode}
                placeholder="6-digit code from SMS"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.codeInput]}
              />
              <SignupProfileForm
                firstName={firstName}
                setFirstName={setFirstName}
                age={age}
                setAge={setAge}
                username={username}
                setUsername={checkUsername}
                usernameOk={usernameOk}
                busy={busy}
                onSubmit={onSignupPhone}
                submitLabel="Create account"
              />
              <ResendRow cooldown={resendCooldown} onPress={onResendOtp} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ResendRow({ cooldown, onPress }: { cooldown: number; onPress: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 16, gap: 6 }}>
      <Text style={styles.linkMuted}>Didn't get it?</Text>
      <TouchableOpacity disabled={cooldown > 0} onPress={onPress}>
        <Text style={[styles.link, cooldown > 0 && { color: colors.textTertiary }]}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function SignupProfileForm(props: {
  firstName: string;
  setFirstName: (v: string) => void;
  age: string;
  setAge: (v: string) => void;
  username: string;
  setUsername: (v: string) => void;
  usernameOk: null | { ok: boolean; reason?: string };
  password?: string;
  setPassword?: (v: string) => void;
  showPassword?: boolean;
  busy: boolean;
  onSubmit: () => void;
  submitLabel?: string;
}) {
  return (
    <>
      <TextInput
        testID="signup-first-name"
        value={props.firstName}
        onChangeText={props.setFirstName}
        placeholder="First name"
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
      />
      <TextInput
        testID="signup-age"
        value={props.age}
        onChangeText={props.setAge}
        placeholder="Age (18+)"
        placeholderTextColor={colors.textTertiary}
        keyboardType="number-pad"
        maxLength={2}
        style={styles.input}
      />
      <View style={styles.inputWrap}>
        <Text style={{ color: colors.textTertiary, marginRight: 4, fontSize: 16 }}>@</Text>
        <TextInput
          testID="signup-username"
          value={props.username}
          onChangeText={props.setUsername}
          placeholder="username (optional)"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        {props.usernameOk && props.username && (
          <Ionicons
            name={props.usernameOk.ok ? "checkmark-circle" : "close-circle"}
            size={18}
            color={props.usernameOk.ok ? colors.volt : colors.textTertiary}
          />
        )}
      </View>
      {props.usernameOk && props.username && !props.usernameOk.ok && (
        <Text style={styles.hintErr}>{props.usernameOk.reason}</Text>
      )}
      {props.showPassword && (
        <TextInput
          testID="signup-password"
          value={props.password}
          onChangeText={props.setPassword}
          placeholder="Password (6+ chars)"
          placeholderTextColor={colors.textTertiary}
          secureTextEntry
          style={styles.input}
        />
      )}
      <TouchableOpacity
        testID="signup-submit"
        style={[styles.cta, props.busy && { opacity: 0.5 }]}
        onPress={props.onSubmit}
        disabled={props.busy}
      >
        {props.busy ? (
          <ActivityIndicator color={colors.inverse} />
        ) : (
          <Text style={styles.ctaText}>{props.submitLabel || "Create account"}</Text>
        )}
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  scroll: { padding: 24, paddingTop: 16, paddingBottom: 80 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 32 },
  backBtn: { padding: 8, marginLeft: -8, marginRight: 8 },
  brand: { color: colors.volt, fontSize: 28, fontWeight: "900", letterSpacing: -1 },
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
    marginBottom: 28,
    lineHeight: 20,
  },
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
  },
  codeInput: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 12,
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
  demoText: { color: colors.textTertiary, textAlign: "center", fontSize: 12, letterSpacing: 1 },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
  },
  signupMuted: { color: colors.textSecondary, fontSize: 14 },
  signupCta: { color: colors.volt, fontSize: 14, fontWeight: "800" },
  link: { color: colors.volt, textAlign: "center", fontSize: 13, fontWeight: "700" },
  linkMuted: { color: colors.textSecondary, fontSize: 13 },
  hintErr: { color: "#ff8a8a", fontSize: 12, marginTop: -6, marginBottom: 8, marginLeft: 4 },
});
