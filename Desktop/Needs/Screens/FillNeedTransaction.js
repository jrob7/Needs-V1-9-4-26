import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Image,
  Modal,
  TouchableOpacity,
  Dimensions,
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

const NODE_SIZE = 77;
const ITEM_SIZE = 60;
const PAD = 5;
const MID_Y = 140;
const GAP = 27;
const ARROW_SIZE = 47;
const { width: SCREEN_W } = Dimensions.get('window');

export default function FillNeedTransaction({ visible = true, onClose, route, navigation }) {
      const {
           needItem = {},
           supplierImage,
           requesterImage,
           supplierName,
           requesterName,
           currentUserId,
          } = route?.params || {};

  const [cardW, setCardW] = useState(SCREEN_W - 40);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fromName, setFromName] = useState(supplierName || 'You');
  const [toName, setToName] = useState(requesterName || 'Requester');

  const leftX = PAD + NODE_SIZE / 2;
  const rightX = Math.max(leftX + 1, cardW - PAD - NODE_SIZE / 2);
  const innerLeft = leftX + NODE_SIZE / 2 + GAP;
  const innerRight = rightX - NODE_SIZE / 2 - GAP;
  const usableSpan = Math.max(1, innerRight - innerLeft);
  const progress = useSharedValue(0);

  // Base URL for your local backend
  const BASE_URL = 'http://localhost:3000';

  useEffect(() => {
    console.log("🧩 Need Item:", needItem);
    console.log("🔍 currentUserId:", currentUserId);
  }, []);

  // --- helper: fetch user's first name
  const fetchUserName = async (userId) => {
    try {
      if (!userId) return null;
      const res = await fetch(`${BASE_URL}/getUserProfile?userId=${userId}`);
      if (!res.ok) throw new Error('User fetch failed');
      const data = await res.json();
      return data?.firstName || null;
    } catch (err) {
      console.warn('⚠️ Could not fetch user names:', err);
      return null;
    }
  };

  // --- preload both names when modal opens
  useEffect(() => {
    const loadNames = async () => {
      const [from, to] = await Promise.all([
        fetchUserName(currentUserId),
        fetchUserName(needItem?.userId),
      ]);
      if (from) setFromName(from);
      if (to) setToName(to);
    };
    loadNames();
  }, [visible]);

  // --- handle successful completion
  const confirmOnce = async () => {
    try {
      setShowConfirm(false);

      // Prepare transaction data
      const payload = {
        toUserId: needItem?.userId,
        amount: needItem?.bidprice || 0,
        needId: needItem?._id,
        needTitle: needItem?.searchText || 'Untitled',
        fromName,
        toName,
      };

      console.log('💾 Saving transaction:', payload);

      const response = await authFetch(`${BASE_URL}/transactions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log('✅ Transaction saved:', data);

      if (data.error) {
        console.error('❌ Transaction failed on backend:', data.error);
        Alert.alert('Error', data.error);
        return;
      }

      Alert.alert('✅ Transfer Complete', `${needItem?.searchText || 'Item'} sent successfully.`);
      onClose?.();
      navigation.navigate('Activity', {
        showGraph: true,
        isNeedFlow: true,
        needItem,
        refresh: true,
      });
    } catch (error) {
      console.error('❌ Transaction save failed:', error);
      Alert.alert('Error', 'Transaction failed to save.');
    }
  };

  const confirmTransferPrompt = () => setShowConfirm(true);

  // --- slider gesture
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const next = Math.min(1, Math.max(0, e.translationX / usableSpan));
      progress.value = next;
    })
    .onEnd(() => {
      if (progress.value >= 0.98) {
        progress.value = withTiming(1);
        runOnJS(confirmTransferPrompt)();
      } else {
        progress.value = withTiming(0);
      }
    });

  // --- slider position
  const sliderStyle = useAnimatedStyle(() => {
    const x = innerLeft + usableSpan * progress.value;
    return {
      transform: [
        { translateX: x - ITEM_SIZE / 2 },
        { translateY: MID_Y - ITEM_SIZE / 2.35 },
      ],
    };
  });

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* ✕ Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.header}>Slide to Fulfill Need</Text>

          {/* --- Graph --- */}
          <View
            style={styles.graphCard}
            onLayout={(e) => setCardW(e.nativeEvent.layout.width)}
          >
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

            {/* Supplier node */}
            <View
              style={[
                styles.node,
                { left: leftX - NODE_SIZE / 2, top: MID_Y - NODE_SIZE / 2 },
              ]}
            >
              {supplierImage ? (
                <Image source={{ uri: supplierImage }} style={styles.nodeImage} />
              ) : (
                <Text style={styles.nodeText}>{fromName}</Text>
              )}
            </View>

            {/* Requester node */}
            <View
              style={[
                styles.node,
                { left: rightX - NODE_SIZE / 2, top: MID_Y - NODE_SIZE / 2 },
              ]}
            >
              {requesterImage ? (
                <Image source={{ uri: requesterImage }} style={styles.nodeImage} />
              ) : (
                <Text style={styles.nodeText}>{toName}</Text>
              )}
            </View>

            {/* Moving Item */}
            <GestureDetector gesture={pan}>
              <Animated.View style={[styles.slider, sliderStyle]}>
                <Text style={styles.arrow}>→</Text>
                <View style={styles.itemCircle}>
                  <Image source={{ uri: needItem?.media?.uri }} style={styles.itemImage} />
                </View>
              </Animated.View>
            </GestureDetector>
          </View>

          {/* Confirmation Modal */}
          <Modal transparent visible={showConfirm} animationType="fade">
            <View style={styles.innerOverlay}>
              <View style={styles.confirmBox}>
                <Text style={styles.modalTitle}>Confirm Transfer</Text>
                <Text style={styles.modalText}>
                  Send <Text style={{ fontWeight: '700' }}>{needItem?.searchText}</Text>?
                </Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity
                    onPress={() => setShowConfirm(false)}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmOnce} style={styles.confirmBtn}>
                    <Text style={styles.confirmText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </Modal>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
  },
  closeBtn: { position: 'absolute', top: 10, right: 14, zIndex: 10 },
  closeText: { fontSize: 24, color: '#000' },
  header: { fontSize: 22, fontWeight: '800', marginVertical: 18 },
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
    borderWidth: 3,
    borderColor: '#007bff',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  nodeImage: { width: '100%', height: '100%', borderRadius: NODE_SIZE / 2 },
  nodeText: { fontSize: 14, fontWeight: '700', color: '#007bff', textAlign: 'center' },
  slider: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  itemCircle: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    borderWidth: 3,
    borderColor: '#007bff',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  itemImage: { width: '100%', height: '100%' },
  arrow: { fontSize: ARROW_SIZE, lineHeight: ARROW_SIZE, color: '#007bff', marginRight: 6 },
  innerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '80%' },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  modalText: { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  confirmButtons: { flexDirection: 'row', justifyContent: 'space-around' },
  cancelBtn: {
    backgroundColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    width: '40%',
    alignItems: 'center',
  },
  confirmBtn: {
    backgroundColor: '#007bff',
    borderRadius: 8,
    padding: 10,
    width: '40%',
    alignItems: 'center',
  },
  cancelText: { fontWeight: '700', color: '#000' },
  confirmText: { fontWeight: '700', color: '#fff' },
});