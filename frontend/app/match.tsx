import { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { colors } from "../src/theme";

export default function Match() {
  const { matchId, theirName, theirPhoto } = useLocalSearchParams<{
    matchId: string;
    theirName: string;
    theirPhoto: string;
  }>();
  const router = useRouter();

  const scale = useSharedValue(0);
  const titleScale = useSharedValue(0);
  const ring = useSharedValue(1);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scale.value = withSpring(1, { damping: 8 });
    titleScale.value = withDelay(200, withSpring(1, { damping: 6 }));
    ring.value = withRepeat(
      withSequence(withTiming(1.2, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1,
      true
    );
  }, []);

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: titleScale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring.value }],
    opacity: 2 - ring.value,
  }));

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.void, "#1a0014", colors.void]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1 }} />

        <Animated.Text style={[styles.kicker, titleStyle]}>BOTH OF YOU TAPPED</Animated.Text>
        <Animated.Text style={[styles.title, titleStyle]} testID="match-title">
          IT&apos;S A BUMP
        </Animated.Text>
        <Animated.Text style={[styles.boom, titleStyle]}>💥</Animated.Text>

        <View style={styles.avatarRow}>
          <Animated.View style={[styles.ringWrap, ringStyle]}>
            <View style={styles.ring} />
          </Animated.View>
          <Animated.View style={[styles.avatarContainer, avatarStyle]}>
            <Image source={{ uri: String(theirPhoto || "") }} style={styles.avatar} />
          </Animated.View>
        </View>

        <Text style={styles.subtitle}>
          You and <Text style={{ color: colors.volt }}>{theirName}</Text> are connected.
        </Text>
        <Text style={styles.note}>Chat unlocks for 24h. Make it count.</Text>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          testID="match-chat-btn"
          style={styles.cta}
          onPress={() => router.replace(`/chat/${matchId}`)}
        >
          <Text style={styles.ctaText}>Say hi →</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="match-later-btn" onPress={() => router.replace("/(tabs)/matches")}>
          <Text style={styles.later}>Later</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  safe: { flex: 1, padding: 24, alignItems: "center" },
  kicker: { color: colors.fuchsia, fontSize: 12, letterSpacing: 3, fontWeight: "800" },
  title: {
    color: colors.textPrimary,
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: -2,
    marginTop: 8,
  },
  boom: { fontSize: 64, marginTop: 4 },
  avatarRow: {
    marginTop: 32,
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  ringWrap: { position: "absolute", width: 200, height: 200 },
  ring: {
    flex: 1,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: colors.fuchsia,
  },
  avatarContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    overflow: "hidden",
    borderWidth: 4,
    borderColor: colors.volt,
  },
  avatar: { width: "100%", height: "100%", backgroundColor: colors.elevated },
  subtitle: { color: colors.textPrimary, fontSize: 18, marginTop: 32, fontWeight: "600" },
  note: { color: colors.textSecondary, marginTop: 8, fontSize: 13 },
  cta: {
    width: "100%",
    backgroundColor: colors.volt,
    paddingVertical: 18,
    borderRadius: 999,
    alignItems: "center",
    marginBottom: 12,
  },
  ctaText: { color: colors.inverse, fontSize: 17, fontWeight: "800" },
  later: { color: colors.textSecondary, fontSize: 14, paddingVertical: 10 },
});
