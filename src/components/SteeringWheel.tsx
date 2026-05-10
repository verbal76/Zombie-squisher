import React, { useEffect, useRef } from 'react';
import { Animated, GestureResponderEvent, PanResponder, StyleSheet, View } from 'react-native';

interface Props {
  size?: number;
  maxRotation?: number;
  onChange: (turn: number) => void;
}

export function SteeringWheel({ size = 150, maxRotation = 540, onChange }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;
  const rotationValue = useRef(0);
  const startFingerAngle = useRef(0);
  const startWheelRotation = useRef(0);

  useEffect(() => {
    const id = rotation.addListener(({ value }) => {
      rotationValue.current = value;
      onChange(Math.max(-1, Math.min(1, value / maxRotation)));
    });
    return () => rotation.removeListener(id);
  }, [rotation, maxRotation, onChange]);

  const fingerAngle = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX - size / 2;
    const y = e.nativeEvent.locationY - size / 2;
    return (Math.atan2(y, x) * 180) / Math.PI;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        startFingerAngle.current = fingerAngle(e);
        startWheelRotation.current = rotationValue.current;
        rotation.stopAnimation();
      },
      onPanResponderMove: (e) => {
        let delta = fingerAngle(e) - startFingerAngle.current;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        const next = Math.max(-maxRotation, Math.min(maxRotation, startWheelRotation.current + delta));
        rotation.setValue(next);
      },
      onPanResponderRelease: () => {
        Animated.spring(rotation, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 12 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(rotation, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 12 }).start();
      },
    }),
  ).current;

  const rotateInterp = rotation.interpolate({
    inputRange: [-maxRotation, maxRotation],
    outputRange: [`-${maxRotation}deg`, `${maxRotation}deg`],
  });

  const half = size / 2;
  const ringW = Math.max(10, Math.round(size * 0.1));
  const innerR = half - ringW;
  const spokeW = Math.max(8, Math.round(size * 0.09));
  const spokeLen = innerR * 2;
  const hubSize = Math.round(size * 0.32);
  const markerW = Math.round(size * 0.1);
  const markerH = ringW + 6;

  return (
    <View style={[styles.container, { width: size, height: size }]} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.outer,
          { width: size, height: size, borderRadius: half, borderWidth: ringW, transform: [{ rotate: rotateInterp }] },
        ]}
      >
        {[0, 120, 240].map((deg) => (
          <View
            key={deg}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: half - spokeW / 2 - ringW,
              top: half - spokeLen / 2 - ringW,
              width: spokeW,
              height: spokeLen,
              backgroundColor: '#1f1f1f',
              borderRadius: spokeW / 2,
              transform: [{ rotate: `${deg}deg` }],
            }}
          />
        ))}

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: half - hubSize / 2 - ringW,
            top: half - hubSize / 2 - ringW,
            width: hubSize,
            height: hubSize,
            borderRadius: hubSize / 2,
            backgroundColor: '#2a2a2a',
            borderWidth: 3,
            borderColor: '#000',
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: hubSize * 0.25 - 3,
              top: hubSize * 0.25 - 3,
              width: hubSize * 0.5,
              height: hubSize * 0.5,
              borderRadius: hubSize * 0.25,
              backgroundColor: '#ffd24a',
              opacity: 0.85,
            }}
          />
        </View>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: half - markerW / 2 - ringW,
            top: -3,
            width: markerW,
            height: markerH,
            backgroundColor: '#ffd24a',
            borderRadius: 2,
          }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', alignItems: 'center' },
  outer: { backgroundColor: '#0a0a0a', borderColor: '#0a0a0a' },
});
