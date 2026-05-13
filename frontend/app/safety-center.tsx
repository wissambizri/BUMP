import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../src/theme";

type Item = { icon: any; label: string; route?: string; toggle?: boolean };

export default function SafetyCenter() {
  const router = useRouter();
  const [womensMode, setWomensMode] = useState(false);
  const items: Item[] = [
    { icon: "flag", label: "Report a user", route: "/blocked" },
    { icon: "ban", label: "Block a user", route: "/blocked" },
    { icon: "eye-off", label: "Hide my profile", toggle: true },
    { icon: "woman", label: "Women's mode", toggle: true },
    { icon: "shield-checkmark", label: "Safety tips" },
    { icon: "medical", label: "SOS / Emergency contacts" },
  ];

  const onPress = (it: Item) => {
    if (it.toggle) return;
    if (it.route) router.push(it.route as any);
    else Alert.alert(it.label, "Coming soon");
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Safety Center</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}>
          {items.map((it) => (
            <TouchableOpacity
              key={it.label}
              onPress={() => onPress(it)}
              activeOpacity={it.toggle ? 1 : 0.7}
              style={styles.row}
              testID={`safety-${it.label}`}
            >
              <View style={styles.iconCircle}>
                <Ionicons name={it.icon} size={18} color={colors.lime} />
              </View>
              <Text style={styles.rowLabel}>{it.label}</Text>
              {it.toggle ? (
                <Switch
                  value={it.label === "Women's mode" ? womensMode : false}
                  onValueChange={(v) => it.label === "Women's mode" && setWomensMode(v)}
                  thumbColor={"#fff"}
                  trackColor={{ true: colors.primary, false: colors.elevated }}
                />
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              )}
            </TouchableOpacity>
          ))}
          <View style={styles.banner}>
            <Ionicons name="shield-checkmark" size={18} color={colors.lime} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.bannerTitle}>Your safety is our priority.</Text>
              <Text style={styles.bannerSub}>We review reports 24/7.</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.elevated },
  title: { color: "#fff", fontFamily: fonts.heading, fontWeight: "900", fontSize: 22, letterSpacing: -0.5 },
  row: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: colors.elevated, borderRadius: 16, borderWidth: 1, borderColor: colors.glassBorder },
  iconCircle: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(200,255,61,0.12)", alignItems: "center", justifyContent: "center", marginRight: 14 },
  rowLabel: { flex: 1, color: "#fff", fontFamily: fonts.bodyBold, fontWeight: "600", fontSize: 14 },
  banner: { marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: "rgba(200,255,61,0.08)", borderWidth: 1, borderColor: "rgba(200,255,61,0.25)", flexDirection: "row", alignItems: "center" },
  bannerTitle: { color: "#fff", fontFamily: fonts.bodyBold, fontWeight: "700", fontSize: 13 },
  bannerSub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
});
