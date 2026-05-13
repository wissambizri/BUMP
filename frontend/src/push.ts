import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { api } from "./api";

// Foreground notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) {
    // Simulator returns null; that's fine
    return null;
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;
  try {
    const projectId =
      (Constants?.expoConfig as any)?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId ||
      undefined;
    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#c5ff00",
      });
    }
    return tokenRes.data;
  } catch (e) {
    console.warn("getExpoPushToken err", e);
    return null;
  }
}

/**
 * Hook that registers for push notifications + handles foreground/tap routing.
 * Call from inside an authenticated layout once `user` is loaded.
 */
export function usePushRegistration(userId: string | undefined) {
  const router = useRouter();
  const respListener = useRef<any>(null);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (!token || !mounted) return;
      try {
        await api.pushRegister(token, Platform.OS);
      } catch (e) {
        console.warn("pushRegister failed", e);
      }
    })();

    // Handle tap on notification → deep link
    respListener.current = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = (resp.notification.request.content.data || {}) as any;
      try {
        if (data.type === "message" && data.match_id) {
          router.push(`/chat/${data.match_id}`);
        } else if (data.type === "match" && data.match_id) {
          router.push(`/chat/${data.match_id}`);
        }
      } catch {}
    });

    return () => {
      mounted = false;
      if (respListener.current) respListener.current.remove();
    };
  }, [userId]);
}
