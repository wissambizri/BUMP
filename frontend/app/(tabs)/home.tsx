import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ImageBackground,
  Image,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { resolveImage } from "../../src/img";
import { colors, fonts } from "../../src/theme";

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
  verified?: boolean;
};

const DEMO_AVATARS = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80",
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80",
];

export default function Home() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCheckin, setActiveCheckin] = useState<any>(null);
  const [query, setQuery] = useState("");

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

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openVenue = (v: Venue) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/venue/${v.id}`);
  };

  const filtered = venues.filter((v) =>
    !query ||
    v.name.toLowerCase().includes(query.toLowerCase()) ||
    v.kind.toLowerCase().includes(query.toLowerCase()) ||
    v.city.toLowerCase().includes(query.toLowerCase())
  );

  const distKm = (m: number | null) => {
    if (m == null) return "—";
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1)} km`;
  };

  const status = (count: number) => {
    if (count >= 5) return { label: "LIVE", icon: "fire", color: "#FF4FA3" };
    if (count >= 1) return { label: "WARMING UP", icon: "eye-outline", color: "#FFC857" };
    return { label: "QUIET", icon: "weather-night", color: "#7BD9FF" };
  };

  const renderItem = ({ item, index }: { item: Venue; index: number }) => {
    const st = status(item.active_count);
    const isActiveHere = activeCheckin?.venue_id === item.id;
    const highlighted = isActiveHere || (index === 0 && st.label === "LIVE");
    return (
      <TouchableOpacity
        testID={`venue-card-${item.id}`}
        onPress={() => openVenue(item)}
        activeOpacity={0.85}
        style={[styles.card, highlighted && styles.cardHighlight]}
      >
        <View style={styles.cardImageWrap}>
          <ImageBackground
            source={{ uri: resolveImage(item.image) }}
            style={styles.cardImage}
            imageStyle={{ borderRadius: 18 }}
          >
            <LinearGradient
              colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.55)"] as any}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.cornerBadge, { borderColor: st.color, backgroundColor: `${st.color}22` }]}>
              <Text style={[styles.cornerBadgeText, { color: st.color }]} numberOfLines={1}>
                {st.label}
              </Text>
            </View>
          </ImageBackground>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={styles.venueName} numberOfLines={1}>{item.name}</Text>
            {item.verified !== false && (
              <Ionicons name="checkmark-circle" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
            )}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {item.kind} · {item.city || "Nearby"}
          </Text>
          <View style={styles.avatarRow}>
            {DEMO_AVATARS.slice(0, 4).map((a, i) => (
              <Image
                key={i}
                source={{ uri: a }}
                style={[styles.avatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i }]}
              />
            ))}
            {item.active_count > 4 && (
              <Text style={styles.plus}>+{item.active_count}</Text>
            )}
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={[styles.statusPill, { borderColor: st.color, backgroundColor: `${st.color}1A` }]}>
            <MaterialCommunityIcons
              name={st.icon as any}
              size={12}
              color={st.color}
            />
            <Text style={[styles.statusPillText, { color: st.color }]} numberOfLines={1}>
              {st.label}
            </Text>
          </View>
          <View style={styles.distRow}>
            <Text style={styles.distText}>{distKm(item.distance_m)}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const Header = (
    <View>
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() && router.back()}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.vibePill}>
          <MaterialCommunityIcons name="waveform" size={18} color={colors.pink} />
          <View style={{ marginLeft: 6 }}>
            <Text style={styles.vibePillCap}>Your vibe</Text>
            <Text style={styles.vibePillLive}>LIVE</Text>
          </View>
        </View>
      </View>

      <View style={styles.titleWrap}>
        <Text style={styles.title}>
          Where are{"\n"}you{" "}
          <Text style={styles.titleAccent}>tonight?</Text>
        </Text>
        <Text style={styles.subtitle}>Pick your venue to see who's around.</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            testID="venue-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search venues, clubs, events…"
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
          />
        </View>
        <TouchableOpacity style={styles.filterBtn} testID="venue-filter">
          <Ionicons name="options" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        testID="map-card"
        activeOpacity={0.9}
        onPress={() => router.push("/map")}
        style={styles.mapCard}
      >
        <ImageBackground
          source={{
            uri: "https://staticmap.openstreetmap.de/staticmap.php?center=25.2048,55.2708&zoom=12&size=800x320&maptype=mapnik",
          }}
          style={styles.mapBg}
          imageStyle={{ borderRadius: 20, opacity: 0.35 }}
        >
          <LinearGradient
            colors={["rgba(20,0,50,0.5)", "rgba(0,0,0,0.85)"] as any}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Mock pins */}
          {[
            { top: "30%", left: "20%", size: 16 },
            { top: "25%", left: "60%", size: 16 },
            { top: "50%", left: "85%", size: 16 },
            { top: "75%", left: "15%", size: 18 },
            { top: "65%", left: "78%", size: 16 },
          ].map((p, i) => (
            <View
              key={i}
              style={[
                styles.mapPin,
                { top: p.top as any, left: p.left as any },
              ]}
            >
              <MaterialCommunityIcons name="star-four-points" size={p.size} color={colors.pink} />
            </View>
          ))}
          {/* Center hero pin */}
          <View style={styles.heroPinWrap}>
            <View style={styles.heroPinGlow} />
            <LinearGradient
              colors={["#7B2EFF", "#FF4FA3"] as any}
              style={styles.heroPin}
            >
              <MaterialCommunityIcons name="star-four-points" size={26} color="#fff" />
            </LinearGradient>
            <View style={styles.heroPinDot} />
          </View>

          <View style={styles.nearMePill}>
            <Ionicons name="navigate" size={14} color="#fff" />
            <Text style={styles.nearMeText}>Near me</Text>
          </View>

          <TouchableOpacity style={styles.recenterBtn} testID="map-recenter">
            <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#fff" />
          </TouchableOpacity>

          <Text style={[styles.mapLabel, { top: "12%", left: "45%" }]}>JUMEIRAH</Text>
          <Text style={[styles.mapLabel, { top: "50%", left: "70%" }]}>DIFC</Text>
          <Text style={[styles.mapLabel, { top: "73%", left: "32%" }]}>DOWNTOWN</Text>
        </ImageBackground>
      </TouchableOpacity>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Popular nearby</Text>
        <TouchableOpacity>
          <Text style={styles.seeAll}>See all ›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const Footer = (
    <TouchableOpacity
      testID="suggest-venue"
      activeOpacity={0.9}
      onPress={() =>
        Alert.alert(
          "Suggest a venue",
          "Tell us where the party's at and we'll add it.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Email us",
              onPress: () => Linking.openURL("mailto:hello@bumpnetwork.me?subject=Venue%20suggestion"),
            },
          ]
        )
      }
      style={styles.suggestCard}
    >
      <View style={styles.suggestLeft}>
        <View style={styles.suggestStar}>
          <Ionicons name="star" size={20} color={colors.pink} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.suggestTitle}>Can't find your venue?</Text>
          <Text style={styles.suggestSub}>Tap to suggest a venue and tell us where the party's at.</Text>
        </View>
      </View>
      <LinearGradient
        colors={["#7B2EFF", "#FF4FA3"] as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.suggestBtn}
      >
        <Text style={styles.suggestBtnText}>Suggest venue</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.pink} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <FlatList
        data={filtered}
        keyExtractor={(v) => v.id}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        contentContainerStyle={{ paddingBottom: 32 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
            tintColor={colors.pink}
          />
        }
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.body }}>
              No venues found. Try a different search.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  vibePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(123,46,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(123,46,255,0.5)",
  },
  vibePillCap: { color: colors.textSecondary, fontSize: 10, fontFamily: fonts.body },
  vibePillLive: {
    color: colors.pink,
    fontSize: 13,
    fontFamily: fonts.heading,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: -2,
  },

  titleWrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  title: {
    color: "#fff",
    fontSize: 42,
    fontFamily: fonts.heading,
    fontWeight: "900",
    letterSpacing: -1.5,
    lineHeight: 46,
  },
  titleAccent: { color: colors.primary },
  subtitle: { color: colors.textSecondary, fontSize: 15, marginTop: 10, fontFamily: fonts.body },

  searchRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 14,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: fonts.body,
    paddingVertical: 0,
  },
  filterBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  // Map preview
  mapCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 20,
    overflow: "hidden",
    height: 200,
    borderWidth: 1,
    borderColor: "rgba(123,46,255,0.4)",
  },
  mapBg: { flex: 1, padding: 14 },
  mapPin: { position: "absolute" },
  heroPinWrap: {
    position: "absolute",
    top: "38%",
    left: "44%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroPinGlow: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,79,163,0.25)",
  },
  heroPin: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  heroPinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    marginTop: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  nearMePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  nearMeText: { color: "#fff", fontSize: 12, fontFamily: fonts.bodyBold, fontWeight: "700" },
  recenterBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapLabel: {
    position: "absolute",
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontFamily: fonts.heading,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  // Section
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: fonts.heading,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  seeAll: { color: colors.pink, fontSize: 14, fontFamily: fonts.bodyBold, fontWeight: "700" },

  // Card
  card: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    padding: 10,
    borderRadius: 22,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  cardHighlight: {
    borderColor: colors.pink,
    borderWidth: 1.5,
    shadowColor: colors.pink,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  cardImageWrap: { width: 84, height: 84 },
  cardImage: { width: "100%", height: "100%", justifyContent: "flex-start" },
  cornerBadge: {
    alignSelf: "flex-start",
    margin: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  cornerBadgeText: {
    fontSize: 9,
    fontFamily: fonts.heading,
    fontWeight: "900",
    letterSpacing: 1,
  },
  cardBody: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  venueName: { color: "#fff", fontSize: 16, fontFamily: fonts.heading, fontWeight: "800", letterSpacing: -0.3 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 2, fontFamily: fonts.body },
  avatarRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.elevated,
    backgroundColor: colors.surface,
  },
  plus: { color: colors.textSecondary, fontSize: 12, marginLeft: 6, fontFamily: fonts.bodyBold, fontWeight: "700" },

  cardRight: { alignItems: "flex-end", justifyContent: "space-between", height: 84, marginLeft: 8 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 10, fontFamily: fonts.heading, fontWeight: "900", letterSpacing: 1 },
  distRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  distText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.bodyBold, fontWeight: "700" },

  // Suggest venue card
  suggestCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 24,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "rgba(123,46,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(123,46,255,0.4)",
    gap: 10,
  },
  suggestLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  suggestStar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,79,163,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,79,163,0.4)",
  },
  suggestTitle: { color: "#fff", fontSize: 14, fontFamily: fonts.heading, fontWeight: "800" },
  suggestSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2, fontFamily: fonts.body, lineHeight: 14 },
  suggestBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
  },
  suggestBtnText: { color: "#fff", fontSize: 13, fontFamily: fonts.heading, fontWeight: "800" },
});
