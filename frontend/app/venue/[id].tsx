import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "../../src/api";
import { colors } from "../../src/theme";

export default function VenueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [venue, setVenue] = useState<any>(null);
  const [active, setActive] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const v = await api.venue(String(id));
      setVenue(v);
      const ci = await api.myCheckin();
      setActive(ci.active ? ci.checkin : null);
    })();
  }, [id]);

  if (!venue) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.volt} />
      </View>
    );
  }

  const isHereAlready = active && active.venue_id === venue.id;

  const goCheckin = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (isHereAlready) {
      router.push(`/feed/${venue.id}`);
    } else {
      router.push(`/checkin/${venue.id}`);
    }
  };

  return (
    <View style={styles.root}>
      <ImageBackground source={{ uri: venue.image }} style={styles.bg}>
        <LinearGradient
          colors={["rgba(3,3,5,0.2)", "rgba(3,3,5,0.95)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={styles.safe}>
          <TouchableOpacity
            testID="back-button"
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <View style={styles.content}>
            <View style={styles.liveRow}>
              <View style={styles.dot} />
              <Text style={styles.liveText}>LIVE · {venue.active_count} HERE NOW</Text>
            </View>
            <Text style={styles.h1}>{venue.name}</Text>
            <Text style={styles.kind}>{venue.kind} · {venue.city}</Text>
            <Text style={styles.vibe}>{venue.vibe}</Text>

            <TouchableOpacity
              testID="checkin-cta"
              style={styles.cta}
              onPress={goCheckin}
              activeOpacity={0.9}
            >
              <Text style={styles.ctaText}>
                {isHereAlready ? "Open the room →" : "I'm here · Check in"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.footer}>
              GPS validation required. Live selfie expires in 6h.
            </Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.void },
  bg: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 24 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  content: { paddingBottom: 32 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.volt },
  liveText: { color: colors.volt, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  h1: { color: colors.textPrimary, fontSize: 44, fontWeight: "900", letterSpacing: -2, lineHeight: 46 },
  kind: { color: colors.textSecondary, fontSize: 13, marginTop: 6, letterSpacing: 2 },
  vibe: { color: colors.textPrimary, fontSize: 16, marginTop: 12 },
  cta: {
    backgroundColor: colors.volt,
    paddingVertical: 20,
    borderRadius: 999,
    alignItems: "center",
    marginTop: 24,
  },
  ctaText: { color: colors.inverse, fontSize: 17, fontWeight: "800" },
  footer: { color: colors.textTertiary, fontSize: 11, textAlign: "center", marginTop: 14, letterSpacing: 1 },
});
