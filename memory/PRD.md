# BUMP — Product Requirements Document

## Overview
**BUMP** is a real-time proximity-based social matching app for nightlife venues. Users can only discover and match with others physically present at the same venue (club, lounge, bar, beach club, rooftop, event).

**Tagline**: "Break the ice nearby."

## Tech Stack
- **Frontend**: React Native + Expo Router 6 (Expo SDK 54), dark mode locked
- **Backend**: FastAPI + Motor (async MongoDB), JWT (PyJWT) + bcrypt
- **Realtime**: WebSocket `/api/ws/chat/{match_id}` for chat broadcast + typing indicators
- **Geo**: `expo-location` + Haversine geofence (server-side validation)
- **Camera**: `expo-camera` front-only live selfie (base64, no gallery)
- **Animation**: react-native-reanimated + expo-haptics

## Screens (12)
1. **Onboarding** — 3 looping slides w/ nightlife bg + Volt Yellow CTA
2. **Auth** — Login/Signup tabs, demo-credential helper
3. **Profile Setup** — photos (up to 6), gender, interested-in, bio, vibe tags
4. **Home (Venues)** — "Where are you tonight?", venue cards with LIVE badge + count
5. **Venue Detail** — Image hero + "I'm here · Check in" CTA
6. **Check-in Selfie** — Front camera circular mask + scanline; demo fallback for preview
7. **Live Venue Feed** — 2-col grid of LIVE users with time-since-check-in
8. **Profile Detail** — Bio, vibe chips, gallery, Like / Hi / Pass / Block / Report
9. **Match Animation** — "IT'S A BUMP 💥" w/ spring/scale + pulsing fuchsia ring
10. **Matches** — List with 24h countdown or KEPT badge
11. **Chat** — Real-time messages, typing, READ receipts, KEEP button
12. **Settings + Admin Dashboard** — edit profile, hide, leave venue, sign out, delete; admin: analytics/users/reports/venues

## Backend API (FastAPI, all under /api)
- Auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- Profile: `PUT /profile`
- Venues: `GET /venues?lat&lng`, `GET /venues/{id}`, `GET /venues/{id}/feed`
- Check-in: `POST /checkin`, `DELETE /checkin`, `GET /checkin/active`
- Match: `POST /likes`, `GET /matches`, `POST /matches/keep`
- Chat: `GET /messages/{match_id}`, `POST /messages`, WS `/ws/chat/{match_id}`
- Safety: `POST /safety/block/{id}`, `POST /safety/unblock/{id}`, `POST /safety/report`, `POST /safety/hide`, `DELETE /account`
- Admin: `GET /admin/analytics`, `/admin/users`, `/admin/reports`, `POST /admin/reports/{id}/resolve`, `DELETE /admin/users/{id}`

## Mongo Collections
- `users` (with embedded `blocked_users[]`, `is_admin`, `is_hidden`)
- `venues` (lat/lng, geofence_radius_m)
- `checkins` (user_id, venue_id, selfie_base64, expires_at = +6h)
- `likes` (from_user, to_user, action)
- `matches` (user_a, user_b sorted, expires_at = +24h, kept_by[])
- `messages` (match_id, from_user, to_user, text, read, read_at)
- `reports` (from_user, target_user, reason, status)

## Auto-Expiry Logic
- Selfie/checkin expires after 6h (filtered server-side by `expires_at > now`)
- Match auto-expires after 24h unless both users hit "Keep Connection"
- Live feed and venue active counts honor expiry

## Safety
- Block (bidirectional filter in feeds, profiles, feed lists)
- Report (admin-reviewable)
- Hide my profile (instant invisibility, toggleable)
- Leave venue (immediate removal)
- Delete account (cascade delete all data)

## Demo Seed Data
- 8 venues across NYC, Miami, LA, Chicago, Vegas
- 6 demo users pre-checked-in
- 1 admin (`admin@bump.app` / `admin1234`)
- `DEMO_MODE=1` env var bypasses GPS distance check for preview

## Future / Architecture-Ready (Deferred)
- Phone OTP, Apple Sign-In, Google Sign-In (auth scaffolding ready)
- Mapbox map UI (currently list + distance)
- Face liveness AI on selfie capture (currently selfie-only)
- Firebase push notifications (currently in-app indicators)

## Smart Enhancement (Revenue / Engagement Hooks)
- **KEEP CONNECTION** = engagement extension (drives DAU)
- LIVE counts on venue cards = social proof → drives check-ins
- 24h chat expiry = scarcity → faster meet-up conversions
- Future: venue partnerships, paid "Super Bump", verified profile badges, "tonight's hottest venue" leaderboard
