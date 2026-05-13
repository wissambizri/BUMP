import axios, { AxiosInstance } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
const API = `${BASE}/api`;

const TOKEN_KEY = "bump_token";

export const apiBase = API;

const client: AxiosInstance = axios.create({ baseURL: API, timeout: 20000 });

let memToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (memToken) return memToken;
  memToken = await AsyncStorage.getItem(TOKEN_KEY);
  return memToken;
}

export async function setToken(token: string | null) {
  memToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

client.interceptors.request.use(async (config) => {
  const t = await getToken();
  if (t) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${t}`;
  }
  return config;
});

export const api = {
  // auth
  register: (data: any) => client.post("/auth/register", data).then((r) => r.data),
  login: (data: any) => client.post("/auth/login", data).then((r) => r.data),
  me: () => client.get("/auth/me").then((r) => r.data),
  updateProfile: (data: any) => client.put("/profile", data).then((r) => r.data),
  // venues
  venues: (lat: number, lng: number) => client.get("/venues", { params: { lat, lng } }).then((r) => r.data),
  venue: (id: string) => client.get(`/venues/${id}`).then((r) => r.data),
  // checkin
  checkin: (data: any) => client.post("/checkin", data).then((r) => r.data),
  myCheckin: () => client.get("/checkin/active").then((r) => r.data),
  leave: () => client.delete("/checkin").then((r) => r.data),
  feed: (venueId: string) => client.get(`/venues/${venueId}/feed`).then((r) => r.data),
  // like / matches
  like: (data: any) => client.post("/likes", data).then((r) => r.data),
  matches: () => client.get("/matches").then((r) => r.data),
  keep: (matchId: string) => client.post("/matches/keep", { match_id: matchId }).then((r) => r.data),
  // chat
  messages: (matchId: string) => client.get(`/messages/${matchId}`).then((r) => r.data),
  send: (matchId: string, text: string) =>
    client.post("/messages", { match_id: matchId, text }).then((r) => r.data),
  // safety
  block: (id: string) => client.post(`/safety/block/${id}`).then((r) => r.data),
  unblock: (id: string) => client.post(`/safety/unblock/${id}`).then((r) => r.data),
  report: (id: string, reason: string) =>
    client.post("/safety/report", { target_user_id: id, reason }).then((r) => r.data),
  hide: (hidden: boolean) => client.post(`/safety/hide?hidden=${hidden}`).then((r) => r.data),
  deleteAccount: () => client.delete("/account").then((r) => r.data),
  // admin
  adminAnalytics: () => client.get("/admin/analytics").then((r) => r.data),
  adminUsers: () => client.get("/admin/users").then((r) => r.data),
  adminReports: () => client.get("/admin/reports").then((r) => r.data),
  adminResolve: (id: string) => client.post(`/admin/reports/${id}/resolve`).then((r) => r.data),
  adminDeleteUser: (id: string) => client.delete(`/admin/users/${id}`).then((r) => r.data),
};

export function wsUrl(matchId: string): string {
  const u = (BASE || "").replace(/^http/, "ws");
  return `${u}/api/ws/chat/${matchId}`;
}
