// Screens/VisitCodeModal.js
// Customer taps "Get Visit Reward" → generates a one-time check-in code + QR.
// When the business scans/enters it, 10 NeedCoins are added to the user.
import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image, Clipboard,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { UserContext } from '../server/CurrentUser';
import { useAuthModal } from './AuthModalContext';

import { NODE_API } from '../config';
import { IS_WEB } from '../webLayout';
const NEEDCOIN_IMG = require('../assets/NeedCoin.png');
const VISIT_COINS = 10;

export default function VisitCodeModal({ visible, onClose, restaurant }) {
  const { userId } = useContext(UserContext);
  const { show: showAuth } = useAuthModal();

  const [code, setCode]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    if (visible) {
      setCode(null);
      setCopied(false);
      fetchCode();
    }
  }, [visible]);

  const fetchCode = async () => {
    if (!userId) { showAuth?.(); onClose(); return; }
    if (!restaurant?._id) { Alert.alert('Error', 'Restaurant info missing.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${NODE_API}/visitCodes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, restaurantId: restaurant._id }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        throw new Error('Server unavailable. Please try again shortly.');
      }
      if (!res.ok) throw new Error(data.error || 'Server error');
      setCode(data.code);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not generate code. Try again.');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!code) return;
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>

          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={IS_WEB ? 29 : 22} color="#374151" />
          </TouchableOpacity>

          {/* Header card */}
          <View style={styles.headerCard}>
            <Image source={NEEDCOIN_IMG} style={styles.coinImg} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Visit Rewards</Text>
              <Text style={styles.headerSub}>
                Show this code or QR at <Text style={{ fontWeight: '800' }}>{restaurant?.name}</Text> to earn your NeedCoins.
              </Text>
            </View>
          </View>

          {/* Coins badge */}
          <View style={styles.coinsBadge}>
            <Ionicons name="star" size={IS_WEB ? 21 : 16} color="#F59E0B" />
            <Text style={styles.coinsBadgeText}> Earn {VISIT_COINS} NeedCoins for this visit</Text>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#15803D" />
              <Text style={styles.loadingText}>Generating your visit code…</Text>
            </View>
          ) : code ? (
            <>
              {/* QR Code */}
              <View style={styles.qrWrap}>
                <QRCode value={code} size={IS_WEB ? 234 : 180} color="#111827" backgroundColor="#fff" />
              </View>

              {/* Code text */}
              <Text style={styles.codeLabel}>YOUR VISIT CODE</Text>
              <TouchableOpacity style={styles.codeBox} onPress={handleCopy} activeOpacity={0.8}>
                <Text style={styles.codeText}>{code}</Text>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={IS_WEB ? 26 : 20}
                  color={copied ? '#16A34A' : '#6B7280'}
                  style={{ marginLeft: IS_WEB ? 13 : 10 }}
                />
              </TouchableOpacity>
              {copied && <Text style={styles.copiedText}>Copied!</Text>}

              {/* Instruction */}
              <View style={styles.instrRow}>
                <Ionicons name="shield-checkmark-outline" size={IS_WEB ? 21 : 16} color="#15803D" />
                <Text style={styles.instrText}>
                  Show this code or QR to the restaurant staff when you arrive. Each code is one-time use.
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: IS_WEB ? 52 : 40, paddingHorizontal: IS_WEB ? 31 : 24, maxHeight: '92%',
    maxWidth: IS_WEB ? 960 : undefined, width: '100%', alignSelf: 'center',
  },
  closeBtn: { alignSelf: 'flex-end', marginTop: IS_WEB ? 21 : 16, marginBottom: IS_WEB ? 10 : 8, padding: IS_WEB ? 5 : 4 },
  headerCard: {
    flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 18 : 14,
    backgroundColor: '#F0FDF4', borderRadius: IS_WEB ? 21 : 16,
    padding: IS_WEB ? 21 : 16, marginBottom: IS_WEB ? 16 : 12,
  },
  coinImg: { width: IS_WEB ? 73 : 56, height: IS_WEB ? 73 : 56 },
  headerTitle: { fontSize: IS_WEB ? 26 : 20, fontWeight: '900', color: '#14532D', marginBottom: IS_WEB ? 5 : 4 },
  headerSub:   { fontSize: IS_WEB ? 17 : 13, color: '#166534', lineHeight: IS_WEB ? 23 : 18 },
  coinsBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFBEB', borderRadius: 20,
    paddingVertical: IS_WEB ? 10 : 8, paddingHorizontal: IS_WEB ? 21 : 16,
    marginBottom: IS_WEB ? 26 : 20, alignSelf: 'center',
  },
  coinsBadgeText: { fontSize: IS_WEB ? 18 : 14, fontWeight: '700', color: '#92400E' },
  loadingWrap: { alignItems: 'center', paddingVertical: IS_WEB ? 52 : 40 },
  loadingText: { color: '#6B7280', marginTop: IS_WEB ? 16 : 12, fontSize: IS_WEB ? 18 : 14 },
  qrWrap: {
    alignSelf: 'center', padding: IS_WEB ? 21 : 16, backgroundColor: '#fff',
    borderRadius: IS_WEB ? 21 : 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: IS_WEB ? 26 : 20,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  codeLabel: {
    fontSize: IS_WEB ? 14 : 11, fontWeight: '700', letterSpacing: 1.5,
    color: '#9CA3AF', textAlign: 'center', marginBottom: IS_WEB ? 13 : 10,
  },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9', borderRadius: IS_WEB ? 16 : 12,
    paddingVertical: IS_WEB ? 18 : 14, paddingHorizontal: IS_WEB ? 31 : 24, marginBottom: IS_WEB ? 8 : 6,
  },
  codeText: {
    fontSize: IS_WEB ? 34 : 26, fontWeight: '900', letterSpacing: 4, color: '#111',
    fontVariant: ['tabular-nums'],
  },
  copiedText: { textAlign: 'center', color: '#16A34A', fontSize: IS_WEB ? 17 : 13, fontWeight: '600', marginBottom: IS_WEB ? 16 : 12 },
  instrRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: IS_WEB ? 10 : 8,
    backgroundColor: '#F0FDF4', borderRadius: IS_WEB ? 13 : 10, padding: IS_WEB ? 16 : 12, marginTop: IS_WEB ? 16 : 12,
  },
  instrText: { fontSize: IS_WEB ? 16 : 12, color: '#166534', flex: 1, lineHeight: IS_WEB ? 22 : 17 },
});
