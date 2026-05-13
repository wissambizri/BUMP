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
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, wsUrl } from "../../src/api";
import { useAuth } from "../../src/auth";
import { colors, fonts } from "../../src/theme";

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
  const [now, setNow] = useState(Date.now());
  const listRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    try {
      const [msgs, matches] = await Promise.all([
        api.messages(String(matchId)),
        api.matches(),
      ]);
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

  // Tick every second for HH:MM:SS countdown
  useEffect(() => {
    if (kept || !expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [kept, expiresAt]);

  useEffect(() => {
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

  const formatCountdown = () => {
    if (!expiresAt) return "";
    const ms = new Date(expiresAt).getTime() - now;
    if (ms <= 0) return "expired";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.pink} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity testID="chat-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        {other?.photos?.[0] && (
          <View style={styles.avatarWrap}>
            <Image source={{ uri: other.photos[0] }} style={styles.headerAvatar} />
            <View style={styles.onlineDot} />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerName}>
            {other?.first_name}
            {!other?.hide_age && other?.age ? `, ${other.age}` : ""}
          </Text>
          {typing ? (
            <Text style={styles.typing}>typing…</Text>
          ) : (
            <Text style={styles.headerSub}>Online · matched here</Text>
          )}
        </View>
      </View>

      {/* Expiry banner */}
      {!kept && expiresAt && (
        <View style={styles.expireBanner}>
          <Ionicons name="time-outline" size={14} color={colors.pink} />
          <Text style={styles.expireText}>
            Chat expires in <Text style={styles.expireBold}>{formatCountdown()}</Text>
          </Text>
          <TouchableOpacity testID="keep-btn" onPress={keep} activeOpacity={0.85}>
            <LinearGradient
              colors={["#7B2EFF", "#FF4FA3"] as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.keepPill}
            >
              <Text style={styles.keepText}>KEEP</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
      {kept && (
        <View style={[styles.expireBanner, { backgroundColor: "rgba(200,255,61,0.08)", borderColor: "rgba(200,255,61,0.3)" }]}>
          <Ionicons name="infinite" size={14} color={colors.lime} />
          <Text style={[styles.expireText, { color: colors.lime }]}>Connection kept · unlimited</Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.body }}>
                Say hi to break the ice 👋
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.from_user === user?.id;
            if (mine) {
              return (
                <View testID={`msg-${item.id}`} style={[styles.bubbleWrap, { alignSelf: "flex-end" }]}>
                  <LinearGradient
                    colors={["#7B2EFF", "#FF4FA3"] as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.bubble, styles.bubbleMine]}
                  >
                    <Text style={[styles.msgText, { color: "#fff" }]}>{item.text}</Text>
                    {item.read && <Text style={styles.read}>READ</Text>}
                  </LinearGradient>
                </View>
              );
            }
            return (
              <View
                testID={`msg-${item.id}`}
                style={[styles.bubble, styles.bubbleTheirs]}
              >
                <Text style={styles.msgText}>{item.text}</Text>
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
            placeholder="Message…"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            testID="chat-send"
            onPress={send}
            disabled={!text.trim()}
            activeOpacity={0.85}
            style={[!text.trim() && { opacity: 0.4 }]}
          >
            <LinearGradient
              colors={["#7B2EFF", "#FF4FA3"] as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendBtn}
            >
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </LinearGradient>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    gap: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  avatarWrap: { marginLeft: 8, position: "relative" },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.elevated,
    borderWidth: 2,
    borderColor: colors.pink,
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.void,
  },
  headerName: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    fontFamily: fonts.heading,
    letterSpacing: -0.3,
  },
  headerSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2, fontFamily: fonts.body },
  typing: { color: colors.lime, fontSize: 12, marginTop: 2, fontFamily: fonts.body, fontStyle: "italic" },
  expireBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,79,163,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,79,163,0.25)",
  },
  expireText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
    fontFamily: fonts.body,
  },
  expireBold: {
    color: colors.pink,
    fontFamily: fonts.bodyBold,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  keepPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  keepText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    fontFamily: fonts.heading,
  },
  bubbleWrap: { maxWidth: "78%" },
  bubble: {
    maxWidth: "78%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  bubbleMine: { alignSelf: "flex-end", borderBottomRightRadius: 6 },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  msgText: { color: "#fff", fontSize: 15, lineHeight: 20, fontFamily: fonts.body },
  read: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
    textAlign: "right",
    fontFamily: fonts.heading,
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
    backgroundColor: colors.surface,
    color: "#fff",
    borderRadius: 22,
    fontSize: 15,
    fontFamily: fonts.body,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
