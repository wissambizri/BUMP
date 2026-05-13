import { useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/auth";
import { api } from "../src/api";
import { colors } from "../src/theme";

export default function AuthScreen() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) return Alert.alert("Missing", "Email and password required");
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn(email.trim().toLowerCase(), password);
        router.replace("/(tabs)/home");
      } else {
        if (!firstName || !age) return Alert.alert("Missing", "First name and age required");
        const a = parseInt(age, 10);
        if (isNaN(a) || a < 18) return Alert.alert("Age", "Must be 18+");
        await signUp({ email: email.trim().toLowerCase(), password, first_name: firstName, age: a });
        router.replace("/profile-setup");
      }
    } catch (e: any) {
      Alert.alert("Oops", e?.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setMode("login");
    setEmail("ava@bump.app");
    setPassword("demo1234");
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>BUMP</Text>
          <Text style={styles.tag}>Break the ice nearby.</Text>

          <View style={styles.tabs}>
            <TouchableOpacity
              testID="tab-login"
              onPress={() => setMode("login")}
              style={[styles.tab, mode === "login" && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>
                Log in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="tab-signup"
              onPress={() => setMode("signup")}
              style={[styles.tab, mode === "signup" && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>
                Sign up
              </Text>
            </TouchableOpacity>
          </View>

          {mode === "signup" && (
            <>
              <TextInput
                testID="input-first-name"
                placeholder="First name"
                placeholderTextColor={colors.textTertiary}
                value={firstName}
                onChangeText={setFirstName}
                style={styles.input}
              />
              <TextInput
                testID="input-age"
                placeholder="Age (18+)"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                value={age}
                onChangeText={setAge}
                style={styles.input}
              />
            </>
          )}

          <TextInput
            testID="input-email"
            placeholder="Email"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            testID="input-password"
            placeholder="Password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />

          <TouchableOpacity
            testID="auth-submit"
            disabled={loading}
            style={[styles.cta, loading && { opacity: 0.6 }]}
            onPress={submit}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>
              {loading ? "..." : mode === "login" ? "Enter" : "Create account"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity testID="demo-fill" onPress={fillDemo} style={{ marginTop: 16 }}>
            <Text style={styles.demoText}>Try demo: ava@bump.app / demo1234</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            testID="google-signin"
            style={styles.socialBtn}
            onPress={async () => {
              try {
                const WebBrowser = await import("expo-web-browser");
                const Linking = await import("expo-linking");
                const SecureStore = await import("expo-secure-store");
                const redirect = Platform.OS === "web"
                  ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
                  : Linking.createURL("/auth");
                const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
                if (Platform.OS === "web" && typeof window !== "undefined") {
                  window.location.href = authUrl;
                  return;
                }
                const result: any = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
                if (result?.type !== "success" || !result.url) return;
                const url = result.url;
                const hash = url.includes("#") ? url.split("#")[1] : "";
                const q = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
                const params = new URLSearchParams(hash || q);
                const sid = params.get("session_id");
                if (!sid) return Alert.alert("Auth", "Missing session_id");
                const res = await api.googleSession(sid);
                const { setToken: setT } = await import("../src/api");
                await setT(res.token);
                await SecureStore.setItemAsync("bump_token", res.token).catch(() => {});
                router.replace(res.user?.gender ? "/(tabs)/home" : "/profile-setup");
              } catch (e: any) {
                Alert.alert("Google", e?.message || "Failed");
              }
            }}
          >
            <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
            <Text style={styles.socialText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="apple-signin"
            style={styles.socialBtn}
            onPress={() => Alert.alert("Apple Sign-In", "Available in production iOS build.")}
          >
            <Ionicons name="logo-apple" size={20} color={colors.textPrimary} />
            <Text style={styles.socialText}>Continue with Apple</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="phone-signin"
            style={styles.socialBtn}
            onPress={() => router.push("/auth-phone")}
          >
            <Ionicons name="call" size={18} color={colors.textPrimary} />
            <Text style={styles.socialText}>Continue with Phone</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  scroll: { padding: 24, paddingTop: 48, paddingBottom: 60 },
  brand: { color: colors.volt, fontSize: 48, fontWeight: "900", letterSpacing: -2 },
  tag: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 32,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.elevated,
    borderRadius: 999,
    padding: 4,
    marginBottom: 24,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 999 },
  tabActive: { backgroundColor: colors.volt },
  tabText: { color: colors.textSecondary, fontWeight: "600" },
  tabTextActive: { color: colors.inverse, fontWeight: "800" },
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
  cta: {
    backgroundColor: colors.volt,
    paddingVertical: 18,
    borderRadius: 999,
    alignItems: "center",
    marginTop: 8,
  },
  ctaText: { color: colors.inverse, fontSize: 17, fontWeight: "800" },
  demoText: {
    color: colors.textTertiary,
    textAlign: "center",
    fontSize: 12,
    letterSpacing: 1,
  },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.glassBorder },
  dividerText: { color: colors.textTertiary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingVertical: 16,
    borderRadius: 999,
    marginBottom: 10,
  },
  socialText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
});
