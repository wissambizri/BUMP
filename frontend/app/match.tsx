import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { colors, fonts } from "../src/theme";
import { GradientButton } from "../src/ui";

export default function MatchScreen() {
  const params = useLocalSearchParams<{
    matchId?: string;
    theirName?: string;
    theirPhoto?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const scale = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const pulseStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
  };

  const goChat = () => {
    if (params.matchId) {
      router.replace(`/chat/${params.matchId}`);
    } else {
      router.replace("/(tabs)/matches");
    }
  };
  const keepBrowsing = () => router.replace("/(tabs)/home");

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#7B2EFF66", "transparent"] as any}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={["#FF4FA344", "transparent"] as any}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0.4 }}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.heroBlock, { transform: [{ scale }] }]}>
          <Text style={styles.fire}>💥</Text>
          <Text style={styles.title}>
            It's a{"\n"}
            <Text style={styles.bumpWord}>BUMP!</Text>
          </Text>
          <Text style={styles.sub}>
            You and {params.theirName || "someone"} bumped each other.
          </Text>
        </Animated.View>

        <View style={styles.photosWrap}>
          <Animated.View style={[styles.glowRing, pulseStyle, { backgroundColor: colors.primary }]} />
          <Animated.View style={[styles.glowRing2, pulseStyle, { backgroundColor: colors.pink }]} />
          <Image
            source={{
              uri:
                user?.photos?.[0] ||
                "https://images.unsplash.com/photo-1546456073-92b9f0a8d413?w=400&q=80",
            }}
            style={[styles.photo, { borderColor: colors.primary }]}
          />
          <Image
            source={{
              uri:
                params.theirPhoto ||
                "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80",
            }}
            style={[styles.photo, { borderColor: colors.pink, marginLeft: -32 }]}
          />
        </View>

        <View style={styles.actions}>
          <GradientButton
            label="Say hi 👋"
            onPress={goChat}
            variant="brand"
            testID="match-sayhi"
            style={{ width: "100%" }}
          />
          <TouchableOpacity onPress={keepBrowsing} style={styles.keep} testID="match-keep">
            <Text style={styles.keepText}>Keep browsing</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  safe: { flex: 1, padding: 24, justifyContent: "space-between" },
  heroBlock: { alignItems: "center", marginTop: 16 },
  fire: { fontSize: 64, marginBottom: 8 },
  title: {
    color: "#fff",
    fontFamily: fonts.heading,
    fontWeight: "900",
    fontSize: 56,
    letterSpacing: -2.5,
    textAlign: "center",
    lineHeight: 58,
  },
  bumpWord: {
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
      : { color: colors.pink }),
  },
  sub: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 15,
    marginTop: 12,
    textAlign: "center",
  },
  photosWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 220,
  },
  glowRing: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    left: "20%",
  },
  glowRing2: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    right: "20%",
  },
  photo: { width: 140, height: 140, borderRadius: 70, borderWidth: 4 },
  actions: { gap: 8 },
  keep: { alignItems: "center", paddingVertical: 14 },
  keepText: { color: colors.textSecondary, fontFamily: fonts.bodyBold, fontWeight: "700", fontSize: 14 },
});
