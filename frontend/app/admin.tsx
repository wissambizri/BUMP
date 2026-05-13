import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { colors } from "../src/theme";

export default function Admin() {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "users" | "reports" | "venues">("overview");
  const [analytics, setAnalytics] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [a, u, r, v] = await Promise.all([
        api.adminAnalytics(),
        api.adminUsers(),
        api.adminReports(),
        api.venues(0, 0),
      ]);
      setAnalytics(a);
      setUsers(u);
      setReports(r);
      setVenues(v);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Admin only");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const delUser = (id: string) => {
    Alert.alert("Delete user?", "", [
      { text: "Cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.adminDeleteUser(id);
          load();
        },
      },
    ]);
  };

  const resolve = async (id: string) => {
    await api.adminResolve(id);
    load();
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
        <TouchableOpacity testID="admin-back" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Admin</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 50 }}
        contentContainerStyle={styles.tabsRow}
      >
        {(["overview", "users", "reports", "venues"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            testID={`admin-tab-${t}`}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {tab === "overview" && analytics && (
          <View style={styles.grid}>
            <Stat label="Users" value={analytics.total_users} />
            <Stat label="Venues" value={analytics.total_venues} />
            <Stat label="Live now" value={analytics.active_checkins} accent />
            <Stat label="Matches" value={analytics.total_matches} />
            <Stat label="Messages" value={analytics.total_messages} />
            <Stat label="Open reports" value={analytics.open_reports} danger />
          </View>
        )}

        {tab === "users" && (
          <View>
            {users.map((u) => (
              <View key={u.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{u.first_name}, {u.age}</Text>
                  <Text style={styles.rowSub}>{u.email}</Text>
                </View>
                {u.is_admin && <Text style={styles.tag}>ADMIN</Text>}
                <TouchableOpacity
                  testID={`del-user-${u.id}`}
                  onPress={() => delUser(u.id)}
                  style={styles.delBtn}
                >
                  <Ionicons name="trash" size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {tab === "reports" && (
          <View>
            {reports.length === 0 ? (
              <Text style={{ color: colors.textSecondary, padding: 20, textAlign: "center" }}>
                No reports.
              </Text>
            ) : (
              reports.map((r) => (
                <View key={r.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{r.reason}</Text>
                    <Text style={styles.rowSub}>
                      from {r.from_user.slice(0, 6)} → {r.target_user.slice(0, 6)}
                    </Text>
                    <Text style={[styles.rowSub, { color: r.status === "open" ? colors.fuchsia : colors.volt }]}>
                      {r.status}
                    </Text>
                  </View>
                  {r.status === "open" && (
                    <TouchableOpacity
                      testID={`resolve-${r.id}`}
                      onPress={() => resolve(r.id)}
                      style={styles.resolveBtn}
                    >
                      <Text style={styles.resolveText}>RESOLVE</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {tab === "venues" && (
          <View>
            {venues.map((v) => (
              <View key={v.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{v.name}</Text>
                  <Text style={styles.rowSub}>{v.kind} · {v.city}</Text>
                  <Text style={styles.rowSub}>
                    {v.lat.toFixed(4)}, {v.lng.toFixed(4)} · geofence 250m
                  </Text>
                </View>
                <View style={styles.venueCount}>
                  <Text style={styles.venueCountNum}>{v.active_count}</Text>
                  <Text style={styles.venueCountLabel}>live</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: number;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={styles.statCell}>
      <Text
        style={[
          styles.statValue,
          accent && { color: colors.volt },
          danger && { color: colors.danger },
        ]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "900" },
  tabsRow: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  tabActive: { backgroundColor: colors.volt, borderColor: colors.volt },
  tabText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  tabTextActive: { color: colors.inverse, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCell: {
    width: "47%",
    backgroundColor: colors.elevated,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  statValue: { color: colors.textPrimary, fontSize: 38, fontWeight: "900", letterSpacing: -1 },
  statLabel: { color: colors.textSecondary, fontSize: 10, letterSpacing: 2, marginTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.elevated,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 8,
  },
  rowName: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  tag: {
    color: colors.inverse,
    backgroundColor: colors.volt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    overflow: "hidden",
  },
  delBtn: { padding: 8 },
  resolveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.volt,
    borderRadius: 999,
  },
  resolveText: { color: colors.inverse, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  venueCount: { alignItems: "center" },
  venueCountNum: { color: colors.volt, fontSize: 24, fontWeight: "900" },
  venueCountLabel: { color: colors.textSecondary, fontSize: 10, letterSpacing: 1 },
});
