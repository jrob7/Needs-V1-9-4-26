// Screens/FundraiserTransactionComplete.js
import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Modal,
  TouchableOpacity,
  Dimensions,
  TextInput,
  Image,                // 👈 NEW
} from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { authFetch } from '../server/api';

const NODE_SIZE = 72;
const DOT_SIZE = 30;
const PAD = 5;
const MID_Y = 140;
const GAP = 10;
const ARROW_SIZE = 50;
const { width: SCREEN_W } = Dimensions.get('window');

export default function FundraiserTransactionComplete({
  visible = true,
  onClose,
  route,
  navigation,
}) {
  const {
    fromName = 'You',
    toName = 'Fundraiser',
    amount: initialAmount = '1',
    userId,
    fundraiserId,
  } = route?.params || {};

  const [amount, setAmount] = useState(initialAmount);
  const [cardW, setCardW] = useState(SCREEN_W - 40);
  const progress = useSharedValue(0);
  const firedRef = useRef(false);

  // slider vs coin phase
  const [phase, setPhase] = useState('slider');
  const coinScale = useSharedValue(0);

  useEffect(() => {
    if (phase === 'coin') {
      coinScale.value = 0;
      coinScale.value = withTiming(1, { duration: 450 });
    } else {
      coinScale.value = 0;
    }
  }, [phase, coinScale]);

  const leftX = PAD + NODE_SIZE / 2;
  const rightX = Math.max(leftX + 1, cardW - PAD - NODE_SIZE / 2);
  const innerLeft = leftX + NODE_SIZE / 2 + GAP;
  const innerRight = rightX - NODE_SIZE / 2 - GAP;
  const usableSpan = Math.max(1, innerRight - innerLeft);

  // ----------------- confirm + backend + coin -----------------
  const confirmOnce = async () => {
    if (firedRef.current) return;
    firedRef.current = true;

    try {
      if (!userId || !fundraiserId) {
        Alert.alert('Error', 'Missing user or fundraiser info.');
        firedRef.current = false;
        return;
      }

      const response = await authFetch('http://localhost:3000/fundraiserContribution', {
        method: 'POST',
        body: JSON.stringify({
          fundraiserId,
          amount: parseFloat(amount),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Something went wrong');
      }

      // no "Thank you" alert so it doesn't cover the coin
      setPhase('coin');

      setTimeout(() => {
        setPhase('slider');
        firedRef.current = false;
        onClose?.();
        navigation.navigate('Activity', {
          showGraph: true,
          refresh: true,
          isNeedFlow: false,
          fundraiserId,
          needItem: { _id: fundraiserId, type: 'fundraiser' },
        });
      }, 4000);
    } catch (err) {
      console.error('Transaction failed:', err);
      Alert.alert('Transaction Error', err.message || 'Failed to send contribution.');
      firedRef.current = false;
    }
  };

  const confirmDonationPrompt = () => {
    Alert.alert('Confirm Donation', `Contribute $${amount}?`, [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => (progress.value = withTiming(0)),
      },
      { text: 'Yes', onPress: () => runOnJS(confirmOnce)() },
    ]);
  };

  // ----------------- gesture -----------------
  const pan = Gesture.Pan()
    .enabled(phase === 'slider')
    .onUpdate((e) => {
      const next = Math.min(1, Math.max(0, e.translationX / usableSpan));
      progress.value = next;
    })
    .onEnd(() => {
      if (progress.value >= 0.98) {
        progress.value = withTiming(1);
        runOnJS(confirmDonationPrompt)();
      } else {
        progress.value = withTiming(0);
      }
    });

  const sliderStyle = useAnimatedStyle(() => {
    const x = innerLeft + usableSpan * progress.value;
    return {
      transform: [
        { translateX: x - DOT_SIZE / 2 },
        { translateY: MID_Y - DOT_SIZE / 2 },
      ],
    };
  });

  const coinPhaseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coinScale.value }],
    opacity: coinScale.value,
  }));

  // ----------------- render -----------------
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.header}>Contribute to Fundraiser</Text>

          <View
            style={styles.graphCard}
            onLayout={(e) => setCardW(e.nativeEvent.layout.width)}
          >
            {/* Rails */}
            <Svg width="100%" height={220}>
              <Line
                x1={leftX}
                y1={MID_Y}
                x2={rightX}
                y2={MID_Y}
                stroke="#000"
                strokeWidth={10}
                strokeLinecap="round"
              />
              <Line
                x1={leftX}
                y1={MID_Y}
                x2={rightX}
                y2={MID_Y}
                stroke="white"
                strokeWidth={6}
                strokeLinecap="round"
              />
            </Svg>

            {/* Nodes */}
            <View
              style={[
                styles.node,
                { left: leftX - NODE_SIZE / 2, top: MID_Y - NODE_SIZE / 2 },
              ]}
            >
              <Text numberOfLines={1} style={styles.nodeText}>
                {fromName}
              </Text>
            </View>

            <View
              style={[
                styles.node,
                { left: rightX - NODE_SIZE / 2, top: MID_Y - NODE_SIZE / 2 },
              ]}
            >
              <Text numberOfLines={1} style={styles.nodeText}>
                {toName}
              </Text>
            </View>

            {/* Slider phase */}
            {phase === 'slider' && (
              <GestureDetector gesture={pan}>
                <Animated.View style={[styles.slider, sliderStyle]}>
                  <View style={styles.coin}>
                    <Text style={{ fontSize: 12, color: '#000' }}>$</Text>
                    <TextInput
                      style={styles.coinInput}
                      value={amount}
                      onChangeText={(text) =>
                        setAmount(text.replace(/[^0-9]/g, ''))
                      }
                      keyboardType="numeric"
                      maxLength={5}
                    />
                  </View>
                  <Text style={styles.arrow}>→</Text>
                </Animated.View>
              </GestureDetector>
            )}

            {/* Coin phase */}
            {phase === 'coin' && (
              <Animated.View
                style={[styles.coinCongratsContainer, coinPhaseStyle]}
              >
                <View style={styles.bigCoinWrapper}>
                  <View style={styles.bigCoin}>
                    {/* Your N logo inside the circle */}
                    <Image
                      source={require('../assets/needsN.png')}
                      style={styles.bigCoinLogo}
                      resizeMode="contain"
                    />
                  </View>

                  {/* 🔵 3+ badge in top-right of coin */}
                  <View style={styles.coinBadge}>
                    <Text style={styles.coinBadgeText}>3+</Text>
                  </View>
                </View>

                <Text style={styles.coinAwardText}>NeedCoin Awarded</Text>
              </Animated.View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ----------------- styles -----------------
const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modalCard: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
  },
  closeBtn: { position: 'absolute', top: 10, right: 14, zIndex: 99999 },
  closeText: { fontSize: 24, color: '#000' },
  header: {
    fontSize: 22,
    fontWeight: '800',
    marginVertical: 18,
    color: '#111',
  },
  graphCard: {
    width: '100%',
    height: 260,
    backgroundColor: '#F0F0F0',
    borderRadius: 16,
  },
  node: {
    position: 'absolute',
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  nodeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  slider: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  coin: {
    width: DOT_SIZE + 26,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: 'gold',
    borderWidth: 2,
    borderColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    flexDirection: 'row',
    transform: [{ translateY: -((ARROW_SIZE - DOT_SIZE) / 2) }],
  },
  coinInput: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    width: 38,
    height: 22,
    padding: 0,
    marginLeft: 2,
  },
  arrow: {
    fontSize: ARROW_SIZE,
    lineHeight: ARROW_SIZE,
    color: '#007bff',
    marginTop: 5,
    transform: [{ translateY: -((ARROW_SIZE - DOT_SIZE) / 2) }],
  },

  // celebration
  coinCongratsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },

  bigCoinWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigCoin: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'white',   // white circle behind logo
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  bigCoinLogo: {
    width: 80,
    height: 80,
  },

  coinBadge: {
    position: 'absolute',
    top: -8,              // moved a little upward for bigger size
    right: -8,            // moved a little rightward
    minWidth: 48,         // ⬆️ wider badge
    height: 28,           // ⬆️ taller badge
    borderRadius: 20,     // ⬆️ radius to match new height
    paddingHorizontal: 8,
    backgroundColor: '#0A84FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,       // ⬆️ slightly thicker border for proportional look
    borderColor: '#fff',
  },
  
  coinBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,         // ⬆️ bigger text
  },

  coinAwardText: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
  },
});