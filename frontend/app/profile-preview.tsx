import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

const HOROSCOPE_EMOJI: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋",
  Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏",
  Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const { width } = Dimensions.get("window");

export default function ProfilePreview() {
  const router = useRouter();
  const { user } = useAuth();
  const [activePhoto, setActivePhoto] = useState(0);

  if (!user) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: colors.textSecondary }}>Not signed in</Text>
      </View>
    );
  }

  const photos: string[] = user.photos?.length ? user.photos : [];

  return (
    <View style={styles.root}>
      {/* "Preview" banner sticky at top */}
      <View style={styles.banner}>
        <Ionicons name="eye" size={16} color={colors.inverse} />
        <Text style={styles.bannerText}>This is how others see you</Text>
        <TouchableOpacity testID="preview-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color={colors.inverse} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Photo gallery — horizontal pager */}
        <View style={styles.heroWrap}>
          {photos.length ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                  setActivePhoto(idx);
                }}
                style={{ width, height: width * 1.15 }}
              >
                {photos.map((p, i) => (
                  <Image key={i} source={{ uri: p }} style={styles.heroImg} />
                ))}
              </ScrollView>
              {photos.length > 1 && (
                <View style={styles.dots}>
                  {photos.map((_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, i === activePhoto && styles.dotActive]}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={[styles.heroImg, styles.heroFallback]}>
              <Ionicons name="person" size={80} color={colors.textTertiary} />
              <Text style={styles.heroFallbackText}>No photos yet</Text>
            </View>
          )}

          {/* Gradient overlay & name pinned to bottom */}
          <View style={styles.gradient} pointerEvents="none" />
          <View style={styles.nameBlock}>
            <Text style={styles.name}>
              {user.first_name || "—"}
              {!user.hide_age && user.age ? `, ${user.age}` : ""}
            </Text>
            <View style={styles.tagRow}>
              {user.horoscope ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>
                    {HOROSCOPE_EMOJI[user.horoscope] || ""} {user.horoscope}
                  </Text>
                </View>
              ) : null}
              {(user.email_verified || user.phone_verified) && (
                <View style={styles.verified}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.inverse} />
                  <Text style={styles.verifiedText}>VERIFIED</Text>
                </View>
              )}
              {user.username && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>@{user.username}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {user.bio ? (
            <Text style={styles.bio}>{user.bio}</Text>
          ) : (
            <Text style={styles.bioEmpty}>No bio yet — add one to stand out.</Text>
          )}

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

          <Text style={styles.label}>DETAILS</Text>
          <View style={styles.detailsBox}>
            {user.gender && (
              <DetailRow icon="person-outline" label="Gender" value={user.gender} />
            )}
            {user.interested_in && (
              <DetailRow icon="heart-outline" label="Looking for" value={user.interested_in} />
            )}
            {user.horoscope && (
              <DetailRow
                icon="star-outline"
                label="Horoscope"
                value={`${HOROSCOPE_EMOJI[user.horoscope]} ${user.horoscope}`}
              />
            )}
            {user.hide_age ? (
              <DetailRow icon="eye-off-outline" label="Age" value="Hidden" />
            ) : user.age ? (
              <DetailRow icon="calendar-outline" label="Age" value={String(user.age)} />
            ) : null}
          </View>

          {/* Simulated action row — disabled, just visual */}
          <Text style={styles.label}>WHAT THEY SEE</Text>
          <View style={styles.actionPreview}>
            <View style={[styles.actionBtn, styles.passBtn]}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </View>
            <View style={[styles.actionBtn, styles.hiBtn]}>
              <Ionicons name="hand-left" size={24} color={colors.inverse} />
            </View>
            <View style={[styles.actionBtn, styles.likeBtn]}>
              <Ionicons name="heart" size={28} color={colors.inverse} />
            </View>
          </View>
          <Text style={styles.actionHint}>
            Pass · Say Hi · Like — disabled in preview
          </Text>

          <TouchableOpacity
            testID="edit-profile-cta"
            style={styles.editCta}
            onPress={() => router.push("/profile-setup")}
          >
            <Ionicons name="create-outline" size={18} color={colors.inverse} />
            <Text style={styles.editCtaText}>Edit profile</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={colors.textTertiary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.volt,
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  bannerText: {
    color: colors.inverse,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
    flex: 1,
  },
  closeBtn: { padding: 4 },
  heroWrap: { width, height: width * 1.15, position: "relative" },
  heroImg: { width, height: width * 1.15, backgroundColor: colors.elevated },
  heroFallback: { alignItems: "center", justifyContent: "center", gap: 12 },
  heroFallbackText: { color: colors.textSecondary, fontSize: 14, marginTop: 8 },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: "transparent",
  },
  dots: {
    position: "absolute",
    top: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dotActive: { backgroundColor: colors.volt },
  nameBlock: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.5,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowRadius: 8,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 999,
  },
  tagText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  verified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.volt,
    borderRadius: 999,
  },
  verifiedText: {
    color: colors.inverse,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  body: { padding: 20 },
  bio: {
    color: colors.textPrimary,
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 16,
  },
  bioEmpty: {
    color: colors.textTertiary,
    fontSize: 14,
    fontStyle: "italic",
    marginBottom: 16,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 16,
    marginBottom: 10,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.elevated,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  detailsBox: {
    backgroundColor: colors.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.glassBorder,
  },
  detailLabel: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  detailValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  actionPreview: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    opacity: 0.6,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  passBtn: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  hiBtn: { backgroundColor: colors.fuchsia },
  likeBtn: { backgroundColor: colors.volt },
  actionHint: {
    color: colors.textTertiary,
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
    fontStyle: "italic",
  },
  editCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.volt,
    paddingVertical: 16,
    borderRadius: 999,
    marginTop: 24,
  },
  editCtaText: { color: colors.inverse, fontSize: 16, fontWeight: "800" },
});
