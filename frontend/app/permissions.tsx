import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { colors, fonts } from "../src/theme";
import { GradientButton, Card } from "../src/ui";

type Perm = { key: string; icon: any; title: string; sub: string; granted: boolean };

export default function Permissions() {
  const router = useRouter();
  const [perms, setPerms] = useState<Perm[]>([
    { key: "location", icon: "location", title: "Location", sub: "See people around you at the venue", granted: false },
    { key: "camera", icon: "camera", title: "Camera", sub: "Take a live selfie to verify you're here", granted: false },
    { key: "notifications", icon: "notifications", title: "Notifications", sub: "Don't miss matches and messages", granted: false },
  ]);
  const [busy, setBusy] = useState<string | null>(null);

  const ask = async (key: string) => {
    setBusy(key);
    try {
      if (key === "location") {
        const r = await Location.requestForegroundPermissionsAsync();
        update(key, r.status === "granted");
      } else if (key === "notifications") {
        const r = await Notifications.requestPermissionsAsync();
        update(key, r.status === "granted");
      } else if (key === "camera") {
        if (Platform.OS === "web") {
          try {
            const stream = await (navigator as any).mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach((t: any) => t.stop());
            update(key, true);
          } catch {
            update(key, false);
          }
        } else {
          // expo-camera permissions handled inline on checkin screen
          update(key, true);
        }
      }
    } catch (e: any) {
      Alert.alert("Couldn't enable", e?.message || "Try again from your device settings");
    } finally {
      setBusy(null);
    }
  };
  const update = (k: string, g: boolean) =>
    setPerms((arr) => arr.map((p) => (p.key === k ? { ...p, granted: g } : p)));

  const allGranted = perms.every((p) => p.granted);

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ padding: 24 }}>
          <Text style={styles.kicker}>BUMP</Text>
          <Text style={styles.h1}>Let's get you{"\n"}set up.</Text>
          <Text style={styles.sub}>BUMP only works where the energy is live.</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}>
          {perms.map((p) => (
            <Card key={p.key} style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name={p.icon} size={22} color={colors.lime} />
              </View>
              <View style={{ flex: 1, marginHorizontal: 14 }}>
                <Text style={styles.rowTitle}>{p.title}</Text>
                <Text style={styles.rowSub}>{p.sub}</Text>
              </View>
              <TouchableOpacity
                onPress={() => ask(p.key)}
                disabled={p.granted || busy === p.key}
                style={[styles.allowBtn, p.granted && styles.allowBtnDone]}
                testID={`perm-${p.key}`}
              >
                <Text style={[styles.allowText, p.granted && { color: colors.lime }]}>
                  {p.granted ? "✓ On" : busy === p.key ? "..." : "Allow"}
                </Text>
              </TouchableOpacity>
            </Card>
          ))}
        </ScrollView>
        <View style={{ padding: 24, paddingTop: 8 }}>
          <GradientButton
            testID="perm-continue"
            label={allGranted ? "Continue" : "Skip for now"}
            onPress={() => router.replace("/profile-setup")}
            variant="brand"
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  kicker: { color: colors.lime, fontFamily: fonts.bodyBold, fontWeight: "800", fontSize: 11, letterSpacing: 3 },
  h1: { color: "#fff", fontFamily: fonts.heading, fontWeight: "900", fontSize: 36, letterSpacing: -1.2, marginTop: 12, lineHeight: 40 },
  sub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 14, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", padding: 16 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(200,255,61,0.12)", alignItems: "center", justifyContent: "center" },
  rowTitle: { color: "#fff", fontFamily: fonts.bodyBold, fontWeight: "700", fontSize: 15 },
  rowSub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
  allowBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.glassBorder },
  allowBtnDone: { borderColor: colors.lime },
  allowText: { color: "#fff", fontFamily: fonts.bodyBold, fontWeight: "700", fontSize: 13 },
});
