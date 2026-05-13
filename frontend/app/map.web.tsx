import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { colors } from "../src/theme";

export default function MapScreen() {
  const router = useRouter();
  const [venues, setVenues] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const v = await api.venues(40.758, -73.9855);
      setVenues(v || []);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity testID="map-back" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Map</Text>
        <View style={{ width: 26 }} />
      </View>
      <View style={[styles.center, { flex: 1, padding: 32 }]}>
        <Ionicons name="map" size={56} color={colors.textTertiary} />
        <Text style={styles.empty}>Map view is available on iOS and Android only.</Text>
        <Text style={styles.emptySub}>{venues.length} venues found nearby</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  empty: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", textAlign: "center" },
  emptySub: { color: colors.textSecondary, fontSize: 13 },
});
