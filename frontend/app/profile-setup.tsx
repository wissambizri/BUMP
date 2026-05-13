import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/auth";
import { api } from "../src/api";
import { colors } from "../src/theme";

const GENDERS = ["female", "male", "non-binary"];
const HOROSCOPES: { sign: string; emoji: string }[] = [
  { sign: "Aries", emoji: "♈" },
  { sign: "Taurus", emoji: "♉" },
  { sign: "Gemini", emoji: "♊" },
  { sign: "Cancer", emoji: "♋" },
  { sign: "Leo", emoji: "♌" },
  { sign: "Virgo", emoji: "♍" },
  { sign: "Libra", emoji: "♎" },
  { sign: "Scorpio", emoji: "♏" },
  { sign: "Sagittarius", emoji: "♐" },
  { sign: "Capricorn", emoji: "♑" },
  { sign: "Aquarius", emoji: "♒" },
  { sign: "Pisces", emoji: "♓" },
];
const TAG_RE = /^[a-zA-Z0-9 &+]{2,20}$/;
const INTEREST_OPTIONS = [
  "House", "Techno", "Hip Hop", "Jazz", "R&B", "Reggaeton", "Latin", "Afrobeats",
  "EDM", "Indie", "Rock", "Soul",
  "Travel", "Coffee", "Wine", "Cocktails", "Whiskey", "Tequila",
  "Surf", "Yoga", "Gym", "Running", "Hiking", "Boxing",
  "Photography", "Fashion", "Vinyl", "Art", "Beach", "Foodie",
  "Sushi", "Pizza", "Brunch", "Karaoke", "Rooftops", "Speakeasies",
];

function toggleInList(list: string[], value: string, max = 8): string[] {
  if (list.includes(value)) return list.filter((x) => x !== value);
  if (list.length >= max) return list;
  return [...list, value];
}

export default function ProfileSetup() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [gender, setGender] = useState(user?.gender || "");
  const [interestedIn, setInterestedIn] = useState(user?.interested_in || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [photos, setPhotos] = useState<string[]>(user?.photos || []);
  const [horoscope, setHoroscope] = useState<string>(user?.horoscope || "");
  const [hideAge, setHideAge] = useState<boolean>(!!user?.hide_age);
  const [tagQuery, setTagQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredTags = (() => {
    const q = tagQuery.trim().toLowerCase();
    const base = INTEREST_OPTIONS;
    if (!q) return base;
    return base.filter((t) => t.toLowerCase().includes(q));
  })();

  const addCustomTag = () => {
    const v = tagQuery.trim();
    if (!v) return;
    if (!TAG_RE.test(v)) {
      return Alert.alert("Invalid", "Tags must be 2–20 letters/numbers (& + allowed)");
    }
    const normalized = v
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    if (interests.includes(normalized)) {
      Alert.alert("Already added", `${normalized} is in your vibe.`);
      setTagQuery("");
      return;
    }
    if (interests.length >= 8) {
      return Alert.alert("Limit reached", "Max 8 vibe tags");
    }
    setInterests([...interests, normalized]);
    setTagQuery("");
  };

  const toggleInterest = (i: string) => setInterests(toggleInList(interests, i, 8));

  const pickPhoto = async () => {
    if (photos.length >= 6) return Alert.alert("Max", "Up to 6 photos");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission", "Photo access denied");
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.5,
      base64: true,
    });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      const dataUri = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      setPhotos([...photos, dataUri]);
    }
  };

  const useDemoPhoto = () => {
    const demo = [
      "https://images.unsplash.com/photo-1546206724-efa0d6c656b1?w=600&q=80",
      "https://images.unsplash.com/photo-1502323777036-f29e3972d82f?w=600&q=80",
      "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=600&q=80",
    ];
    setPhotos([...photos, demo[photos.length % 3]]);
  };

  const save = async () => {
    if (!gender) return Alert.alert("Missing", "Pick gender");
    if (!interestedIn) return Alert.alert("Missing", "Pick interested in");
    if (photos.length < 1) return Alert.alert("Missing", "Add at least 1 photo");
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        gender,
        interested_in: interestedIn,
        bio,
        interests,
        photos,
        horoscope: horoscope || undefined,
        hide_age: hideAge,
      });
      setUser(updated);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
          <Text style={styles.h1}>Build your{"\n"}club identity.</Text>
          <Text style={styles.sub}>Take 30 seconds. You'll thank yourself tonight.</Text>

          <Text style={styles.label}>PHOTOS · {photos.length}/6</Text>
          <View style={styles.photoRow}>
            {photos.map((p, i) => (
              <View key={i} style={styles.photoCell}>
                <Image source={{ uri: p }} style={styles.photoImg} />
                <TouchableOpacity
                  testID={`remove-photo-${i}`}
                  style={styles.photoRemove}
                  onPress={() => setPhotos(photos.filter((_, j) => j !== i))}
                >
                  <Text style={styles.photoRemoveText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < 6 && (
              <TouchableOpacity
                testID="add-photo"
                style={styles.photoAdd}
                onPress={pickPhoto}
                onLongPress={useDemoPhoto}
              >
                <Text style={styles.photoAddText}>+</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity testID="use-demo-photo" onPress={useDemoPhoto}>
            <Text style={styles.demoHint}>Tap here to add a demo photo</Text>
          </TouchableOpacity>

          <Text style={styles.label}>GENDER</Text>
          <View style={styles.chips}>
            {GENDERS.map((g) => (
              <TouchableOpacity
                key={g}
                testID={`gender-${g}`}
                style={[styles.chip, gender === g && styles.chipActive]}
                onPress={() => setGender(g)}
              >
                <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>INTERESTED IN</Text>
          <View style={styles.chips}>
            {["female", "male", "any"].map((g) => (
              <TouchableOpacity
                key={g}
                testID={`interested-${g}`}
                style={[styles.chip, interestedIn === g && styles.chipActive]}
                onPress={() => setInterestedIn(g)}
              >
                <Text style={[styles.chipText, interestedIn === g && styles.chipTextActive]}>
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>BIO</Text>
          <TextInput
            testID="bio-input"
            value={bio}
            onChangeText={setBio}
            placeholder="One line that captures your vibe..."
            placeholderTextColor={colors.textTertiary}
            multiline
            style={styles.bio}
          />

          <Text style={styles.label}>HOROSCOPE</Text>
          <View style={styles.chips}>
            {HOROSCOPES.map((h) => (
              <TouchableOpacity
                key={h.sign}
                testID={`horoscope-${h.sign}`}
                style={[styles.chip, horoscope === h.sign && styles.chipActive]}
                onPress={() => setHoroscope(horoscope === h.sign ? "" : h.sign)}
              >
                <Text style={[styles.chipText, horoscope === h.sign && styles.chipTextActive]}>
                  {h.emoji} {h.sign}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>HIDE MY AGE</Text>
              <Text style={styles.toggleSub}>
                Your age stays private. People see your zodiac instead.
              </Text>
            </View>
            <TouchableOpacity
              testID="hide-age-toggle"
              style={[styles.toggle, hideAge && styles.toggleOn]}
              onPress={() => setHideAge(!hideAge)}
            >
              <View style={[styles.toggleDot, hideAge && styles.toggleDotOn]} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>VIBE TAGS</Text>
          <Text style={styles.toggleSub}>
            Search, tap a chip, or type your own (2–20 chars). Up to 8.
          </Text>
          {interests.length > 0 && (
            <View style={[styles.chips, { marginTop: 12 }]}>
              {interests.map((i) => (
                <TouchableOpacity
                  key={`sel-${i}`}
                  style={[styles.chip, styles.chipActive]}
                  onPress={() => toggleInterest(i)}
                  testID={`selected-tag-${i}`}
                >
                  <Text style={[styles.chipText, styles.chipTextActive]}>
                    {i}
                  </Text>
                  <Ionicons
                    name="close"
                    size={13}
                    color={colors.inverse}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.tagSearchWrap}>
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <TextInput
              testID="tag-search"
              value={tagQuery}
              onChangeText={setTagQuery}
              placeholder="Search or type a custom tag..."
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.tagSearchInput}
              onSubmitEditing={addCustomTag}
              returnKeyType="done"
            />
            {tagQuery.length > 0 && !filteredTags.some((t) => t.toLowerCase() === tagQuery.trim().toLowerCase()) && (
              <TouchableOpacity testID="add-custom-tag" onPress={addCustomTag}>
                <View style={styles.addBtn}>
                  <Ionicons name="add" size={14} color={colors.inverse} />
                  <Text style={styles.addBtnText}>Add</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.chips, { marginTop: 8 }]}>
            {filteredTags.length === 0 ? (
              <Text style={styles.emptyHint}>
                No matches. Tap <Text style={{ color: colors.volt, fontWeight: "800" }}>Add</Text> to create a custom tag.
              </Text>
            ) : (
              filteredTags.slice(0, 30).map((i) => (
                <TouchableOpacity
                  key={i}
                  testID={`tag-${i}`}
                  style={[styles.chip, interests.includes(i) && styles.chipActive]}
                  onPress={() => toggleInterest(i)}
                >
                  <Text style={[styles.chipText, interests.includes(i) && styles.chipTextActive]}>
                    {i}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          <Text style={styles.label}>ACCOUNT</Text>
          <View style={styles.acctBox}>
            <AccountRow
              icon="mail"
              label="Email"
              value={
                user?.email && !String(user.email).endsWith("@phone.bump.app")
                  ? user.email
                  : null
              }
              verified={!!user?.email_verified}
              emptyText="Add email"
            />
            <AccountRow
              icon="call"
              label="Phone"
              value={user?.phone || null}
              verified={!!user?.phone_verified}
              emptyText="Add phone"
            />
            <AccountRow
              icon="at"
              label="Username"
              value={user?.username ? `@${user.username}` : null}
              verified={null}
              emptyText="Pick a username"
            />
          </View>

          <TouchableOpacity
            testID="save-profile"
            style={[styles.cta, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            <Text style={styles.ctaText}>{saving ? "..." : "Done · Enter BUMP"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  h1: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.5,
    lineHeight: 40,
  },
  sub: { color: colors.textSecondary, marginTop: 8, marginBottom: 24 },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 24,
    marginBottom: 12,
  },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  photoCell: { width: 90, height: 120, borderRadius: 16, overflow: "hidden", position: "relative" },
  photoImg: { width: "100%", height: "100%" },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemoveText: { color: "#fff", fontSize: 14, lineHeight: 16 },
  photoAdd: {
    width: 90,
    height: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  photoAddText: { color: colors.volt, fontSize: 36 },
  demoHint: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 8,
    letterSpacing: 1,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  tagSearchInput: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 12,
    fontSize: 14,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.volt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  addBtnText: { color: colors.inverse, fontSize: 12, fontWeight: "800" },
  emptyHint: { color: colors.textSecondary, fontSize: 12, padding: 8 },
  acctBox: {
    backgroundColor: colors.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: "hidden",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
    marginTop: 4,
  },
  toggleSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2, letterSpacing: 0 },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 2,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: colors.volt, borderColor: colors.volt },
  toggleDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.textPrimary,
  },
  toggleDotOn: { backgroundColor: colors.inverse, transform: [{ translateX: 20 }] },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.elevated,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipActive: { backgroundColor: colors.volt, borderColor: colors.volt },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: colors.inverse, fontWeight: "700" },
  bio: {
    backgroundColor: colors.elevated,
    color: colors.textPrimary,
    padding: 16,
    borderRadius: 16,
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    textAlignVertical: "top",
  },
  cta: {
    backgroundColor: colors.volt,
    paddingVertical: 18,
    borderRadius: 999,
    alignItems: "center",
    marginTop: 32,
  },
  ctaText: { color: colors.inverse, fontSize: 17, fontWeight: "800" },
});

function AccountRow(props: {
  icon: any;
  label: string;
  value: string | null;
  verified: boolean | null;
  emptyText: string;
}) {
  return (
    <View style={accountStyles.row}>
      <Ionicons name={props.icon} size={18} color={colors.textTertiary} />
      <View style={{ flex: 1 }}>
        <Text style={accountStyles.label}>{props.label}</Text>
        <Text
          style={[
            accountStyles.value,
            !props.value && { color: colors.textTertiary, fontStyle: "italic" },
          ]}
          numberOfLines={1}
        >
          {props.value || props.emptyText}
        </Text>
      </View>
      {props.verified === true ? (
        <View style={accountStyles.verifiedBadge}>
          <Ionicons name="checkmark-circle" size={13} color={colors.inverse} />
          <Text style={accountStyles.verifiedBadgeText}>VERIFIED</Text>
        </View>
      ) : props.verified === false && props.value ? (
        <View style={accountStyles.unverifiedBadge}>
          <Ionicons name="alert-circle" size={13} color={colors.textPrimary} />
          <Text style={accountStyles.unverifiedBadgeText}>Verify</Text>
        </View>
      ) : null}
    </View>
  );
}

const accountStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderColor: colors.glassBorder,
  },
  label: { color: colors.textTertiary, fontSize: 11, letterSpacing: 1 },
  value: { color: colors.textPrimary, fontSize: 14, fontWeight: "600", marginTop: 2 },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.volt,
    borderRadius: 999,
  },
  verifiedBadgeText: {
    color: colors.inverse,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  unverifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(255,138,138,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,138,138,0.4)",
    borderRadius: 999,
  },
  unverifiedBadgeText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});

