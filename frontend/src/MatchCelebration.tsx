import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Image, Modal, TouchableOpacity, Animated, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts } from "./theme";
import { GradientButton } from "./ui";

export function MatchCelebration({
  visible,
  myPhoto,
  theirPhoto,
  theirName,
  onSayHi,
  onKeepBrowsing,
}: {
  visible: boolean;
  myPhoto?: string;
  theirPhoto?: string;
  theirName?: string;
  onSayHi: () => void;
  onKeepBrowsing: () => void;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      scale.setValue(0);
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
    }
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <LinearGradient
          colors={["#7B2EFF44", "transparent"] as any}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.title}>It's a{"\n"}BUMP! 💥</Text>
          <Text style={styles.sub}>You and {theirName || "someone"} bumped each other.</Text>
          <View style={styles.photos}>
            <Image source={{ uri: myPhoto || "https://placehold.co/200" }} style={[styles.photo, { borderColor: colors.primary }]} />
            <Image source={{ uri: theirPhoto || "https://placehold.co/200" }} style={[styles.photo, { borderColor: colors.pink, marginLeft: -28 }]} />
          </View>
          <View style={{ width: "100%", gap: 10, marginTop: 24 }}>
            <GradientButton label="Say hi 👋" onPress={onSayHi} variant="brand" testID="match-sayhi" />
            <TouchableOpacity onPress={onKeepBrowsing} style={styles.keep} testID="match-keep">
              <Text style={styles.keepText}>Keep browsing</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, backgroundColor: colors.elevated, borderRadius: 28, padding: 28, alignItems: "center", borderWidth: 1, borderColor: colors.glassBorder },
  title: { color: "#fff", fontFamily: fonts.heading, fontWeight: "900", fontSize: 44, letterSpacing: -2, textAlign: "center", lineHeight: 46 },
  sub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 14, marginTop: 12, textAlign: "center" },
  photos: { flexDirection: "row", marginTop: 24 },
  photo: { width: 110, height: 110, borderRadius: 55, borderWidth: 3 },
  keep: { alignItems: "center", paddingVertical: 14 },
  keepText: { color: colors.textSecondary, fontFamily: fonts.bodyBold, fontWeight: "700", fontSize: 14 },
});
