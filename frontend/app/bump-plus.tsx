import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, gradients } from "../src/theme";
import { GradientButton } from "../src/ui";

const PERKS = [
  { icon: "eye", text: "See who waved" },
  { icon: "flash", text: "Unlimited bumps" },
  { icon: "refresh", text: "Rewind last action" },
  { icon: "star", text: "Priority visibility" },
  { icon: "rocket", text: "Profile boost" },
  { icon: "options", text: "Advanced filters" },
];

export default function BumpPlus() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
          <View style={styles.heroWrap}>
            <Text style={styles.brand}>BUMP+</Text>
            <Text style={styles.tag}>More visibility. More connections.{"\n"}More experiences.</Text>
          </View>
          <View style={styles.perks}>
            {PERKS.map((p) => (
              <View key={p.text} style={styles.perkRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.lime} />
                <Text style={styles.perkText}>{p.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={{ padding: 24 }}>
          <GradientButton
            label="Try free for 7 days"
            onPress={() => router.back()}
            variant="brand"
            testID="bumpplus-trial"
          />
          <Text style={styles.price}>$4.99 / month after trial</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  headerRow: { paddingHorizontal: 20, paddingTop: 8, alignItems: "flex-end" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.elevated, alignItems: "center", justifyContent: "center" },
  heroWrap: { alignItems: "center", marginTop: 24, marginBottom: 36 },
  brand: {
    fontSize: 56,
    fontFamily: fonts.heading,
    fontWeight: "900",
    letterSpacing: -2,
    color: "#fff",
    ...(Platform.OS === "web"
      ? ({
          // @ts-ignore
          background: "linear-gradient(135deg, #7B2EFF, #FF4FA3)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          color: "transparent",
        } as any)
      : {}),
  },
  tag: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 14, textAlign: "center", marginTop: 12, lineHeight: 20 },
  perks: { gap: 14 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.elevated, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.glassBorder },
  perkText: { color: "#fff", fontFamily: fonts.bodyBold, fontWeight: "600", fontSize: 15 },
  price: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, textAlign: "center", marginTop: 12 },
});
