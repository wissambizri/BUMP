/**
 * BUMP brand UI primitives — neon gradients, glassmorphism, floating cards.
 * Drop these into any screen for instant brand consistency.
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, radii, fonts, type, shadows } from "./theme";

// ---------- Gradient Button (primary CTA) ----------
export function GradientButton({
  label,
  onPress,
  loading,
  disabled,
  variant = "brand",
  style,
  textStyle,
  testID,
}: {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "brand" | "cool" | "pop";
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const stops = gradients[variant];
  const isDark = variant === "pop";
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        { borderRadius: radii.full, overflow: "hidden" },
        variant === "brand" ? shadows.glow : variant === "pop" ? null : shadows.glowPink,
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      <LinearGradient
        colors={stops as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={btnStyles.fill}
      >
        {loading ? (
          <ActivityIndicator color={isDark ? colors.inverse : "#fff"} />
        ) : (
          <Text
            style={[
              btnStyles.label,
              { color: isDark ? colors.inverse : "#fff" },
              textStyle,
            ]}
          >
            {label}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const btnStyles = StyleSheet.create({
  fill: {
    paddingVertical: 17,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});

// ---------- Glass / Floating Card ----------
export function Card({
  children,
  style,
  glow,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glow?: boolean;
}) {
  return (
    <View
      style={[
        cardStyles.base,
        glow && shadows.glow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  base: {
    backgroundColor: colors.elevated,
    borderRadius: radii.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...Platform.select({
      ios: shadows.card,
      android: {},
      default: shadows.card,
    }),
  },
});

// ---------- Brand background w/ subtle radial gradient ----------
export function BrandBackdrop({
  children,
  style,
  variant = "brand",
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: "brand" | "cool" | "dark";
}) {
  // Layer: dark base + soft top-right gradient halo
  const halo = gradients[variant === "dark" ? "brand" : variant];
  return (
    <View style={[{ flex: 1, backgroundColor: colors.void }, style]}>
      <LinearGradient
        colors={[halo[0] + "55", "transparent"] as any}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 0.6 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[halo[1] + "33", "transparent"] as any}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.6, y: 0.3 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

// ---------- Headline / Display text ----------
export function Headline({
  children,
  size = "h1",
  style,
  gradient,
  variant = "brand",
}: {
  children: React.ReactNode;
  size?: "hero" | "display" | "h1" | "h2" | "h3";
  style?: StyleProp<TextStyle>;
  gradient?: boolean;
  variant?: "brand" | "cool" | "pop";
}) {
  const fontSize = type[size];
  if (gradient && Platform.OS === "web") {
    // Web supports background-clip text
    const stops = gradients[variant];
    return (
      <Text
        style={[
          {
            fontFamily: fonts.heading,
            fontWeight: "900",
            fontSize,
            letterSpacing: -0.8,
            // @ts-ignore web-only
            background: `linear-gradient(135deg, ${stops[0]}, ${stops[1]})`,
            // @ts-ignore
            WebkitBackgroundClip: "text",
            // @ts-ignore
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            color: "transparent",
          },
          style,
        ]}
      >
        {children}
      </Text>
    );
  }
  return (
    <Text
      style={[
        {
          fontFamily: fonts.heading,
          fontWeight: "900",
          fontSize,
          color: colors.textPrimary,
          letterSpacing: -0.8,
          lineHeight: fontSize * 1.05,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ---------- Pill chip ----------
export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: radii.full,
        backgroundColor: active ? colors.primary : colors.elevated,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.glassBorder,
      }}
    >
      <Text
        style={{
          color: active ? "#fff" : colors.textSecondary,
          fontFamily: fonts.bodyBold,
          fontWeight: "700",
          fontSize: 13,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
