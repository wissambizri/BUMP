import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  Alert,
  Animated,
  PanResponder,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors, fonts } from "../../src/theme";
import { GradientButton } from "../../src/ui";

const { width, height } = Dimensions.get("window");
const CARD_W = Math.min(width - 32, 400);
const CARD_H = Math.min(height * 0.62, 580);

export default function RadarFeed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [feed, setFeed] = useState<any[]>([]);
  const [venue, setVenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const cardScale = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardTilt = useRef(new Animated.Value(0)).current;
  const cardX = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const [v, f] = await Promise.all([api.venue(String(id)), api.feed(String(id))]);
      setVenue(v);
      setFeed(f);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const animateOut = (direction: -1 | 0 | 1) => {
    return new Promise<void>((resolve) => {
      Animated.parallel([
        Animated.timing(cardX, { toValue: direction * width, duration: 240, useNativeDriver: true }),
        Animated.timing(cardTilt, { toValue: direction * 25, duration: 220, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(cardScale, { toValue: 0.92, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        cardX.setValue(0);
        cardY.setValue(0);
        cardTilt.setValue(0);
        cardScale.setValue(1);
        cardOpacity.setValue(1);
        resolve();
      });
    });
  };

  const springBack = () => {
    Animated.parallel([
      Animated.spring(cardX, { toValue: 0, useNativeDriver: true, friction: 6, tension: 80 }),
      Animated.spring(cardY, { toValue: 0, useNativeDriver: true, friction: 6, tension: 80 }),
      Animated.spring(cardTilt, { toValue: 0, useNativeDriver: true, friction: 6, tension: 80 }),
    ]).start();
  };

  const act = async (action: "pass" | "hi" | "like") => {
    if (acting || feed.length === 0) return;
    setActing(true);
    const target = feed[0];
    const dir: -1 | 0 | 1 = action === "pass" ? -1 : action === "like" ? 1 : 0;
    Haptics.impactAsync(
      action === "pass"
        ? Haptics.ImpactFeedbackStyle.Light
        : Haptics.ImpactFeedbackStyle.Medium
    );
    try {
      const res = await api.like({ target_user_id: target.user.id, action });
      await animateOut(dir);
      setFeed((prev) => prev.slice(1));
      if (res.matched) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push({
          pathname: "/match",
          params: {
            matchId: res.match_id,
            theirName: target.user.first_name,
            theirPhoto: target.user.photos?.[0] || "",
          },
        });
      }
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Failed");
    } finally {
      setActing(false);
    }
  };

  const actRef = useRef(act);
  actRef.current = act;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          cardX.stopAnimation();
          cardY.stopAnimation();
          cardTilt.stopAnimation();
        },
        onPanResponderMove: (_, g) => {
          cardX.setValue(g.dx);
          cardY.setValue(g.dy * 0.25);
          cardTilt.setValue((g.dx / width) * 30);
        },
        onPanResponderRelease: (_, g) => {
          const distanceThreshold = Math.min(width * 0.28, 140);
          const velocityThreshold = 0.5;
          const shouldLike = g.dx > distanceThreshold || g.vx > velocityThreshold;
          const shouldPass = g.dx < -distanceThreshold || g.vx < -velocityThreshold;
          if (shouldLike) {
            actRef.current("like");
          } else if (shouldPass) {
            actRef.current("pass");
          } else {
            springBack();
          }
        },
        onPanResponderTerminate: () => springBack(),
      }),
    [cardX, cardY, cardTilt]
  );

  const leave = () => {
    Alert.alert("Leave venue?", "You'll be removed from this venue's live radar.", [
      { text: "Stay" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          await api.leave();
          router.replace("/(tabs)/home");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const current = feed[0];
  const next = feed[1];

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity testID="feed-back" onPress={() => router.replace("/(tabs)/home")} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.kicker}>RADAR · {feed.length} live</Text>
            <Text style={styles.venueName} numberOfLines={1}>
              {venue?.name || "Live now"}
            </Text>
          </View>
          <TouchableOpacity testID="leave-feed" onPress={leave} style={styles.iconBtn}>
            <Ionicons name="exit-outline" size={22} color={colors.pink} />
          </TouchableOpacity>
        </View>

        <View style={styles.deck}>
          {!current ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emoji}>🌙</Text>
              <Text style={styles.emptyTitle}>That's everyone for now</Text>
              <Text style={styles.emptySub}>Check back in a few — the room's just getting warmed up.</Text>
              <View style={{ marginTop: 22, width: "100%" }}>
                <GradientButton label="Refresh" onPress={load} variant="brand" />
              </View>
            </View>
          ) : (
            <>
              {next && (
                <View style={[styles.cardBase, styles.cardBehind]}>
                  <Image source={{ uri: next.user.photos?.[0] || "" }} style={styles.cardPhoto} />
                </View>
              )}
              <Animated.View
                {...panResponder.panHandlers}
                style={[
                  styles.cardBase,
                  {
                    opacity: cardOpacity,
                    transform: [
                      { translateX: cardX },
                      { translateY: cardY },
                      { scale: cardScale },
                      {
                        rotate: cardTilt.interpolate({
                          inputRange: [-25, 25],
                          outputRange: ["-12deg", "12deg"],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Image
                  source={{
                    uri:
                      current.user.photos?.[0] ||
                      "https://placehold.co/600x800/0D0D14/C8FF3D?text=BUMP",
                  }}
                  style={styles.cardPhoto}
                />
                <LinearGradient
                  colors={["transparent", "rgba(13,13,20,0.85)", "#0D0D14"] as any}
                  locations={[0, 0.6, 1]}
                  style={styles.cardGradient}
                />
                <View style={styles.cardTopRow}>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push(`/profile/${current.user.id}?venue=${id}`)}
                    testID="open-profile-detail"
                    style={styles.openProfile}
                  >
                    <Ionicons name="information-circle" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.overlayLabel,
                    styles.overlayBump,
                    {
                      opacity: cardX.interpolate({
                        inputRange: [0, width * 0.25],
                        outputRange: [0, 1],
                        extrapolate: "clamp",
                      }),
                    },
                  ]}
                >
                  <Text style={styles.overlayBumpText}>BUMP</Text>
                </Animated.View>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.overlayLabel,
                    styles.overlayNah,
                    {
                      opacity: cardX.interpolate({
                        inputRange: [-width * 0.25, 0],
                        outputRange: [1, 0],
                        extrapolate: "clamp",
                      }),
                    },
                  ]}
                >
                  <Text style={styles.overlayNahText}>NAH</Text>
                </Animated.View>
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {current.user.first_name}
                      {!current.user.hide_age && current.user.age ? `, ${current.user.age}` : ""}
                    </Text>
                    {current.user.email_verified && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.lime} />
                    )}
                  </View>
                  {current.user.horoscope && (
                    <Text style={styles.zodiac}>{current.user.horoscope}</Text>
                  )}
                  {current.user.bio ? (
                    <Text style={styles.bio} numberOfLines={2}>
                      {current.user.bio}
                    </Text>
                  ) : null}
                  {(current.user.vibe_tags?.length || current.user.interests?.length) ? (
                    <View style={styles.vibesRow}>
                      {(current.user.vibe_tags || current.user.interests || [])
                        .slice(0, 4)
                        .map((tag: string) => (
                          <View key={tag} style={styles.vibe}>
                            <Text style={styles.vibeText}>{tag}</Text>
                          </View>
                        ))}
                    </View>
                  ) : null}
                </View>
              </Animated.View>
            </>
          )}
        </View>

        {current && (
          <View style={styles.actions}>
            <TouchableOpacity
              testID="action-nah"
              onPress={() => act("pass")}
              disabled={acting}
              style={[styles.actBtn, styles.actNah]}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              testID="action-wave"
              onPress={() => act("hi")}
              disabled={acting}
              style={[styles.actBtn, styles.actWave]}
            >
              <Text style={{ fontSize: 28 }}>👋</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="action-bump"
              onPress={() => act("like")}
              disabled={acting}
              activeOpacity={0.85}
              style={[styles.actBtn, { borderRadius: 999, overflow: "hidden", padding: 0 }]}
            >
              <LinearGradient
                colors={["#7B2EFF", "#FF4FA3"] as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.actBtnInner]}
              >
                <Text style={{ fontSize: 26 }}>💥</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
        {current && (
          <View style={styles.actionLabels}>
            <Text style={styles.actionLabel}>Nah</Text>
            <Text style={styles.actionLabel}>Wave</Text>
            <Text style={[styles.actionLabel, { color: colors.pink, fontWeight: "800" }]}>BUMP</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  center: { flex: 1, backgroundColor: colors.void, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.elevated, alignItems: "center", justifyContent: "center" },
  kicker: { color: colors.lime, fontSize: 10, letterSpacing: 2.5, fontFamily: fonts.bodyBold, fontWeight: "800" },
  venueName: { color: "#fff", fontSize: 15, fontFamily: fonts.bodyBold, fontWeight: "700", marginTop: 2 },
  deck: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  cardBase: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    position: "absolute",
  },
  cardBehind: { transform: [{ scale: 0.94 }, { translateY: 16 }], opacity: 0.55 },
  cardPhoto: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  cardGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "65%" },
  cardTopRow: { position: "absolute", top: 16, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,79,163,0.25)",
    borderWidth: 1,
    borderColor: colors.pink,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.pink, marginRight: 6 },
  liveBadgeText: { color: "#fff", fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bodyBold, fontWeight: "800" },
  venueChip: { display: "none" as any },
  venueChipText: { display: "none" as any },
  cardInfo: { position: "absolute", left: 20, right: 20, bottom: 24 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: "#fff", fontSize: 30, fontFamily: fonts.heading, fontWeight: "900", letterSpacing: -1 },
  zodiac: { color: colors.lime, fontSize: 12, marginTop: 4, fontFamily: fonts.bodyBold, fontWeight: "700", letterSpacing: 0.5 },
  bio: { color: colors.textPrimary, opacity: 0.85, marginTop: 8, fontSize: 14, lineHeight: 18, fontFamily: fonts.body },
  vibesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  vibe: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  vibeText: { color: "#fff", fontSize: 11, fontFamily: fonts.bodyBold, fontWeight: "700" },
  openProfile: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  overlayLabel: {
    position: "absolute",
    top: 60,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 3,
  },
  overlayBump: {
    right: 24,
    borderColor: colors.pink,
    backgroundColor: "rgba(255,79,163,0.15)",
    transform: [{ rotate: "12deg" }],
  },
  overlayBumpText: {
    color: colors.pink,
    fontFamily: fonts.heading,
    fontWeight: "900",
    fontSize: 28,
    letterSpacing: 2,
  },
  overlayNah: {
    left: 24,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.15)",
    transform: [{ rotate: "-12deg" }],
  },
  overlayNahText: {
    color: "#fff",
    fontFamily: fonts.heading,
    fontWeight: "900",
    fontSize: 28,
    letterSpacing: 2,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  actionLabels: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 56,
    marginTop: 8,
    paddingBottom: 12,
  },
  actionLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fonts.bodyBold,
    fontWeight: "700",
    letterSpacing: 1,
    width: 60,
    textAlign: "center",
  },
  actBtn: {
    width: 66,
    height: 66,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  actBtnInner: { width: 66, height: 66, alignItems: "center", justifyContent: "center" },
  actNah: { backgroundColor: "rgba(255,255,255,0.06)" },
  actWave: { backgroundColor: "rgba(200,255,61,0.18)", borderColor: "rgba(200,255,61,0.45)" },
  emptyCard: {
    width: CARD_W,
    minHeight: 280,
    borderRadius: 28,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 48 },
  emptyTitle: { color: "#fff", fontSize: 22, fontFamily: fonts.heading, fontWeight: "900", marginTop: 14, letterSpacing: -0.5 },
  emptySub: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body, textAlign: "center", marginTop: 8 },
});
