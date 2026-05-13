import { View, Text, StyleSheet, TouchableOpacity, ImageBackground, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../src/theme";
import { GradientButton } from "../src/ui";

export default function Onboarding() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <ImageBackground
        source={{
          uri: "https://images.unsplash.com/photo-1571266028243-d220c6a9d6e9?w=1200&q=80",
        }}
        style={StyleSheet.absoluteFillObject}
        imageStyle={{ opacity: 0.45 }}
        resizeMode="cover"
      />
      <LinearGradient
        colors={["transparent", "rgba(13,13,20,0.7)", "#0D0D14"] as any}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={["#7B2EFF55", "transparent"] as any}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 0.6 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["#FF4FA344", "transparent"] as any}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.7, y: 0.4 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.brandWrap}>
          <Text style={styles.brand}>
            BUMP
            <Text style={styles.spark}>✨</Text>
          </Text>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.hero} testID="onboarding-hero">
            Who's around{"\n"}you right now?
          </Text>
          <Text style={styles.sub}>Real people. Real time.</Text>
        </View>

        <View style={styles.bottom}>
          <GradientButton
            testID="onboarding-join"
            label="Join the room"
            onPress={() => router.push("/signup")}
            variant="brand"
            style={{ width: "100%" }}
          />
          <TouchableOpacity
            testID="onboarding-login"
            onPress={() => router.push("/auth")}
            style={styles.login}
          >
            <Text style={styles.loginText}>Log in</Text>
          </TouchableOpacity>
          <View style={styles.tagRow}>
            <Ionicons name="flash" size={12} color={colors.lime} />
            <Text style={styles.tag}>LIVE. REAL. NOW.</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  safe: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  brandWrap: { paddingTop: 16 },
  brand: {
    color: "#fff",
    fontSize: 56,
    fontFamily: fonts.heading,
    fontWeight: "900",
    letterSpacing: -3,
    ...(Platform.OS === "web"
      ? ({
          // @ts-ignore web gradient text
          background: "linear-gradient(135deg, #7B2EFF, #FF4FA3)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          color: "transparent",
        } as any)
      : {}),
  },
  spark: { fontSize: 28 },
  heroBlock: { marginBottom: 64 },
  hero: {
    color: "#fff",
    fontFamily: fonts.heading,
    fontWeight: "900",
    fontSize: 44,
    letterSpacing: -1.5,
    lineHeight: 48,
  },
  sub: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 15,
    marginTop: 14,
    letterSpacing: 0.2,
  },
  bottom: { gap: 12, paddingBottom: 8 },
  login: { alignItems: "center", paddingVertical: 14 },
  loginText: {
    color: "#fff",
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  tag: {
    color: colors.lime,
    fontSize: 11,
    fontFamily: fonts.bodyBold,
    fontWeight: "700",
    letterSpacing: 3,
  },
});
