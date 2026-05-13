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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors } from "../../src/theme";

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

  useEffect(() => {
    if (perm && !perm.granted) requestPerm();
  }, [perm]);

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
      console.error(e);
      Alert.alert("Camera error", "Try again");
    } finally {
      setTaking(false);
    }
  };

  const flip = () => {
    setFacing((f) => (f === "front" ? "back" : "front"));
  };

  const submit = async () => {
    if (!preview || !capturedAt) return;
    // Enforce 60s freshness: photo must have been taken in the last minute
    const ageSec = (Date.now() - capturedAt) / 1000;
    if (ageSec > 60) {
      Alert.alert(
        "Snap again",
        "Photo expired (must be < 60s old). Retake to check in."
      );
      setPreview(null);
      setCapturedAt(null);
      return;
    }
    setSubmitting(true);
    let lat = 0,
      lng = 0;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location required",
          "BUMP needs your location to confirm you're at the venue."
        );
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
        lat,
        lng,
        selfie_base64: preview,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/feed/${id}`);
    } catch (e: any) {
      Alert.alert(
        "Check-in failed",
        e?.response?.data?.detail || "You may be too far from the venue."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            testID="checkin-close"
            style={styles.iconBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          {!preview && perm?.granted && (
            <TouchableOpacity
              testID="camera-flip"
              style={styles.iconBtn}
              onPress={flip}
            >
              <Ionicons name="camera-reverse" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.h1}>Prove{"\n"}you're here.</Text>
        <Text style={styles.sub}>
          Live photo — selfie, mirror pic, or full body. No gallery uploads. GPS verified.
        </Text>

        <View style={styles.cameraWrap}>
          {preview ? (
            <Image source={{ uri: preview }} style={styles.camera} />
          ) : perm?.granted ? (
            <CameraView
              ref={camRef}
              facing={facing}
              style={styles.camera}
              animateShutter
            />
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
          <View style={styles.scanline} />
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
                style={[styles.shutter, !perm?.granted && { opacity: 0.4 }]}
                onPress={take}
                disabled={taking || !perm?.granted}
              >
                {taking ? (
                  <ActivityIndicator color={colors.inverse} />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </TouchableOpacity>
              <Text style={styles.hint}>
                Tap to capture {facing === "front" ? "selfie" : "back camera"}
              </Text>
            </>
          ) : (
            <View style={{ width: "100%", gap: 8 }}>
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
                  style={[styles.confirm, submitting && { opacity: 0.6 }]}
                  onPress={submit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.inverse} />
                  ) : (
                    <Text style={styles.confirmText}>Check in</Text>
                  )}
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  h1: {
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.5,
    lineHeight: 42,
    marginTop: 8,
  },
  sub: { color: colors.textSecondary, marginTop: 8, lineHeight: 18 },
  cameraWrap: {
    aspectRatio: 1,
    marginTop: 24,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.volt,
    position: "relative",
  },
  camera: { flex: 1, backgroundColor: colors.elevated },
  cameraFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  permText: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  permBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.volt,
  },
  permBtnText: { color: colors.inverse, fontWeight: "700" },
  scanline: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 2,
    backgroundColor: colors.volt,
    opacity: 0.5,
  },
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
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff3b30",
  },
  liveText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  actions: { alignItems: "center", marginTop: 32, gap: 16 },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.volt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(225,255,0,0.3)",
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.volt,
    borderWidth: 2,
    borderColor: colors.inverse,
  },
  hint: {
    color: colors.textTertiary,
    fontSize: 12,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  retake: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: "center",
  },
  retakeText: { color: colors.textPrimary, fontWeight: "700" },
  confirm: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: colors.volt,
    alignItems: "center",
  },
  confirmText: { color: colors.inverse, fontWeight: "800", fontSize: 16 },
});
