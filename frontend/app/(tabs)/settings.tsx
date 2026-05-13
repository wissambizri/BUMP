import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { api } from "../../src/api";
import { colors } from "../../src/theme";

export default function Settings() {
  const router = useRouter();
  const { user, signOut, refresh } = useAuth();
  const [hidden, setHidden] = useState(!!user?.is_hidden);

  const toggleHide = async (v: boolean) => {
    setHidden(v);
    await api.hide(v);
    await refresh();
  };

  const leaveNow = async () => {
    try {
      await api.leave();
      Alert.alert("Left venue", "You're no longer visible at any venue.");
    } catch {}
  };

  const doDelete = () => {
    Alert.alert("Delete account?", "This cannot be undone.", [
      { text: "Cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.deleteAccount();
          await signOut();
          router.replace("/onboarding");
        },
      },
    ]);
  };

  const out = async () => {
    await signOut();
    router.replace("/onboarding");
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
        <View style={styles.profileHeader}>
          <Image
            source={{ uri: user?.photos?.[0] || "https://placehold.co/200" }}
            style={styles.avatar}
          />
          <Text style={styles.name}>{user?.first_name}, {user?.age}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.is_admin && <Text style={styles.adminBadge}>ADMIN</Text>}
        </View>

        <TouchableOpacity
          testID="edit-profile"
          style={styles.row}
          onPress={() => router.push("/profile-setup")}
        >
          <Ionicons name="create-outline" size={20} color={colors.volt} />
          <Text style={styles.rowText}>Edit profile</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>

        <View style={styles.row}>
          <Ionicons name="eye-off-outline" size={20} color={colors.volt} />
          <Text style={[styles.rowText, { flex: 1 }]}>Hide my profile</Text>
          <Switch
            testID="hide-toggle"
            value={hidden}
            onValueChange={toggleHide}
            trackColor={{ true: colors.volt, false: "#333" }}
            thumbColor={hidden ? colors.inverse : "#888"}
          />
        </View>

        <TouchableOpacity testID="leave-venue" style={styles.row} onPress={leaveNow}>
          <Ionicons name="exit-outline" size={20} color={colors.fuchsia} />
          <Text style={[styles.rowText, { color: colors.fuchsia }]}>Leave venue now</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="blocked-users" style={styles.row} onPress={() => router.push("/blocked")}>
          <Ionicons name="ban-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.rowText, { flex: 1 }]}>Blocked users</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity testID="preview-profile" style={styles.row} onPress={() => router.push("/profile-preview")}>
          <Ionicons name="eye-outline" size={20} color={colors.volt} />
          <Text style={[styles.rowText, { flex: 1, color: colors.volt }]}>Preview my profile</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity testID="edit-profile" style={styles.row} onPress={() => router.push("/profile-setup")}>
          <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.rowText, { flex: 1 }]}>Edit profile</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>

        {user?.is_admin && (
          <TouchableOpacity
            testID="admin-panel"
            style={[styles.row, { borderColor: "rgba(225,255,0,0.3)" }]}
            onPress={() => router.push("/admin")}
          >
            <Ionicons name="shield-checkmark" size={20} color={colors.volt} />
            <Text style={[styles.rowText, { color: colors.volt }]}>Admin dashboard</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.volt} />
          </TouchableOpacity>
        )}

        <Text style={styles.section}>ACCOUNT</Text>

        <TouchableOpacity testID="sign-out" style={styles.row} onPress={out}>
          <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.rowText}>Sign out</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="delete-account" style={styles.row} onPress={doDelete}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
          <Text style={[styles.rowText, { color: colors.danger }]}>Delete account</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>BUMP · Break the ice nearby.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  profileHeader: { alignItems: "center", marginBottom: 24 },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.volt,
    backgroundColor: colors.elevated,
  },
  name: { color: colors.textPrimary, fontSize: 26, fontWeight: "900", marginTop: 12 },
  email: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  adminBadge: {
    color: colors.inverse,
    backgroundColor: colors.volt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 10,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: 10,
    gap: 14,
  },
  rowText: { color: colors.textPrimary, fontSize: 15, flex: 1 },
  section: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 24,
    marginBottom: 12,
  },
  footer: {
    color: colors.textTertiary,
    fontSize: 11,
    letterSpacing: 2,
    textAlign: "center",
    marginTop: 32,
  },
});
