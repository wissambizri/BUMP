import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors, fonts } from "../../src/theme";

const VIBE_COLORS: Record<string, [string, string]> = {
  House: ["#7B2EFF", "#9B5BFF"],
  "Hip-Hop": ["#FF4FA3", "#FF7DC4"],
  Afterparty: ["#FF4FA3", "#7B2EFF"],
  Cocktails: ["#00D9FF", "#7B2EFF"],
  Dancing: ["#FF4FA3", "#FFC857"],
  Food: ["#FFC857", "#FF4FA3"],
  Networking: ["#00D9FF", "#7B2EFF"],
  Artists: ["#C8FF3D", "#00D9FF"],
  Business: ["#7B2EFF", "#15151F"],
  "Good vibes": ["#C8FF3D", "#FFC857"],
};

const getVibeColors = (label: string): [string, string] => {
  return VIBE_COLORS[label] || ["#7B2EFF", "#FF4FA3"];
};

export default function UserProfile() {
  const { uid, venue } = useLocalSearchParams<{ uid: string; venue?: string }>();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const feed = await api.feed(String(venue || ""));
        const u = feed.find((f: any) => f.user.id === uid);
        setUser(u?.user || null);
      } catch {}
      finally {
        setLoading(false);
      }
    })();
  }, [uid, venue]);

  const block = () => {
    Alert.alert("Block this user?", "They won't see you, you won't see them. Existing matches will be removed.", [
      { text: "Cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          await api.block(String(uid));
          Alert.alert("Blocked", "You can unblock from Settings → Blocked.");
          router.back();
        },
      },
    ]);
  };

  const [reportOpen, setReportOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const REPORT_REASONS: { code: string; label: string; icon: string }[] = [
    { code: "spam", label: "Spam or scam", icon: "ban-outline" },
    { code: "harassment", label: "Harassment or hate", icon: "warning-outline" },
    { code: "inappropriate_photo", label: "Inappropriate photos", icon: "image-outline" },
    { code: "fake_profile", label: "Fake profile", icon: "person-remove-outline" },
    { code: "underage", label: "Underage user", icon: "alert-circle-outline" },
    { code: "violence", label: "Violence or threats", icon: "shield-outline" },
    { code: "other", label: "Something else", icon: "ellipsis-horizontal" },
  ];

  const submitReport = async (code: string) => {
    setReportBusy(true);
    try {
      await api.report(String(uid), code);
      setReportOpen(false);
      Alert.alert("Thank you", "We'll review within 24h. The user has been blocked for you.");
      router.back();
    } catch (e: any) {
      Alert.alert("Couldn't submit", e?.response?.data?.detail || "Try again");
    } finally {
      setReportBusy(false);
    }
  };

  const report = () => setReportOpen(true);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.pink} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary, fontFamily: fonts.body }}>User left the venue.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.pink, fontFamily: fonts.bodyBold, fontWeight: "700" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const interests = user.interests || [];
  const mutualVibes = Math.min(interests.length, 5);

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.imageWrap}>
          <Image source={{ uri: user.photos?.[0] }} style={styles.image} />
          <LinearGradient
            colors={["rgba(0,0,0,0.5)", "transparent", "rgba(13,13,20,0.95)", "#0D0D14"] as any}
            locations={[0, 0.35, 0.85, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          <SafeAreaView style={styles.topBar} edges={["top"]}>
            {/* Close (X) — gradient ring */}
            <TouchableOpacity testID="profile-back" onPress={() => router.back()} activeOpacity={0.8}>
              <LinearGradient
                colors={["#7B2EFF", "#FF4FA3"] as any}
                style={styles.closeRing}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.closeInner}>
                  <Ionicons name="close" size={20} color="#fff" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {/* VIP badge */}
            <LinearGradient
              colors={["#FFC857", "#FF4FA3"] as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.vipBadge}
            >
              <Ionicons name="diamond" size={11} color="#0D0D14" />
              <Text style={styles.vipText}>VIP</Text>
            </LinearGradient>
          </SafeAreaView>

          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {user.first_name}
                {!user.hide_age && user.age ? `, ${user.age}` : ""}
              </Text>
              {(user.email_verified || user.phone_verified) && (
                <Ionicons name="checkmark-circle" size={22} color="#00D9FF" />
              )}
            </View>
            {user.occupation ? (
              <Text style={styles.occupation}>{user.occupation}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

          {interests.length > 0 && (
            <View style={styles.chips}>
              {interests.map((i: string) => {
                const [c1, c2] = getVibeColors(i);
                return (
                  <LinearGradient
                    key={i}
                    colors={[c1, c2] as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.chip}
                  >
                    <Text style={styles.chipText}>{i}</Text>
                  </LinearGradient>
                );
              })}
            </View>
          )}

          {mutualVibes > 0 && (
            <View style={styles.mutualRow}>
              <View style={styles.mutualAvatars}>
                {Array.from({ length: Math.min(2, mutualVibes) }).map((_, i) => (
                  <View
                    key={i}
                    style={[styles.mutualAvatar, { marginLeft: i === 0 ? 0 : -10, backgroundColor: i === 0 ? colors.primary : colors.pink }]}
                  >
                    <Text style={{ fontSize: 11 }}>{i === 0 ? "🎵" : "🌵"}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.mutualText}>
                {mutualVibes} mutual vibe{mutualVibes > 1 ? "s" : ""}
              </Text>
            </View>
          )}

          {user.photos?.length > 1 && (
            <>
              <Text style={styles.label}>MORE</Text>
              <View style={styles.gallery}>
                {user.photos.slice(1).map((p: string, i: number) => (
                  <Image key={i} source={{ uri: p }} style={styles.galleryImg} />
                ))}
              </View>
            </>
          )}

          <View style={styles.safety}>
            <TouchableOpacity testID="block-btn" onPress={block} style={styles.safetyBtn}>
              <Ionicons name="ban" size={15} color={colors.textSecondary} />
              <Text style={styles.safetyText}>Block</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="report-btn" onPress={report} style={styles.safetyBtn}>
              <Ionicons name="flag" size={15} color={colors.textSecondary} />
              <Text style={styles.safetyText}>Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal visible={reportOpen} animationType="slide" transparent onRequestClose={() => setReportOpen(false)}>
        <Pressable style={reportStyles.backdrop} onPress={() => !reportBusy && setReportOpen(false)}>
          <Pressable style={reportStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={reportStyles.handle} />
            <Text style={reportStyles.title}>Report user</Text>
            <Text style={reportStyles.subtitle}>Pick a reason. We review within 24h.</Text>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r.code}
                testID={`report-${r.code}`}
                style={reportStyles.row}
                onPress={() => submitReport(r.code)}
                disabled={reportBusy}
              >
                <Ionicons name={r.icon as any} size={20} color={colors.textPrimary} />
                <Text style={reportStyles.rowText}>{r.label}</Text>
                {reportBusy ? (
                  <ActivityIndicator color={colors.textTertiary} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={reportStyles.cancel}
              onPress={() => setReportOpen(false)}
              disabled={reportBusy}
            >
              <Text style={reportStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.void },
  imageWrap: { width: "100%", aspectRatio: 0.78, position: "relative" },
  image: { width: "100%", height: "100%", backgroundColor: colors.elevated },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    paddingHorizontal: 20,
    alignItems: "center",
  },
  closeRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  closeInner: {
    flex: 1,
    width: "100%",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.void,
  },
  vipBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  vipText: {
    color: "#0D0D14",
    fontFamily: fonts.heading,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1.5,
  },
  nameBlock: { position: "absolute", left: 24, right: 24, bottom: 24 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: {
    color: "#fff",
    fontSize: 34,
    fontFamily: fonts.heading,
    fontWeight: "900",
    letterSpacing: -1.2,
  },
  occupation: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: 4,
    fontFamily: fonts.body,
    fontWeight: "500",
  },
  body: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 60 },
  bio: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 23,
    fontFamily: fonts.body,
    marginBottom: 20,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: fonts.bodyBold,
    fontWeight: "700",
  },
  mutualRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  mutualAvatars: { flexDirection: "row" },
  mutualAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.void,
  },
  mutualText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.body,
    fontWeight: "500",
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 24,
    marginBottom: 12,
    fontFamily: fonts.heading,
    fontWeight: "800",
  },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  galleryImg: { width: "47%", aspectRatio: 0.75, borderRadius: 16, backgroundColor: colors.elevated },
  safety: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  safetyBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  safetyText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body },
});

const reportStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.base,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.glassBorder,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "900", letterSpacing: -0.5, fontFamily: fonts.heading },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 16, marginTop: 4, fontFamily: fonts.body },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.glassBorder,
  },
  rowText: { color: colors.textPrimary, fontSize: 15, flex: 1, fontWeight: "600", fontFamily: fonts.body },
  cancel: { marginTop: 12, alignItems: "center", paddingVertical: 14 },
  cancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: "700", fontFamily: fonts.bodyBold },
});
