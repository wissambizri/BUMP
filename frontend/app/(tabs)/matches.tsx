import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors } from "../../src/theme";

export default function Matches() {
  const router = useRouter();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "kept" | "expiring">("all");

  const load = useCallback(async () => {
    try {
      const ms = await api.matches();
      setMatches(ms);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const timeLeft = (expIso: string) => {
    const exp = new Date(expIso).getTime();
    const ms = exp - Date.now();
    if (ms <= 0) return "expired";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m left`;
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
      <View style={{ padding: 24, paddingBottom: 8 }}>
        <Text style={styles.kicker}>YOUR</Text>
        <Text style={styles.h1}>Bumps</Text>
      </View>
      {matches.length > 0 && (
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            testID="matches-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name..."
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      )}
      {matches.length > 0 && (
        <View style={styles.filterRow}>
          {(["all", "active", "kept", "expiring"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              testID={`filter-${f}`}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f === "all" ? "All" : f === "active" ? "New" : f === "kept" ? "Kept" : "Expiring"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {matches.length === 0 ? (
        <View style={[styles.center, { flex: 1 }]}>
          <Text style={styles.emptyTitle}>No bumps yet</Text>
          <Text style={styles.emptySub}>Check in to a venue to meet people nearby</Text>
        </View>
      ) : (
        <FlatList
          data={matches.filter((m) =>
            !query.trim() ||
            (m.user?.first_name || "").toLowerCase().includes(query.trim().toLowerCase())
          )}
          keyExtractor={(m) => m.match_id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`match-${item.match_id}`}
              style={styles.row}
              onPress={() => router.push(`/chat/${item.match_id}`)}
            >
              <Image
                source={{ uri: item.user.photos?.[0] || "https://placehold.co/200" }}
                style={styles.avatar}
              />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>
                    {item.user.first_name}, {item.user.age}
                  </Text>
                  {item.kept ? (
                    <Text style={styles.kept}>KEPT</Text>
                  ) : (
                    <Text style={styles.timer}>{timeLeft(item.expires_at)}</Text>
                  )}
                </View>
                <Text style={styles.msg} numberOfLines={1}>
                  {item.last_message || "Say hi!"}
                </Text>
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
  kicker: { color: colors.volt, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  h1: { color: colors.textPrimary, fontSize: 36, fontWeight: "900", letterSpacing: -1.5, marginTop: 6 },
  emptyTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: "700" },
  emptySub: { color: colors.textSecondary, marginTop: 8, fontSize: 14 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.elevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.elevated },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  timer: { color: colors.fuchsia, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  kept: { color: colors.volt, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  msg: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.glassBorder },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  filterTextActive: { color: "#fff" },
});
