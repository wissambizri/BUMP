import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { colors } from "../src/theme";

type Blocked = {
  id: string;
  first_name?: string;
  username?: string;
  age?: number;
  photos?: string[];
};

export default function BlockedScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.blockedList();
      setItems(data || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onUnblock = (b: Blocked) => {
    Alert.alert(
      `Unblock ${b.first_name || b.username}?`,
      "They'll be able to see you again.",
      [
        { text: "Cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            setUnblockingId(b.id);
            try {
              await api.unblock(b.id);
              setItems((prev) => prev.filter((x) => x.id !== b.id));
            } catch (e: any) {
              Alert.alert("Error", e?.response?.data?.detail || "Try again");
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Blocked users</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.volt} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Nothing here</Text>
              <Text style={styles.emptySub}>
                Users you block will appear here. You can unblock anytime.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const photo = (item.photos && item.photos[0]) || null;
            return (
              <View style={styles.row} testID={`blocked-${item.id}`}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="person" size={22} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.name}>
                    {item.first_name || item.username || "Unknown"}
                    {item.age ? `, ${item.age}` : ""}
                  </Text>
                  {item.username && (
                    <Text style={styles.handle}>@{item.username}</Text>
                  )}
                </View>
                <TouchableOpacity
                  testID={`unblock-${item.id}`}
                  style={styles.unblockBtn}
                  onPress={() => onUnblock(item)}
                  disabled={unblockingId === item.id}
                >
                  {unblockingId === item.id ? (
                    <ActivityIndicator color={colors.inverse} />
                  ) : (
                    <Text style={styles.unblockText}>Unblock</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.glassBorder,
  },
  backBtn: { padding: 6 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  emptySub: { color: colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.base },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  handle: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  unblockBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.volt,
  },
  unblockText: { color: colors.inverse, fontWeight: "800", fontSize: 13 },
});
