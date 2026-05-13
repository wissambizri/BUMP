# BUMP — Product Requirements Document (v2 with Google Places)

## Overview
**BUMP** is a real-time proximity-based social matching app for nightlife venues. Users can only discover and match with others physically present at the same venue (club, lounge, bar, beach club, rooftop, restaurant, event).

**Tagline**: "Break the ice nearby."

## Tech Stack
- **Frontend**: React Native + Expo Router 6 (Expo SDK 54), dark mode locked
- **Backend**: FastAPI + Motor (async MongoDB), JWT (PyJWT) + bcrypt
- **Realtime**: WebSocket `/api/ws/chat/{match_id}` for chat broadcast + typing indicators
- **Geo**: `expo-location` + Haversine geofence (server-side validation)
- **Venue Discovery**: **Google Places API (New)** — nearby search within 2km, primary type filtering, photo media proxy
- **Camera**: `expo-camera` front-only live selfie (base64, no gallery)
- **Animation**: react-native-reanimated + expo-haptics

## Google Places Integration
- Endpoint: `POST https://places.googleapis.com/v1/places:searchNearby`
- Photo proxy: `GET /api/venues/photo/{base64-encoded-photo-name}` (hides API key)
- Included types: `night_club`, `bar`, `wine_bar`, `pub`, `cocktail_bar`, `restaurant`, `fine_dining_restaurant`
- Cache: 1-hour TTL per ~1km grid cell to minimize API quota usage
- Auto-checks demo users into newly-discovered venues (`DEMO_MODE=1`) for realistic live feed
- API key stored in `/app/backend/.env` as `GOOGLE_PLACES_API_KEY`

## Screens (12)
1. **Onboarding** — 3 looping slides w/ nightlife bg + Volt Yellow CTA
2. **Auth** — Login/Signup tabs, demo-credential helper
3. **Profile Setup** — photos (up to 6), gender, interested-in, bio, vibe tags
4. **Home (Venues)** — "Where are you tonight?", real Google Places venues w/ photos + LIVE badge + active counts
5. **Venue Detail** — Google venue image hero + "I'm here · Check in" CTA
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
- Venues: `GET /venues?lat&lng` (triggers Google Places fetch), `GET /venues/{id}`, `GET /venues/{id}/feed`, `GET /venues/photo/{token}` (Google photo proxy)
- Check-in: `POST /checkin`, `DELETE /checkin`, `GET /checkin/active`
- Match: `POST /likes`, `GET /matches`, `POST /matches/keep`
- Chat: `GET /messages/{match_id}`, `POST /messages`, WS `/ws/chat/{match_id}`
- Safety: `POST /safety/block/{id}`, `POST /safety/unblock/{id}`, `POST /safety/report`, `POST /safety/hide`, `DELETE /account`
- Admin: `GET /admin/analytics`, `/admin/users`, `/admin/reports`, `POST /admin/reports/{id}/resolve`, `DELETE /admin/users/{id}`

## Mongo Collections
- `users` (with embedded `blocked_users[]`, `is_admin`, `is_hidden`)
- `venues` (lat/lng, geofence_radius_m, place_id, photo_name, source="google")
- `places_cache` (cell key, updated_at — for Google API quota optimization)
- `checkins` (user_id, venue_id, selfie_base64, expires_at = +6h)
- `likes` (from_user, to_user, action)
- `matches` (user_a, user_b sorted, expires_at = +24h, kept_by[])
- `messages` (match_id, from_user, to_user, text, read, read_at)
- `reports` (from_user, target_user, reason, status)

## Auto-Expiry Logic
- Selfie/checkin expires after 6h
- Match auto-expires after 24h unless both users hit "Keep Connection"
- Google Places venue cache per grid: 1h refresh

## Safety
- Block (bidirectional filter), Report, Hide profile, Leave venue, Delete account

## Verified Live Demo
With user GPS at Times Square NYC (40.7580, -73.9855), the app pulls **37 real venues** from Google Places including Raising Cane's, Junior's Restaurant, Birdland Jazz Club, Hotel Riu Plaza Manhattan Times Square, etc. — all with real photos served through the photo proxy. Demo users are auto-distributed across these for live-feed realism.

## Future / Architecture-Ready (Deferred)
- Phone OTP (Twilio), Apple Sign-In, Google Sign-In
- Mapbox map UI overlay (currently list + distance)
- Face liveness AI on selfie capture
- Firebase / Expo Push notifications

## Smart Business Hooks
- **KEEP CONNECTION** = engagement extension drives DAU
- **LIVE counts** on venue cards = social proof drives check-ins
- **24h chat expiry** = scarcity drives faster real-world meet-ups
- **Real Google venues** = zero seed maintenance, works in any city globally
- Future: paid "Super Bump", venue partnerships, verified profile badges, "tonight's hottest venue" leaderboard, sponsored placements for partner venues
