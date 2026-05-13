// Resolve a venue image URL. Backend may return:
//   - Full http(s) URL (legacy seed)
//   - Relative path like "/api/venues/photo/{ref}" (Google proxy)
// We prefix relative paths with EXPO_PUBLIC_BACKEND_URL so React Native can fetch them.
const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

export function resolveImage(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${BASE}${url}`;
  return url;
}
