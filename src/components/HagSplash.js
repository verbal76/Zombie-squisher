import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

export const SPLASH_BG = '#0d0805';
const FADE_IN = 350;
const HOLD = 1100;
const FADE_OUT = 300;

// Hot Attic Games branded launch screen. The native system splash is background-colour only
// (see app.json), so this is the single visible logo: no double splash on Android 12+.
export default function HagSplash({ onDone }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: FADE_IN, useNativeDriver: true }),
      Animated.delay(HOLD),
      Animated.timing(opacity, { toValue: 0, duration: FADE_OUT, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => finished && onDone());
    return () => anim.stop();
  }, [opacity, onDone]);

  return (
    <Animated.View style={[styles.root, { opacity }]} testID="hag-splash">
      <Image source={require('../../assets/hag-logo.png')} style={styles.logo} resizeMode="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPLASH_BG, alignItems: 'center', justifyContent: 'center' },
  logo: { width: '70%', height: '85%' },
});
