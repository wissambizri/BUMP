import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors, fonts } from "../../src/theme";

type TabKey = "all" | "waves" | "bumps" | "matches";

type FeedItem = {
  type: "wave" | "bump" | "match";
  id: string;
  user: any;
  matchId?: string;
  kept?: boolean;
  expires_at?: string;
  last_message?: string | null;
  created_at?: string;
};

export default function MyBumps() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("all");
  const [matches, setMatches] = useState<any[]>([]);
  const [received, setReceived] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [ms, rcv] = await Promise.all([api.matches(), api.likesReceived().catch(() => [])]);
      setMatches(ms || []);
      setReceived(rcv || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const items: FeedItem[] = useMemo(() => {
    const waves: FeedItem[] = received
      .filter((r: any) => r.action === "hi")
      .map((r: any) => ({
        type: "wave",
        id: r.id,
        user: r.user,
        created_at: r.created_at,
      }));
    const bumps: FeedItem[] = received
      .filter((r: any) => r.action === "like")
      .map((r: any) => ({
        type: "bump",
        id: r.id,
        user: r.user,
        created_at: r.created_at,
      }));
    const matchList: FeedItem[] = matches.map((m: any) => ({
      type: "match",
      id: m.match_id,
      matchId: m.match_id,
      user: m.user,
      kept: m.kept,
      expires_at: m.expires_at,
      last_message: m.last_message,
      created_at: m.created_at,
    }));
    if (tab === "waves") return waves;
    if (tab === "bumps") return bumps;
    if (tab === "matches") return matchList;
    return [...matchList, ...bumps, ...waves];
  }, [tab, matches, received]);

  const counts = {
    all: matches.length + received.length,
    waves: received.filter((r) => r.action === "hi").length,
    bumps: received.filter((r) => r.action === "like").length,
    matches: matches.length,
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.pink} />
      </View>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "waves", label: "Waves" },
    { key: "bumps", label: "Bumps" },
    { key: "matches", label: "Matches" },
  ];

  const renderItem = ({ item }: { item: FeedItem }) => {
    let badge: any = null;
    let onPress: () => void = () => {};
    if (item.type === "wave") {
      badge = (
        <View style={[styles.badge, { backgroundColor: "rgba(255,200,87,0.14)", borderColor: "rgba(255,200,87,0.4)" }]}>
          <MaterialCommunityIcons name="hand-wave" size={12} color="#FFC857" />
          <Text style={[styles.badgeText, { color: "#FFC857" }]}>Waved at you</Text>
        </View>
      );
      onPress = () => {};
    } else if (item.type === "bump") {
      badge = (
        <View style={[styles.badge, { backgroundColor: "rgba(255,79,163,0.14)", borderColor: "rgba(255,79,163,0.4)" }]}>
          <MaterialCommunityIcons name="star-four-points" size={12} color={colors.pink} />
          <Text style={[styles.badgeText, { color: colors.pink }]}>Bumped you</Text>
        </View>
      );
      onPress = () => {};
    } else {
      badge = (
        <View style={[styles.badge, { backgroundColor: "rgba(123,46,255,0.16)", borderColor: "rgba(123,46,255,0.45)" }]}>
          <Ionicons name="flash" size={12} color={colors.primary} />
          <Text style={[styles.badgeText, { color: "#B9A4FF" }]}>{item.kept ? "Kept · matched" : "Matched"}</Text>
        </View>
      );
      onPress = () => router.push(`/chat/${item.matchId}`);
    }

    return (
      <TouchableOpacity
        testID={`bumps-row-${item.id}`}
        onPress={onPress}
        activeOpacity={0.85}
        style={styles.row}
      >
        <Image
          source={{ uri: item.user.photos?.[0] || "https://placehold.co/200" }}
          style={styles.avatar}
        />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.name}>
            {item.user.first_name}
            {!item.user.hide_age && item.user.age ? `, ${item.user.age}` : ""}
          </Text>
          {item.type === "match" ? (
            <Text style={styles.msg} numberOfLines={1}>
              {item.last_message || "Say hi!"}
            </Text>
          ) : (
            <Text style={styles.msg} numberOfLines={1}>
              {item.user.bio || "Tap to view profile"}
            </Text>
          )}
          <View style={{ marginTop: 6 }}>{badge}</View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.headerWrap}>
        <Text style={styles.kicker}>YOUR</Text>
        <Text style={styles.h1}>Bumps</Text>
      </View>

      <View style={styles.tabRow}>
        {tabs.map((t) => {
          const active = tab === t.key;
          const count = counts[t.key];
          if (active) {
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                testID={`tab-${t.key}`}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#7B2EFF", "#FF4FA3"] as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tabPill}
                >
                  <Text style={styles.tabPillText}>{t.label}</Text>
                  {count > 0 && <Text style={styles.tabPillCount}> · {count}</Text>}
                </LinearGradient>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              testID={`tab-${t.key}`}
              style={styles.tabPillInactive}
              activeOpacity={0.85}
            >
              <Text style={styles.tabPillTextInactive}>{t.label}</Text>
              {count > 0 && <Text style={styles.tabPillCountInactive}> · {count}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {items.length === 0 ? (
        <View style={[styles.center, { flex: 1 }]}>
          <Text style={styles.emptyTitle}>
            {tab === "all" ? "No bumps yet" : tab === "waves" ? "No waves yet" : tab === "bumps" ? "No bumps yet" : "No matches yet"}
          </Text>
          <Text style={styles.emptySub}>Check in to a venue to meet people nearby</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.type}-${it.id}`}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 12 }}
          renderItem={renderItem}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  center: { alignItems: "center", justifyContent: "center" },
  headerWrap: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
  kicker: { color: colors.pink, fontSize: 11, letterSpacing: 2, fontFamily: fonts.heading, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 36, fontFamily: fonts.heading, fontWeight: "900", letterSpacing: -1.5, marginTop: 6 },
  emptyTitle: { color: "#fff", fontSize: 22, fontWeight: "800", fontFamily: fonts.heading },
  emptySub: { color: colors.textSecondary, marginTop: 8, fontSize: 14, fontFamily: fonts.body },
  tabRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  tabPill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, flexDirection: "row", alignItems: "center" },
  tabPillText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.3, fontFamily: fonts.bodyBold },
  tabPillCount: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "800", fontFamily: fonts.bodyBold },
  tabPillInactive: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    flexDirection: "row",
    alignItems: "center",
  },
  tabPillTextInactive: { color: colors.textSecondary, fontSize: 13, fontWeight: "600", fontFamily: fonts.body },
  tabPillCountInactive: { color: colors.textTertiary, fontSize: 13, fontFamily: fonts.body },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.elevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface },
  name: { color: "#fff", fontSize: 17, fontWeight: "800", fontFamily: fonts.heading, letterSpacing: -0.3 },
  msg: { color: colors.textSecondary, fontSize: 13, marginTop: 3, fontFamily: fonts.body },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2, fontFamily: fonts.bodyBold },
});
