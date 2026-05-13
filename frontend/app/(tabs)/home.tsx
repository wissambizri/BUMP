import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ImageBackground,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { resolveImage } from "../../src/img";
import { colors } from "../../src/theme";
import { useAuth } from "../../src/auth";

type Venue = {
  id: string;
  name: string;
  kind: string;
  city: string;
  image: string;
  vibe: string;
  distance_m: number | null;
  active_count: number;
  lat: number;
  lng: number;
};

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCheckin, setActiveCheckin] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  const KINDS = ["All", "Nightclub", "Lounge", "Bar", "Cocktail Bar", "Wine Bar", "Live Music", "Pub", "Fine Dining"] as const;

  const load = useCallback(async (refresh = false) => {
    let lat = 0;
    let lng = 0;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
    } catch {}
    try {
      const [vs, ci] = await Promise.all([api.venues(lat, lng, refresh), api.myCheckin()]);
      setVenues(vs);
      setActiveCheckin(ci.active ? ci.checkin : null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openVenue = (v: Venue) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/venue/${v.id}`);
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
      <FlatList
        data={venues.filter((v) => {
          // Kind filter
          if (kindFilter && v.kind !== kindFilter) return false;
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return (
            v.name.toLowerCase().includes(q) ||
            v.kind.toLowerCase().includes(q) ||
            (v.vibe || "").toLowerCase().includes(q) ||
            (v.city || "").toLowerCase().includes(q)
          );
        })}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.kicker}>HEY {(user?.first_name || "").toUpperCase()}</Text>
                <Text style={styles.h1}>Where are{"\n"}you tonight?</Text>
              </View>
              <TouchableOpacity
                testID="map-btn"
                style={styles.mapBtn}
                onPress={() => router.push("/map")}
              >
                <Ionicons name="map" size={20} color={colors.volt} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={colors.textTertiary} />
              <TextInput
                testID="venue-search"
                value={query}
                onChangeText={setQuery}
                placeholder="Search venues, vibe, city..."
                placeholderTextColor={colors.textTertiary}
                style={styles.searchInput}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
            {activeCheckin && (
              <TouchableOpacity
                testID="active-checkin-card"
                style={styles.activeBanner}
                onPress={() => router.push(`/feed/${activeCheckin.venue_id}`)}
              >
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>
                  YOU'RE LIVE · Tap to see who else is here
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.volt} />
              </TouchableOpacity>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 4, marginBottom: 12 }}
              contentContainerStyle={{ gap: 8, paddingRight: 8 }}
            >
              {KINDS.map((k) => {
                const isActive = (k === "All" && !kindFilter) || k === kindFilter;
                return (
                  <TouchableOpacity
                    key={k}
                    testID={`filter-${k}`}
                    onPress={() => setKindFilter(k === "All" ? null : k)}
                    style={[styles.chip, isActive && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{k}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={styles.section}>
              {kindFilter ? kindFilter.toUpperCase() + "S" : "NEARBY"} · {venues.filter((v) => !kindFilter || v.kind === kindFilter).length}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.volt}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`venue-card-${item.id}`}
            activeOpacity={0.92}
            onPress={() => openVenue(item)}
            style={styles.card}
          >
            <ImageBackground source={{ uri: resolveImage(item.image) }} style={styles.cardBg} imageStyle={{ borderRadius: 24 }}>
              <LinearGradient
                colors={["transparent", "rgba(3,3,5,0.95)"]}
                style={StyleSheet.absoluteFillObject}
              />
              {item.active_count >= 5 ? (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>LIVE · {item.active_count}</Text>
                </View>
              ) : item.active_count >= 1 ? (
                <View style={[styles.liveBadge, { backgroundColor: "rgba(255,200,87,0.18)" }]}>
                  <View style={[styles.liveDot, { backgroundColor: "#FFC857" }]} />
                  <Text style={[styles.liveBadgeText, { color: "#FFC857" }]}>WARMING · {item.active_count}</Text>
                </View>
              ) : (
                <View style={[styles.liveBadge, { backgroundColor: "rgba(176,176,191,0.15)" }]}>
                  <View style={[styles.liveDot, { backgroundColor: colors.textSecondary }]} />
                  <Text style={[styles.liveBadgeText, { color: colors.textSecondary }]}>QUIET</Text>
                </View>
              )}
              <View style={styles.cardBottom}>
                <Text style={styles.cardKind}>{item.kind.toUpperCase()} · {item.city.toUpperCase()}</Text>
                <Text style={styles.cardName}>{item.name}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardVibe}>{item.vibe}</Text>
                  {item.distance_m != null && (
                    <Text style={styles.cardDist}>
                      {item.distance_m < 1000
                        ? `${item.distance_m}m`
                        : `${(item.distance_m / 1000).toFixed(1)}km`}
                    </Text>
                  )}
                </View>
              </View>
            </ImageBackground>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.void },
  header: { paddingTop: 8, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  mapBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    marginBottom: 16,
    marginTop: 8,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 },
  kicker: {
    color: colors.volt,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
  h1: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.5,
    lineHeight: 40,
    marginTop: 6,
  },
  activeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(225,255,0,0.08)",
    borderWidth: 1,
    borderColor: "rgba(225,255,0,0.3)",
    padding: 14,
    borderRadius: 16,
    marginBottom: 16,
    gap: 10,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.volt,
  },
  activeText: {
    flex: 1,
    color: colors.volt,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  section: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 12,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipActive: {
    backgroundColor: colors.volt,
    borderColor: colors.volt,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: colors.inverse,
    fontWeight: "800",
  },
  card: {
    height: 320,
    marginBottom: 16,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.elevated,
  },
  cardBg: { flex: 1, justifyContent: "flex-end" },
  liveBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.volt,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.volt },
  liveBadgeText: {
    color: colors.volt,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  cardBottom: { padding: 20 },
  cardKind: {
    color: colors.volt,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  cardName: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 4,
  },
  cardMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  cardVibe: { color: colors.textSecondary, fontSize: 13 },
  cardDist: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
});
