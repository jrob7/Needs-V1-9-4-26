// Screens/OfferCodeModal.js
// Customer taps "Redeem" on an offer → this modal shows their unique code + QR.
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

const OFFER_COLORS = {
  orange:   { bg: '#C2710C', text: '#fff',     lightBg: '#FEF3C7' },
  blue:     { bg: '#1D4ED8', text: '#fff',     lightBg: '#EFF6FF' },
  offwhite: { bg: '#F5F0E8', text: '#1F2937',  lightBg: '#F5F0E8' },
};

export default function OfferCodeModal({ visible, onClose, restaurant }) {
  const { userId } = useContext(UserContext);
  const { show: showAuth } = useAuthModal();

  const [code, setCode]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);

  const offer = restaurant?.offer;
  const oc    = OFFER_COLORS[offer?.bgColor] || OFFER_COLORS.orange;

  useEffect(() => {
    if (visible) {
      setCode(null);
      setCopied(false);
      fetchCode();
    }
  }, [visible]);

  const fetchCode = async () => {
    if (!userId) {
      showAuth?.();
      onClose();
      return;
    }
    if (!restaurant?._id) { Alert.alert('Error', 'Restaurant info missing.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${NODE_API}/offerCodes/generate`, {
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

          {/* Offer banner strip */}
          <View style={[styles.offerBanner, { backgroundColor: oc.bg }]}>
            <View style={styles.offerLeft}>
              {!!offer?.headline && (
                <Text style={[styles.bannerHeadline, { color: oc.text }]}>{offer.headline}</Text>
              )}
              {!!offer?.description && (
                <Text style={[styles.bannerDesc, { color: oc.text }]}>{offer.description}</Text>
              )}
            </View>
            {!!offer?.imageUrl && (
              <Image source={{ uri: offer.imageUrl }} style={styles.bannerImg} resizeMode="cover" />
            )}
          </View>

          {/* Restaurant name */}
          <Text style={styles.restaurantName}>{restaurant?.name}</Text>
          {!!(offer?.timeStart && offer?.timeEnd) && (
            <Text style={styles.offerMeta}>
              {offer.timeStart} – {offer.timeEnd}
              {offer.validityLabel ? `  ·  ${offer.validityLabel}` : ''}
            </Text>
          )}

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.loadingText}>Generating your code…</Text>
            </View>
          ) : code ? (
            <>
              {/* QR Code */}
              <View style={styles.qrWrap}>
                <QRCode
                  value={code}
                  size={IS_WEB ? 234 : 180}
                  color="#111827"
                  backgroundColor="#fff"
                />
              </View>

              {/* Code text */}
              <Text style={styles.codeLabel}>YOUR REDEMPTION CODE</Text>
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

              {/* NeedCoins */}
              {!!offer?.needCoins && (
                <View style={styles.coinsRow}>
                  <Ionicons name="star" size={IS_WEB ? 21 : 16} color="#F59E0B" />
                  <Text style={styles.coinsText}> {offer.needCoins} NeedCoins will be deducted on redemption</Text>
                </View>
              )}

              {/* Instruction */}
              <View style={styles.instrRow}>
                <Ionicons name="shield-checkmark-outline" size={IS_WEB ? 21 : 16} color="#2563EB" />
                <Text style={styles.instrText}>
                  Show this code or QR to the restaurant when you pay. Each code is one-time use.
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
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: IS_WEB ? 52 : 40, paddingHorizontal: IS_WEB ? 31 : 24,
    maxHeight: '92%',
    maxWidth: IS_WEB ? 960 : undefined,
    width: '100%',
    alignSelf: 'center',
  },
  closeBtn: {
    alignSelf: 'flex-end', marginTop: IS_WEB ? 21 : 16, marginBottom: IS_WEB ? 10 : 8, padding: IS_WEB ? 5 : 4,
  },
  offerBanner: {
    borderRadius: IS_WEB ? 18 : 14, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center',
    minHeight: IS_WEB ? 143 : 110, marginBottom: IS_WEB ? 21 : 16,
  },
  offerLeft: { flex: 1, padding: IS_WEB ? 21 : 16, justifyContent: 'center' },
  bannerHeadline: { fontSize: IS_WEB ? 23 : 18, fontWeight: '900', lineHeight: IS_WEB ? 29 : 22, marginBottom: IS_WEB ? 5 : 4 },
  bannerDesc: { fontSize: IS_WEB ? 16 : 12, fontWeight: '500', opacity: 0.9 },
  bannerImg: { width: IS_WEB ? 143 : 110, height: IS_WEB ? 143 : 110 },
  restaurantName: {
    fontSize: IS_WEB ? 23 : 18, fontWeight: '800', color: '#111', textAlign: 'center', marginBottom: IS_WEB ? 5 : 4,
  },
  offerMeta: {
    fontSize: IS_WEB ? 17 : 13, color: '#6B7280', textAlign: 'center', marginBottom: IS_WEB ? 26 : 20,
  },
  loadingWrap: { alignItems: 'center', paddingVertical: IS_WEB ? 52 : 40 },
  loadingText: { color: '#6B7280', marginTop: IS_WEB ? 16 : 12, fontSize: IS_WEB ? 18 : 14 },
  qrWrap: {
    alignSelf: 'center', padding: IS_WEB ? 21 : 16,
    backgroundColor: '#fff',
    borderRadius: IS_WEB ? 21 : 16,
    borderWidth: 1, borderColor: '#E5E7EB',
    marginBottom: IS_WEB ? 26 : 20,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
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
  coinsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFBEB', borderRadius: IS_WEB ? 13 : 10,
    padding: IS_WEB ? 16 : 12, marginTop: IS_WEB ? 16 : 12, marginBottom: IS_WEB ? 5 : 4,
  },
  coinsText: { fontSize: IS_WEB ? 17 : 13, color: '#92400E', fontWeight: '600', flex: 1 },
  instrRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: IS_WEB ? 10 : 8,
    backgroundColor: '#EFF6FF', borderRadius: IS_WEB ? 13 : 10,
    padding: IS_WEB ? 16 : 12, marginTop: IS_WEB ? 16 : 12,
  },
  instrText: { fontSize: IS_WEB ? 16 : 12, color: '#1E40AF', flex: 1, lineHeight: IS_WEB ? 22 : 17 },
});
