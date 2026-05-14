import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { resolveImage } from "../../src/img";
import { colors, fonts } from "../../src/theme";

type Mode = "intro" | "camera";

export default function Checkin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [perm, requestPerm] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("front");
  const [taking, setTaking] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capturedAt, setCapturedAt] = useState<number | null>(null);
  const [venue, setVenue] = useState<any>(null);
  const [mode, setMode] = useState<Mode>("intro");

  useEffect(() => {
    if (perm && !perm.granted) requestPerm();
  }, [perm]);

  useEffect(() => {
    (async () => {
      try {
        const v = await api.venue(String(id));
        setVenue(v);
      } catch {}
    })();
  }, [id]);

  const startCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode("camera");
  };

  const take = async () => {
    if (!camRef.current) return;
    setTaking(true);
    try {
      const photo = await camRef.current.takePictureAsync({
        quality: 0.6,
        base64: true,
        skipProcessing: true,
      });
      const uri = photo?.base64
        ? `data:image/jpeg;base64,${photo.base64}`
        : photo?.uri || null;
      if (!uri) {
        Alert.alert("Couldn't capture", "Try again");
        return;
      }
      setPreview(uri);
      setCapturedAt(Date.now());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {
      Alert.alert("Camera error", "Try again");
    } finally {
      setTaking(false);
    }
  };

  const flip = () => setFacing((f) => (f === "front" ? "back" : "front"));

  const submit = async () => {
    if (!preview || !capturedAt) return;
    const ageSec = (Date.now() - capturedAt) / 1000;
    if (ageSec > 60) {
      Alert.alert("Snap again", "Photo expired (must be < 60s old). Retake to check in.");
      setPreview(null);
      setCapturedAt(null);
      return;
    }
    setSubmitting(true);
    let lat = 0, lng = 0;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location required", "BUMP needs your location to confirm you're at the venue.");
        setSubmitting(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      lat = loc.coords.latitude;
      lng = loc.coords.longitude;
    } catch {
      Alert.alert("Location error", "Could not get your GPS. Try again outside.");
      setSubmitting(false);
      return;
    }
    try {
      await api.checkin({
        venue_id: String(id),
        lat, lng,
        selfie_base64: preview,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/feed/${id}`);
    } catch (e: any) {
      Alert.alert("Check-in failed", e?.response?.data?.detail || "You may be too far from the venue.");
    } finally {
      setSubmitting(false);
    }
  };

  // INTRO mode — matches mockup #7
  if (mode === "intro") {
    return (
      <View style={styles.root}>
        <ImageBackground
          source={{ uri: resolveImage(venue?.image) || "https://images.unsplash.com/photo-1571266028243-d220c6a9d6e9?w=1200&q=80" }}
          style={styles.heroBg}
          imageStyle={{ opacity: 0.55 }}
          resizeMode="cover"
        >
          <LinearGradient
            colors={["transparent", "rgba(13,13,20,0.7)", "#0D0D14"] as any}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <SafeAreaView style={{ flex: 1, justifyContent: "space-between" }} edges={["top", "bottom"]}>
            <View style={styles.topBar}>
              <TouchableOpacity testID="checkin-close" onPress={() => router.back()} style={styles.iconBtn}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.introCard}>
              <Text style={styles.kicker}>YOU'RE AT</Text>
              <Text style={styles.atTitle} numberOfLines={2}>
                {venue?.name || "this venue"}?
              </Text>
              <Text style={styles.atSub}>
                Check in to unlock everyone here for the next 4h.
              </Text>

              <View style={styles.featuresRow}>
                <View style={styles.featureCol}>
                  <LinearGradient
                    colors={["rgba(123,46,255,0.25)", "rgba(123,46,255,0.05)"] as any}
                    style={styles.featureIconWrap}
                  >
                    <Ionicons name="people" size={22} color={colors.primary} />
                  </LinearGradient>
                  <Text style={styles.featureText}>Live people</Text>
                </View>
                <View style={styles.featureCol}>
                  <LinearGradient
                    colors={["rgba(255,79,163,0.25)", "rgba(255,79,163,0.05)"] as any}
                    style={styles.featureIconWrap}
                  >
                    <Ionicons name="chatbubbles" size={22} color={colors.pink} />
                  </LinearGradient>
                  <Text style={styles.featureText}>Chat instantly</Text>
                </View>
                <View style={styles.featureCol}>
                  <LinearGradient
                    colors={["rgba(255,200,87,0.25)", "rgba(255,200,87,0.05)"] as any}
                    style={styles.featureIconWrap}
                  >
                    <MaterialCommunityIcons name="star-four-points" size={22} color="#FFC857" />
                  </LinearGradient>
                  <Text style={styles.featureText}>Get bumped</Text>
                </View>
              </View>

              <TouchableOpacity testID="start-checkin" onPress={startCamera} activeOpacity={0.9}>
                <LinearGradient
                  colors={["#7B2EFF", "#FF4FA3"] as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryBtn}
                >
                  <MaterialCommunityIcons name="star-four-points" size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>Check in now</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity testID="not-here" onPress={() => router.back()} style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>Not here</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </ImageBackground>
      </View>
    );
  }

  // CAMERA mode — selfie capture
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="cam-back" style={styles.iconBtn} onPress={() => setMode("intro")}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          {!preview && perm?.granted && (
            <TouchableOpacity testID="camera-flip" style={styles.iconBtn} onPress={flip}>
              <Ionicons name="camera-reverse" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.kicker}>VERIFY</Text>
        <Text style={styles.h1}>Take a live{"\n"}selfie.</Text>
        <Text style={styles.sub}>
          One-time photo to prove you're really here. No gallery uploads.
        </Text>

        <View style={styles.cameraOuter}>
          <LinearGradient
            colors={["#7B2EFF", "#FF4FA3", "#FFC857"] as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cameraRing}
          >
            <View style={styles.cameraInner}>
              {preview ? (
                <Image source={{ uri: preview }} style={styles.camera} />
              ) : perm?.granted ? (
                <CameraView ref={camRef} facing={facing} style={styles.camera} animateShutter />
              ) : (
                <View style={[styles.camera, styles.cameraFallback]}>
                  <Ionicons name="camera-outline" size={56} color={colors.textTertiary} />
                  <Text style={styles.permText}>
                    {Platform.OS === "web"
                      ? "Camera works on iOS & Android. Use Expo Go to test."
                      : "Camera permission needed"}
                  </Text>
                  {Platform.OS !== "web" && (
                    <TouchableOpacity onPress={requestPerm} style={styles.permBtn}>
                      <Text style={styles.permBtnText}>Grant access</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </LinearGradient>

          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {!preview ? (
            <>
              <TouchableOpacity
                testID="capture-button"
                onPress={take}
                disabled={taking || !perm?.granted}
                activeOpacity={0.85}
                style={[!perm?.granted && { opacity: 0.4 }]}
              >
                <LinearGradient
                  colors={["#7B2EFF", "#FF4FA3"] as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.shutter}
                >
                  {taking ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <View style={styles.shutterInner} />
                  )}
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.hint}>
                Tap to capture {facing === "front" ? "selfie" : "back camera"}
              </Text>
            </>
          ) : (
            <View style={{ width: "100%", gap: 10 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  testID="retake-button"
                  style={styles.retake}
                  onPress={() => {
                    setPreview(null);
                    setCapturedAt(null);
                  }}
                >
                  <Text style={styles.retakeText}>Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="confirm-checkin"
                  onPress={submit}
                  disabled={submitting}
                  activeOpacity={0.85}
                  style={[{ flex: 1 }, submitting && { opacity: 0.6 }]}
                >
                  <LinearGradient
                    colors={["#7B2EFF", "#FF4FA3"] as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.confirm}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.confirmText}>Use photo</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Captures expire in 60s. We&apos;ll verify your GPS is at the venue.
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  safe: { flex: 1, padding: 24 },
  heroBg: { flex: 1, justifyContent: "flex-end" },
  topBar: { flexDirection: "row", paddingHorizontal: 20, paddingTop: 8 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  introCard: {
    margin: 20,
    padding: 24,
    borderRadius: 28,
    backgroundColor: "rgba(21,21,31,0.85)",
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  kicker: {
    color: colors.pink,
    fontSize: 11,
    letterSpacing: 2.5,
    fontFamily: fonts.heading,
    fontWeight: "800",
  },
  atTitle: {
    color: "#fff",
    fontSize: 32,
    fontFamily: fonts.heading,
    fontWeight: "900",
    letterSpacing: -1.2,
    lineHeight: 36,
    marginTop: 8,
  },
  atSub: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  featuresRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 8,
    gap: 12,
  },
  featureCol: { flex: 1, alignItems: "center", gap: 8 },
  featureIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  featureText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: fonts.bodyBold,
    fontWeight: "600",
    textAlign: "center",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 999,
    marginTop: 28,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: fonts.heading,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  secondaryBtn: { alignItems: "center", paddingVertical: 14, marginTop: 6 },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.bodyBold,
    fontWeight: "600",
  },
  // Camera mode
  h1: {
    color: "#fff",
    fontSize: 36,
    fontFamily: fonts.heading,
    fontWeight: "900",
    letterSpacing: -1.5,
    lineHeight: 40,
    marginTop: 8,
  },
  sub: { color: colors.textSecondary, marginTop: 8, lineHeight: 20, fontFamily: fonts.body },
  cameraOuter: { marginTop: 24, position: "relative" },
  cameraRing: {
    aspectRatio: 1,
    borderRadius: 999,
    padding: 3,
  },
  cameraInner: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: colors.elevated,
  },
  camera: { flex: 1, backgroundColor: colors.elevated },
  cameraFallback: { alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  permText: { color: colors.textSecondary, fontSize: 13, textAlign: "center", fontFamily: fonts.body },
  permBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.pink,
  },
  permBtnText: { color: "#fff", fontWeight: "700", fontFamily: fonts.bodyBold },
  liveBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.pink,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pink },
  liveText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1, fontFamily: fonts.heading },
  actions: { alignItems: "center", marginTop: 32, gap: 16 },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
  },
  hint: {
    color: colors.textTertiary,
    fontSize: 12,
    letterSpacing: 0.5,
    textAlign: "center",
    fontFamily: fonts.body,
  },
  retake: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: "center",
  },
  retakeText: { color: "#fff", fontWeight: "700", fontFamily: fonts.bodyBold },
  confirm: {
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
  },
  confirmText: { color: "#fff", fontWeight: "800", fontSize: 16, fontFamily: fonts.heading, letterSpacing: 0.3 },
});
