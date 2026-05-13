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
import { useAuth } from "../src/auth";
import { api } from "../src/api";
import { colors } from "../src/theme";

const GENDERS = ["female", "male", "non-binary"];
const INTEREST_OPTIONS = [
  "House", "Techno", "Hip Hop", "Jazz", "Travel",
  "Coffee", "Wine", "Cocktails", "Surf", "Yoga",
  "Photography", "Fashion", "Vinyl", "Art", "Beach",
];

export default function ProfileSetup() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [gender, setGender] = useState(user?.gender || "");
  const [interestedIn, setInterestedIn] = useState(user?.interested_in || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [photos, setPhotos] = useState<string[]>(user?.photos || []);
  const [saving, setSaving] = useState(false);

  const toggleInterest = (i: string) => {
    setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  };

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

          <Text style={styles.label}>VIBE TAGS</Text>
          <View style={styles.chips}>
            {INTEREST_OPTIONS.map((i) => (
              <TouchableOpacity
                key={i}
                style={[styles.chip, interests.includes(i) && styles.chipActive]}
                onPress={() => toggleInterest(i)}
              >
                <Text style={[styles.chipText, interests.includes(i) && styles.chipTextActive]}>
                  {i}
                </Text>
              </TouchableOpacity>
            ))}
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
