import { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts } from "../src/theme";

export default function NotFound() {
  const router = useRouter();

  // Auto-redirect to home after 1.5s so the user isn't stranded
  useEffect(() => {
    const t = setTimeout(() => {
      router.replace("/");
    }, 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={styles.root}>
      <Text style={styles.emoji}>🌙</Text>
      <Text style={styles.title}>Page not found</Text>
      <Text style={styles.sub}>Taking you back to the venues…</Text>
      <TouchableOpacity
        onPress={() => router.replace("/")}
        activeOpacity={0.85}
        style={{ marginTop: 24 }}
        testID="notfound-home"
      >
        <LinearGradient
          colors={["#7B2EFF", "#FF4FA3"] as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          <Text style={styles.btnText}>Back to BUMP</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.void,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    fontFamily: fonts.heading,
    letterSpacing: -1,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    fontFamily: fonts.body,
    textAlign: "center",
  },
  btn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
  },
  btnText: {
    color: "#fff",
    fontFamily: fonts.heading,
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.5,
  },
});
