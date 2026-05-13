// BUMP — shared design tokens
export const colors = {
  void: "#030305",
  base: "#0A0A0E",
  elevated: "#141419",
  glass: "rgba(255,255,255,0.04)",
  glassBorder: "rgba(255,255,255,0.08)",

  volt: "#E1FF00",
  fuchsia: "#FF007F",
  violet: "#9D4CDD",

  textPrimary: "#FFFFFF",
  textSecondary: "#8F8F99",
  textTertiary: "#5C5C66",
  inverse: "#000000",

  success: "#3ddc97",
  danger: "#ff4d6d",
};

export const radii = {
  sm: 6,
  md: 12,
  lg: 24,
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

export const fonts = {
  // Using system fonts; per RN Expo, custom font loading deferred
  heading: undefined as string | undefined, // system bold
  body: undefined as string | undefined,
  mono: "Menlo",
};
