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
import { CameraView, useCameraPermissions } from "expo-camera";
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
  const [taking, setTaking] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (perm && !perm.granted) requestPerm();
  }, [perm]);

  const take = async () => {
    if (!camRef.current) return;
    setTaking(true);
    try {
      const photo = await camRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
      });
      const uri = photo?.base64 ? `data:image/jpeg;base64,${photo.base64}` : photo?.uri || null;
      setPreview(uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {
      console.error(e);
    } finally {
      setTaking(false);
    }
  };

  const skipDemo = () => {
    setPreview(
      "https://images.unsplash.com/photo-1502323777036-f29e3972d82f?w=600&q=80"
    );
  };

  const submit = async () => {
    if (!preview) return;
    setSubmitting(true);
    let lat = 0,
      lng = 0;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
    } catch {}
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
      Alert.alert("Check-in failed", e?.response?.data?.detail || "Try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity
          testID="checkin-close"
          style={styles.back}
          onPress={() => router.back()}
        >
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.h1}>Prove{"\n"}you're here.</Text>
        <Text style={styles.sub}>Live selfie. No gallery. Expires in 6h.</Text>

        <View style={styles.cameraWrap}>
          {preview ? (
            <Image source={{ uri: preview }} style={styles.camera} />
          ) : perm?.granted ? (
            <CameraView ref={camRef} facing="front" style={styles.camera} />
          ) : (
            <View style={[styles.camera, styles.cameraFallback]}>
              <Ionicons name="camera-outline" size={56} color={colors.textTertiary} />
              <Text style={styles.permText}>
                {Platform.OS === "web"
                  ? "Camera limited on web preview"
                  : "Camera permission needed"}
              </Text>
              <TouchableOpacity onPress={requestPerm} style={styles.permBtn}>
                <Text style={styles.permBtnText}>Grant access</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.scanline} />
        </View>

        <View style={styles.actions}>
          {!preview ? (
            <>
              <TouchableOpacity
                testID="capture-button"
                style={styles.shutter}
                onPress={take}
                disabled={taking || !perm?.granted}
              >
                {taking ? (
                  <ActivityIndicator color={colors.inverse} />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </TouchableOpacity>
              <TouchableOpacity testID="demo-skip" onPress={skipDemo}>
                <Text style={styles.demoSkip}>Use demo selfie (preview only)</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                testID="retake-button"
                style={styles.retake}
                onPress={() => setPreview(null)}
              >
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-checkin"
                style={[styles.confirm, submitting && { opacity: 0.6 }]}
                onPress={submit}
                disabled={submitting}
              >
                <Text style={styles.confirmText}>
                  {submitting ? "..." : "Check in"}
                </Text>
              </TouchableOpacity>
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
  back: { alignSelf: "flex-end" },
  h1: { color: colors.textPrimary, fontSize: 38, fontWeight: "900", letterSpacing: -1.5, lineHeight: 42, marginTop: 8 },
  sub: { color: colors.textSecondary, marginTop: 8 },
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
  cameraFallback: { alignItems: "center", justifyContent: "center", gap: 12 },
  permText: { color: colors.textSecondary, fontSize: 13 },
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
  demoSkip: { color: colors.textTertiary, fontSize: 12, letterSpacing: 1 },
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
