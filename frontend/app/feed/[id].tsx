import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors } from "../../src/theme";

const { width } = Dimensions.get("window");
const CARD_W = (width - 60) / 2;

export default function VenueFeed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [feed, setFeed] = useState<any[]>([]);
  const [venue, setVenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  const since = (iso: string) => {
    const m = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  };

  const openProfile = (userId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${userId}?venue=${id}`);
  };

  const leave = async () => {
    Alert.alert("Leave venue?", "You'll be removed from this venue's live feed.", [
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
        <ActivityIndicator color={colors.volt} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity testID="feed-back" onPress={() => router.replace("/(tabs)/home")}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.kicker}>LIVE NOW · {feed.length + 1}</Text>
          <Text style={styles.venueName} numberOfLines={1}>{venue?.name}</Text>
        </View>
        <TouchableOpacity testID="leave-feed" onPress={leave}>
          <Ionicons name="exit-outline" size={24} color={colors.fuchsia} />
        </TouchableOpacity>
      </View>

      {feed.length === 0 ? (
        <View style={[styles.center, { flex: 1, padding: 32 }]}>
          <Text style={styles.emptyTitle}>You're the first one here.</Text>
          <Text style={styles.emptySub}>Hang tight — others will arrive.</Text>
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.user.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 20 }}
          contentContainerStyle={{ paddingBottom: 40, gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`feed-user-${item.user.id}`}
              activeOpacity={0.9}
              style={[styles.card, { width: CARD_W }]}
              onPress={() => openProfile(item.user.id)}
            >
              <Image
                source={{ uri: item.user.photos?.[0] || "https://placehold.co/400" }}
                style={styles.cardImg}
              />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.95)"]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.liveBadge}>
                <View style={styles.dot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <View style={styles.cardBottom}>
                <Text style={styles.name}>
                  {item.user.first_name}, {item.user.age}
                </Text>
                <Text style={styles.time}>{since(item.checked_in_at)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  kicker: { color: colors.volt, fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  venueName: { color: colors.textPrimary, fontSize: 22, fontWeight: "900", letterSpacing: -1 },
  emptyTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", textAlign: "center" },
  emptySub: { color: colors.textSecondary, marginTop: 8, textAlign: "center" },
  card: {
    aspectRatio: 0.75,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.elevated,
  },
  cardImg: { width: "100%", height: "100%" },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.volt },
  liveText: { color: colors.volt, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  cardBottom: { position: "absolute", bottom: 10, left: 10, right: 10 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  time: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
});
