import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken } from "../src/api";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

type Step = "request" | "phone_otp" | "email_sent" | "manual_token";

export default function ForgotScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { refresh } = useAuth();

  const [identifier, setIdentifier] = useState((params.identifier as string) || "");
  const [step, setStep] = useState<Step>("request");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [token, setToken_] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const isPhone = /^\+\d{8,16}$/.test(identifier.trim());

  const onRequest = async () => {
    if (!identifier) return Alert.alert("Missing", "Enter your email or phone");
    setBusy(true);
    try {
      const res = await api.forgot(identifier.trim());
      if (res.dev_token) {
        setToken_(res.dev_token);
        Alert.alert(
          "Dev token (sandbox)",
          `Real email not delivered (Resend sandbox).\nReset token: ${res.dev_token}\n(prefilled below)`
        );
      }
      if (res.channel === "phone") setStep("phone_otp");
      else setStep("email_sent");
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Could not send reset");
    } finally {
      setBusy(false);
    }
  };

  const onConfirmPhone = async () => {
    if (code.length < 4) return Alert.alert("Code", "Enter the SMS code");
    if (newPassword.length < 6) return Alert.alert("Password", "At least 6 characters");
    setBusy(true);
    try {
      const res = await api.resetConfirm({
        identifier: identifier.trim(),
        code,
        new_password: newPassword,
      });
      await setToken(res.token);
      await refresh();
      Alert.alert("Done", "Password reset. Logging you in.");
      router.replace(res.user?.gender ? "/(tabs)/home" : "/profile-setup");
    } catch (e: any) {
      Alert.alert("Reset failed", e?.response?.data?.detail || "Try again");
    } finally {
      setBusy(false);
    }
  };

  const onConfirmEmailToken = async () => {
    if (!token) return Alert.alert("Token", "Paste the token from your email");
    if (newPassword.length < 6) return Alert.alert("Password", "At least 6 characters");
    setBusy(true);
    try {
      const res = await api.resetConfirm({ token, new_password: newPassword });
      await setToken(res.token);
      await refresh();
      Alert.alert("Done", "Password reset.");
      router.replace(res.user?.gender ? "/(tabs)/home" : "/profile-setup");
    } catch (e: any) {
      Alert.alert("Reset failed", e?.response?.data?.detail || "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="forgot-back" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.h1}>
            {step === "request" ? "Forgot\npassword." : step === "email_sent" ? "Check\nyour email." : "Reset\npassword."}
          </Text>
          <Text style={styles.sub}>
            {step === "request"
              ? "Enter your email or phone — we'll help you back in."
              : step === "phone_otp"
              ? `SMS code sent to ${identifier}`
              : step === "email_sent"
              ? `If an account exists, a reset link was sent to ${identifier}. Tap it to return here, or paste the token below.`
              : ""}
          </Text>

          {step === "request" && (
            <>
              <TextInput
                testID="forgot-identifier"
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="Email or phone (+1…)"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                style={styles.input}
              />
              <TouchableOpacity
                testID="forgot-submit"
                style={[styles.cta, busy && { opacity: 0.5 }]}
                onPress={onRequest}
                disabled={busy}
              >
                <Text style={styles.ctaText}>{busy ? "..." : isPhone ? "Send SMS code" : "Send reset link"}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === "phone_otp" && (
            <>
              <TextInput
                testID="forgot-code"
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.codeInput]}
              />
              <TextInput
                testID="forgot-new-password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password (6+ chars)"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                style={styles.input}
              />
              <TouchableOpacity
                testID="forgot-confirm-phone"
                style={[styles.cta, busy && { opacity: 0.5 }]}
                onPress={onConfirmPhone}
                disabled={busy}
              >
                <Text style={styles.ctaText}>{busy ? "..." : "Reset password"}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === "email_sent" && (
            <>
              <TextInput
                testID="forgot-token"
                value={token}
                onChangeText={setToken_}
                placeholder="Paste reset token from email"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                style={styles.input}
              />
              <TextInput
                testID="forgot-new-password-email"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password (6+ chars)"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                style={styles.input}
              />
              <TouchableOpacity
                testID="forgot-confirm-email"
                style={[styles.cta, busy && { opacity: 0.5 }]}
                onPress={onConfirmEmailToken}
                disabled={busy}
              >
                <Text style={styles.ctaText}>{busy ? "..." : "Reset password"}</Text>
              </TouchableOpacity>
              <Text style={styles.note}>
                Tip: open the email and tap the button to auto-fill the token.
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
  scroll: { padding: 24, paddingBottom: 60 },
  back: { padding: 8, marginLeft: -8, marginBottom: 16 },
  h1: { color: colors.textPrimary, fontSize: 38, fontWeight: "900", letterSpacing: -1.5, lineHeight: 42 },
  sub: { color: colors.textSecondary, fontSize: 14, marginTop: 8, marginBottom: 24, lineHeight: 20 },
  input: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    color: colors.textPrimary,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    fontSize: 16,
  },
  codeInput: { fontSize: 28, fontWeight: "800", letterSpacing: 12, textAlign: "center" },
  cta: {
    backgroundColor: colors.volt,
    paddingVertical: 18,
    borderRadius: 999,
    alignItems: "center",
    marginTop: 8,
  },
  ctaText: { color: colors.inverse, fontSize: 17, fontWeight: "800" },
  note: { color: colors.textTertiary, fontSize: 12, textAlign: "center", marginTop: 16 },
});
