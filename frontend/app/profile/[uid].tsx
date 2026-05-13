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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors } from "../../src/theme";

export default function UserProfile() {
  const { uid, venue } = useLocalSearchParams<{ uid: string; venue?: string }>();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const feed = await api.feed(String(venue || ""));
        const u = feed.find((f: any) => f.user.id === uid);
        setUser(u?.user || null);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, venue]);

  const act = async (action: "like" | "hi" | "pass") => {
    setActing(true);
    try {
      const res = await api.like({ target_user_id: String(uid), action });
      if (action !== "pass") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (res.matched) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace({
          pathname: "/match",
          params: {
            matchId: res.match_id,
            theirName: user?.first_name,
            theirPhoto: user?.photos?.[0] || "",
          },
        });
      } else {
        router.back();
      }
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Failed");
    } finally {
      setActing(false);
    }
  };

  const block = () => {
    Alert.alert("Block this user?", "They won't see you, you won't see them.", [
      { text: "Cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          await api.block(String(uid));
          router.back();
        },
      },
    ]);
  };

  const report = () => {
    Alert.alert("Report this user?", "We'll review within 24h.", [
      { text: "Cancel" },
      {
        text: "Report",
        style: "destructive",
        onPress: async () => {
          await api.report(String(uid), "Inappropriate behavior");
          Alert.alert("Thank you", "Report submitted.");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.volt} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>User left the venue.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.volt }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView>
        <View style={styles.imageWrap}>
          <Image source={{ uri: user.photos?.[0] }} style={styles.image} />
          <LinearGradient
            colors={["rgba(0,0,0,0.4)", "transparent", "rgba(3,3,5,0.95)"]}
            style={StyleSheet.absoluteFillObject}
          />
          <SafeAreaView style={styles.imgOverlay}>
            <TouchableOpacity testID="profile-back" style={styles.iconBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity testID="profile-more" style={styles.iconBtn} onPress={report}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </SafeAreaView>
          <View style={styles.liveTag}>
            <View style={styles.dot} />
            <Text style={styles.liveText}>LIVE AT THIS VENUE</Text>
          </View>
          <View style={styles.nameBlock}>
            <Text style={styles.name}>
              {user.first_name}, {user.age}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

          {user.interests?.length > 0 && (
            <>
              <Text style={styles.label}>VIBE</Text>
              <View style={styles.chips}>
                {user.interests.map((i: string) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{i}</Text>
                  </View>
                ))}
              </View>
            </>
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
              <Ionicons name="ban" size={16} color={colors.textSecondary} />
              <Text style={styles.safetyText}>Block</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="report-btn" onPress={report} style={styles.safetyBtn}>
              <Ionicons name="flag" size={16} color={colors.textSecondary} />
              <Text style={styles.safetyText}>Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <SafeAreaView style={styles.actionBar} edges={["bottom"]}>
        <TouchableOpacity
          testID="pass-btn"
          style={[styles.actionBtn, { borderColor: colors.glassBorder }]}
          onPress={() => act("pass")}
          disabled={acting}
        >
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          testID="hi-btn"
          style={[styles.actionBtn, { borderColor: colors.fuchsia, backgroundColor: colors.fuchsia }]}
          onPress={() => act("hi")}
          disabled={acting}
        >
          <Text style={styles.hiText}>HI</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="like-btn"
          style={[styles.actionBtn, { borderColor: colors.volt, backgroundColor: colors.volt }]}
          onPress={() => act("like")}
          disabled={acting}
        >
          <Ionicons name="flash" size={28} color={colors.inverse} />
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.void },
  imageWrap: { width: "100%", aspectRatio: 0.85, position: "relative" },
  image: { width: "100%", height: "100%", backgroundColor: colors.elevated },
  imgOverlay: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", padding: 16 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  liveTag: {
    position: "absolute",
    top: 80,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.volt,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.volt },
  liveText: { color: colors.volt, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  nameBlock: { position: "absolute", left: 20, bottom: 20 },
  name: { color: colors.textPrimary, fontSize: 38, fontWeight: "900", letterSpacing: -1.5 },
  body: { padding: 24, paddingBottom: 120 },
  bio: { color: colors.textPrimary, fontSize: 16, lineHeight: 22 },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 24,
    marginBottom: 12,
    fontWeight: "700",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipText: { color: colors.textPrimary, fontSize: 13 },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  galleryImg: { width: "47%", aspectRatio: 0.75, borderRadius: 16, backgroundColor: colors.elevated },
  safety: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  safetyBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  safetyText: { color: colors.textSecondary, fontSize: 13 },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: "rgba(3,3,5,0.92)",
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  hiText: { color: colors.textPrimary, fontWeight: "900", fontSize: 18, letterSpacing: 1 },
});
