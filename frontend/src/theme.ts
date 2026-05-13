// BUMP — shared design tokens (Neon Brand v2)
// Visual language: dark-mode first, neon gradients, glassmorphism,
// floating cards, soft glow, oversized bold typography, sticker-like UI.

export const colors = {
  // Backgrounds
  void: "#0D0D14", // primary dark background
  base: "#0D0D14",
  elevated: "#15151F", // card surface
  surface: "#1B1B26", // raised inputs/sheets
  glass: "rgba(255,255,255,0.06)",
  glassBorder: "rgba(255,255,255,0.10)",

  // Brand
  primary: "#7B2EFF", // Primary Purple
  pink: "#FF4FA3", // Hot Pink
  blue: "#00D9FF", // Electric Blue
  lime: "#C8FF3D", // Lime Accent

  // Legacy aliases (kept so existing code doesn't break — point to new brand)
  volt: "#C8FF3D", // was yellow, now Lime
  fuchsia: "#FF4FA3",
  violet: "#7B2EFF",

  // Text
  textPrimary: "#FFFFFF",
  textSecondary: "#B0B0BF",
  textTertiary: "#6B6B7A",
  inverse: "#0D0D14",

  // Status
  success: "#3DDC97",
  danger: "#FF4D6D",
  warning: "#FFC857",

  // Gradient stops (use with expo-linear-gradient)
  gradStart: "#7B2EFF",
  gradEnd: "#FF4FA3",
};

// Reusable gradient palettes — pass directly to <LinearGradient colors={...}>
export const gradients = {
  brand: ["#7B2EFF", "#FF4FA3"] as const, // Purple → Pink (primary CTA)
  cool: ["#00D9FF", "#7B2EFF"] as const, // Blue → Purple
  pop: ["#C8FF3D", "#FFE74D"] as const, // Lime → Yellow
  dark: ["#0D0D14", "#15151F"] as const, // subtle bg variation
  glow: ["#7B2EFF33", "#FF4FA300"] as const, // soft halo
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 9999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Typography scale (in px) — oversized bold for hero, generous body
export const type = {
  hero: 52, // onboarding hero, splash
  display: 40, // top-of-screen titles
  h1: 32,
  h2: 24,
  h3: 20,
  body: 16,
  bodySm: 14,
  caption: 12,
  micro: 10,
};

export const weights = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  black: "900" as const,
};

export const fonts = {
  // Loaded by app/_layout.tsx via expo-google-fonts
  heading: "SpaceGrotesk_700Bold",
  headingBlack: "SpaceGrotesk_700Bold",
  body: "Inter_400Regular",
  bodyBold: "Inter_700Bold",
  mono: "Menlo",
};

export const shadows = {
  glow: {
    shadowColor: "#7B2EFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  glowPink: {
    shadowColor: "#FF4FA3",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
};
