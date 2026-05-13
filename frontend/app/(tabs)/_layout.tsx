import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme";
import { useAuth } from "../../src/auth";
import { usePushRegistration } from "../../src/push";

export default function TabLayout() {
  const { user } = useAuth();
  usePushRegistration(user?.id);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.volt,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.base,
          borderTopColor: colors.glassBorder,
          borderTopWidth: 1,
          height: 88,
          paddingTop: 10,
          paddingBottom: 28,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "VENUES",
          tabBarIcon: ({ color }) => <Ionicons name="flame" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "MATCHES",
          tabBarIcon: ({ color }) => <Ionicons name="flash" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "PROFILE",
          tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
