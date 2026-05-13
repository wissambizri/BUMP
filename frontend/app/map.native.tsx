import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { api } from "../src/api";
import { resolveImage } from "../src/img";
import { colors } from "../src/theme";

type Venue = {
  id: string;
  name: string;
  kind: string;
  city: string;
  image: string;
  active_count: number;
  lat: number;
  lng: number;
};

export default function MapScreen() {
  const router = useRouter();
  const [region, setRegion] = useState({
    latitude: 40.758,
    longitude: -73.9855,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
  });
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Venue | null>(null);

  const load = useCallback(async (lat: number, lng: number) => {
    try {
      const v = await api.venues(lat, lng);
      setVenues(v || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({});
          const r = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          };
          setRegion(r);
          await load(r.latitude, r.longitude);
          return;
        }
      } catch {}
      await load(region.latitude, region.longitude);
    })();
  }, []);

  return (
    <View style={styles.root}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={region}
        showsUserLocation
        userInterfaceStyle="dark"
      >
        {venues.map((v) => (
          <Marker
            key={v.id}
            coordinate={{ latitude: v.lat, longitude: v.lng }}
            title={v.name}
            description={`${v.kind} · ${v.active_count} live`}
            pinColor={v.active_count > 0 ? "yellow" : "white"}
            onPress={() => setSel(v)}
          />
        ))}
      </MapView>
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Map · {venues.length}</Text>
          <View style={{ width: 40 }} />
        </View>
        {loading && <ActivityIndicator color={colors.volt} style={{ marginTop: 12 }} />}
        {sel && (
          <TouchableOpacity style={styles.selCard} onPress={() => router.push(`/venue/${sel.id}`)}>
            <Image source={{ uri: resolveImage(sel.image) }} style={styles.selImg} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.selName} numberOfLines={1}>
                {sel.name}
              </Text>
              <Text style={styles.selSub}>
                {sel.kind} · {sel.active_count} live
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.volt} />
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "rgba(3,3,5,0.7)",
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  selCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    margin: 16,
    backgroundColor: colors.elevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.volt,
  },
  selImg: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.base },
  selName: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  selSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
});
