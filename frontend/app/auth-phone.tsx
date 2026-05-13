import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken } from "../src/api";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

export default function AuthPhone() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("+1");
  const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!phone.startsWith("+") || phone.length < 9) return Alert.alert("Phone", "Use E.164 format e.g. +14155550100");
    setBusy(true);
    try {
      await api.phoneSend(phone);
      setStep("code");
    } catch (e: any) {
      Alert.alert("Failed", e?.response?.data?.detail || "Could not send code");
    } finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.length < 4) return;
    setBusy(true);
    try {
      const res = await api.phoneVerify(phone, code, firstName || "Friend", parseInt(age, 10) || 21);
      await setToken(res.token);
      await refresh();
      router.replace(res.user?.gender ? "/(tabs)/home" : "/profile-setup");
    } catch (e: any) {
      Alert.alert("Invalid code", e?.response?.data?.detail || "Try again");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <TouchableOpacity testID="phone-back" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.body}>
          <Text style={styles.h1}>{step === "phone" ? "Your\nnumber." : "Enter\nthe code."}</Text>
          <Text style={styles.sub}>{step === "phone" ? "We'll text you a code." : `Sent to ${phone}`}</Text>
          {step === "phone" ? (
            <>
              <TextInput testID="phone-input" value={phone} onChangeText={setPhone} placeholder="+14155550100" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" style={styles.input} />
              <TextInput testID="phone-name" value={firstName} onChangeText={setFirstName} placeholder="First name (optional)" placeholderTextColor={colors.textTertiary} style={styles.input} />
              <TextInput testID="phone-age" value={age} onChangeText={setAge} placeholder="Age (optional, 18+)" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" style={styles.input} />
              <TouchableOpacity testID="phone-send" style={[styles.cta, busy && { opacity: 0.5 }]} onPress={send} disabled={busy}>
                <Text style={styles.ctaText}>{busy ? "..." : "Send code"}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput testID="code-input" value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" maxLength={6} style={[styles.input, { fontSize: 26, letterSpacing: 8, textAlign: "center" }]} />
              <TouchableOpacity testID="phone-verify" style={[styles.cta, busy && { opacity: 0.5 }]} onPress={verify} disabled={busy}>
                <Text style={styles.ctaText}>{busy ? "..." : "Verify"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep("phone")}><Text style={styles.link}>Change number</Text></TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  back: { padding: 16 },
  body: { padding: 24 },
  h1: { color: colors.textPrimary, fontSize: 40, fontWeight: "900", letterSpacing: -1.5, lineHeight: 44 },
  sub: { color: colors.textSecondary, marginTop: 8, marginBottom: 24 },
  input: { backgroundColor: colors.elevated, color: colors.textPrimary, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.glassBorder, marginBottom: 12, fontSize: 16 },
  cta: { backgroundColor: colors.volt, paddingVertical: 18, borderRadius: 999, alignItems: "center", marginTop: 8 },
  ctaText: { color: colors.inverse, fontSize: 17, fontWeight: "800" },
  link: { color: colors.textSecondary, textAlign: "center", marginTop: 16, fontSize: 13 },
});
