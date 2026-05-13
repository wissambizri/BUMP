import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, wsUrl } from "../../src/api";
import { useAuth } from "../../src/auth";
import { colors } from "../../src/theme";

export default function Chat() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [other, setOther] = useState<any>(null);
  const [kept, setKept] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const listRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    try {
      const [msgs, matches] = await Promise.all([api.messages(String(matchId)), api.matches()]);
      setMessages(msgs);
      const m = matches.find((x: any) => x.match_id === matchId);
      if (m) {
        setOther(m.user);
        setKept(m.kept);
        setExpiresAt(m.expires_at);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    // WebSocket
    try {
      const ws = new WebSocket(wsUrl(String(matchId)));
      wsRef.current = ws;
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "message" && data.message) {
            if (data.message.from_user !== user?.id) {
              setMessages((prev) => {
                if (prev.find((m) => m.id === data.message.id)) return prev;
                return [...prev, data.message];
              });
            }
          } else if (data.type === "typing") {
            if (data.from !== user?.id) {
              setTyping(true);
              setTimeout(() => setTyping(false), 2500);
            }
          }
        } catch {}
      };
      return () => ws.close();
    } catch (e) {
      console.error(e);
    }
  }, [matchId, user?.id]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      const msg = await api.send(String(matchId), t);
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      Alert.alert("Send failed");
    }
  };

  const keep = async () => {
    await api.keep(String(matchId));
    setKept(true);
    Alert.alert("Connection kept", "You can keep chatting beyond 24h.");
  };

  const sendTyping = () => {
    try {
      wsRef.current?.send(JSON.stringify({ type: "typing", from: user?.id }));
    } catch {}
  };

  const timeLeft = () => {
    if (!expiresAt) return "";
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "expired";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.volt} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity testID="chat-back" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        {other?.photos?.[0] && (
          <Image source={{ uri: other.photos[0] }} style={styles.headerAvatar} />
        )}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerName}>{other?.first_name}, {other?.age}</Text>
          {typing ? (
            <Text style={styles.typing}>typing...</Text>
          ) : kept ? (
            <Text style={styles.kept}>KEPT · unlimited</Text>
          ) : (
            <Text style={styles.timer}>{timeLeft()} left</Text>
          )}
        </View>
        {!kept && (
          <TouchableOpacity testID="keep-btn" style={styles.keepBtn} onPress={keep}>
            <Text style={styles.keepText}>KEEP</Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ color: colors.textSecondary }}>Say hi to break the ice 👋</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.from_user === user?.id;
            return (
              <View
                testID={`msg-${item.id}`}
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : styles.bubbleTheirs,
                ]}
              >
                <Text style={[styles.msgText, mine && { color: colors.inverse }]}>
                  {item.text}
                </Text>
                {mine && item.read && (
                  <Text style={styles.read}>READ</Text>
                )}
              </View>
            );
          }}
        />

        <View style={styles.inputRow}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={(t) => {
              setText(t);
              sendTyping();
            }}
            placeholder="Message..."
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            testID="chat-send"
            style={[styles.sendBtn, !text.trim() && { opacity: 0.4 }]}
            onPress={send}
            disabled={!text.trim()}
          >
            <Ionicons name="arrow-up" size={20} color={colors.inverse} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.void },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    gap: 8,
  },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.elevated },
  headerName: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  typing: { color: colors.volt, fontSize: 11 },
  kept: { color: colors.volt, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  timer: { color: colors.fuchsia, fontSize: 11, fontWeight: "700" },
  keepBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.volt,
    borderRadius: 999,
  },
  keepText: { color: colors.inverse, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  bubble: {
    maxWidth: "78%",
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  bubbleMine: { backgroundColor: colors.volt, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: colors.elevated,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  msgText: { color: colors.textPrimary, fontSize: 15 },
  read: {
    color: "rgba(0,0,0,0.5)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
    textAlign: "right",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    backgroundColor: colors.base,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    padding: 12,
    paddingTop: 12,
    backgroundColor: colors.elevated,
    color: colors.textPrimary,
    borderRadius: 22,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.volt,
    alignItems: "center",
    justifyContent: "center",
  },
});
