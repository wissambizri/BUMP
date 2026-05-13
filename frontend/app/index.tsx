import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/onboarding");
    else if (!user.gender || !user.photos || user.photos.length === 0)
      router.replace("/profile-setup");
    else router.replace("/(tabs)/home");
  }, [user, loading, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <Text style={styles.logo}>BUMP</Text>
      <Text style={styles.tag}>Break the ice nearby.</Text>
      <ActivityIndicator color={colors.volt} style={{ marginTop: 32 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.void,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: 64,
    fontWeight: "900",
    color: colors.volt,
    letterSpacing: -3,
  },
  tag: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
