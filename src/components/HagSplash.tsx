import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

export const SPLASH_BG = '#0d0805';
const FADE_IN_MS = 350;
const HOLD_MS = 1100;
const FADE_OUT_MS = 300;

// Hot Attic Games branded launch screen.
//
// The native (Android 12+) system splash is configured as background-colour only
// (transparent icon, see app.json), so this screen is the single visible logo and
// there is no double splash. The native splash is released on first layout, which
// is already the same background colour, so the hand-off is seamless.
export function HagSplash({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }),
      Animated.delay(HOLD_MS),
      Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => { if (finished) onDoneRef.current(); });
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.root, { opacity }]}
      testID="hag-splash"
      onLayout={() => { SplashScreen.hideAsync().catch(() => {}); }}
    >
      <Image source={require('../../assets/brand/hag-logo.png')} style={styles.logo} resizeMode="contain" />
    </Animated.View>
  );
}

export const HAG_SPLASH_TOTAL_MS = FADE_IN_MS + HOLD_MS + FADE_OUT_MS;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPLASH_BG, alignItems: 'center', justifyContent: 'center' },
  logo: { width: '70%', height: '85%' },
});
