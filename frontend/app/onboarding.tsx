import { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  ImageBackground,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../src/theme";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    title: "Tonight\nstarts here.",
    sub: "Discover people already at your venue.",
    bg: "https://images.unsplash.com/photo-1566808907388-c3ce09bc004f?w=1200&q=80",
  },
  {
    title: "Real life.\nReal time.",
    sub: "You can only match with people physically present.",
    bg: "https://images.unsplash.com/photo-1571266028243-d220c6a1b8c4?w=1200&q=80",
  },
  {
    title: "Break\nthe ice.",
    sub: "Mutual like? It's a BUMP. Chat unlocks for 24 hours.",
    bg: "https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=1200&q=80",
  },
];

export default function Onboarding() {
  const [idx, setIdx] = useState(0);
  const ref = useRef<FlatList>(null);
  const router = useRouter();

  const onScroll = (e: any) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== idx) setIdx(i);
  };

  const next = () => {
    if (idx < SLIDES.length - 1) {
      ref.current?.scrollToIndex({ index: idx + 1, animated: true });
    } else {
      router.replace("/auth");
    }
  };

  return (
    <View style={styles.root}>
      <FlatList
        ref={ref}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <ImageBackground source={{ uri: item.bg }} style={{ width, height: "100%" }}>
            <LinearGradient
              colors={["rgba(3,3,5,0.4)", "rgba(3,3,5,0.95)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <SafeAreaView style={styles.slide}>
              <Text style={styles.brand}>BUMP</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.sub}>{item.sub}</Text>
            </SafeAreaView>
          </ImageBackground>
        )}
      />
      <SafeAreaView style={styles.footer} pointerEvents="box-none">
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, idx === i && { backgroundColor: colors.volt, width: 24 }]}
            />
          ))}
        </View>
        <TouchableOpacity
          testID="onboarding-cta"
          style={styles.cta}
          onPress={next}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>
            {idx < SLIDES.length - 1 ? "Next" : "Enter the Club"}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  slide: { flex: 1, padding: 24, paddingBottom: 160 },
  brand: {
    color: colors.volt,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 56,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: 12,
    lineHeight: 22,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
  },
  dots: { flexDirection: "row", justifyContent: "center", marginBottom: 16, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)" },
  cta: {
    backgroundColor: colors.volt,
    paddingVertical: 18,
    borderRadius: 999,
    alignItems: "center",
  },
  ctaText: { color: colors.inverse, fontSize: 17, fontWeight: "800" },
});
