import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts } from "../src/theme";
import { GradientButton } from "../src/ui";

export default function Recap() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bumps?: string; matches?: string; chats?: string; duration?: string }>();
  const stats = [
    { value: params.bumps || "7", label: "Bumps sent", color: colors.pink },
    { value: params.matches || "3", label: "Matches", color: colors.primary },
    { value: params.chats || "2", label: "New chats", color: colors.blue },
    { value: params.duration || "1h 32m", label: "Time at venue", color: colors.lime },
  ];
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#7B2EFF22", "transparent"] as any}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <SafeAreaView style={{ flex: 1, padding: 24 }}>
        <View style={{ alignItems: "center", marginTop: 24 }}>
          <Text style={styles.fire}>🔥</Text>
          <Text style={styles.title}>Great night!</Text>
          <Text style={styles.sub}>Here's your recap</Text>
        </View>
        <View style={styles.statsWrap}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statRow}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: "auto", gap: 10 }}>
          <GradientButton
            label="Share my night"
            onPress={() => router.back()}
            variant="brand"
            testID="recap-share"
          />
          <TouchableOpacity onPress={() => router.back()} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  fire: { fontSize: 48 },
  title: { color: "#fff", fontFamily: fonts.heading, fontWeight: "900", fontSize: 40, marginTop: 12, letterSpacing: -1.5 },
  sub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 14, marginTop: 6 },
  statsWrap: { marginTop: 48, gap: 16 },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, backgroundColor: colors.elevated, borderRadius: 18, borderWidth: 1, borderColor: colors.glassBorder },
  statVal: { fontFamily: fonts.heading, fontWeight: "900", fontSize: 28, letterSpacing: -0.8 },
  statLabel: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 },
  done: { alignItems: "center", paddingVertical: 14 },
  doneText: { color: colors.textSecondary, fontFamily: fonts.bodyBold, fontWeight: "700", fontSize: 14 },
});
