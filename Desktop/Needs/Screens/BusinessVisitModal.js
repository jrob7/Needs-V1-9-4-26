// Screens/BusinessVisitModal.js
// Business profile → Rewards → Visit Rewards → redeem check-in codes and view history.
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity,
  TextInput, Alert, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

import { NODE_API } from '../config';
const NEEDCOIN_IMG = require('../assets/NeedCoin.png');
const VISIT_COINS = 10;

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// ── Confirm popup ─────────────────────────────────────────────────────────────
function ConfirmPopup({ visible, code, onConfirm, onCancel, loading }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmBox}>
          <Image source={NEEDCOIN_IMG} style={styles.confirmCoin} resizeMode="contain" />
          <Text style={styles.confirmTitle}>Confirm Visit Check-In</Text>
          <Text style={styles.confirmSub}>Code: <Text style={styles.confirmCode}>{code}</Text></Text>
          <View style={styles.confirmCoins}>
            <Ionicons name="star" size={14} color="#F59E0B" />
            <Text style={styles.confirmCoinsText}> {VISIT_COINS} NeedCoins will be awarded to the customer</Text>
          </View>
          <View style={styles.confirmBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.confirmBtnText}>Confirm</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function BusinessVisitModal({ visible, onClose, restaurantDoc }) {
  const [tab, setTab]           = useState('redeem');
  const [codeInput, setCode]    = useState('');
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirming, setConfirming]         = useState(false);
  const [history, setHistory]   = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const scannedRef = useRef(false);

  const restaurantId = restaurantDoc?._id;

  useEffect(() => {
    if (visible) {
      setCode('');
      setScanning(false);
      setConfirmVisible(false);
      scannedRef.current = false;
      if (tab === 'history') loadHistory();
    }
  }, [visible]);

  useEffect(() => {
    if (visible && tab === 'history') loadHistory();
  }, [tab]);

  const loadHistory = async () => {
    if (!restaurantId) return;
    setHistLoading(true);
    try {
      const res = await fetch(`${NODE_API}/visitCodes/history?restaurantId=${restaurantId}`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch { setHistory([]); }
    finally { setHistLoading(false); }
  };

  const handleScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera required', 'Please allow camera access to scan QR codes.');
        return;
      }
    }
    scannedRef.current = false;
    setScanning(true);
  };

  const onBarcodeScanned = ({ data }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanning(false);
    const raw = (data || '').trim().toUpperCase();
    if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(raw)) {
      setCode(raw);
      setConfirmVisible(true);
    } else {
      Alert.alert('Invalid QR', 'This QR code does not match a visit code format.', [
        { text: 'Try again', onPress: () => { scannedRef.current = false; setScanning(true); } },
        { text: 'Cancel' },
      ]);
    }
  };

  const handleSubmitCode = () => {
    const clean = codeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(clean)) {
      Alert.alert('Invalid code', 'Please enter a code in the format XXXX-XXXX.');
      return;
    }
    setCode(clean);
    setConfirmVisible(true);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const clean = codeInput.trim().toUpperCase();
      const res = await fetch(`${NODE_API}/visitCodes/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean, restaurantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Check-in failed', data.error || 'Could not redeem this code.');
        setConfirmVisible(false);
        return;
      }
      setConfirmVisible(false);
      setCode('');
      Alert.alert(
        '✅ Check-In Confirmed!',
        `${data.needCoins} NeedCoins awarded to the customer.`,
        [{ text: 'Done', onPress: () => { setTab('history'); loadHistory(); } }]
      );
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Visit Rewards</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Image source={NEEDCOIN_IMG} style={styles.infoCardCoin} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoCardTitle}>Visit Check-In</Text>
            <Text style={styles.infoCardSub}>
              Scan or enter a customer's visit code to award them {VISIT_COINS} NeedCoins for their visit.
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {['redeem', 'history'].map(t => (
            <TouchableOpacity
              key={t} style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'redeem' ? 'Redeem' : 'History'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'redeem' ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.redeemContent}>
              {scanning ? (
                <View style={styles.cameraWrap}>
                  <CameraView
                    style={styles.camera}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={onBarcodeScanned}
                  />
                  <View style={styles.cameraCrosshair} />
                  <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setScanning(false)}>
                    <Ionicons name="close" size={20} color="#fff" />
                    <Text style={styles.cancelScanText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.redeemInstruction}>
                    Enter the customer's visit code manually or scan their QR code.
                  </Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.codeInput}
                      value={codeInput}
                      onChangeText={v => setCode(v.toUpperCase())}
                      placeholder="e.g.  M7QK-9RXT"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={9}
                    />
                    <TouchableOpacity style={styles.submitCodeBtn} onPress={handleSubmitCode}>
                      <Text style={styles.submitCodeText}>Redeem Code</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.orRow}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>or</Text>
                    <View style={styles.orLine} />
                  </View>
                  <TouchableOpacity style={styles.scanBtn} onPress={handleScan}>
                    <Ionicons name="qr-code-outline" size={22} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.scanBtnText}>Scan Customer QR Code</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.histContent}>
            {histLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color="#15803D" />
            ) : history.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="footsteps-outline" size={44} color="#D1D5DB" />
                <Text style={styles.emptyText}>No check-ins yet</Text>
              </View>
            ) : (
              history.map((r, i) => (
                <View key={i} style={styles.histRow}>
                  <View style={styles.histIconWrap}>
                    <Ionicons name="checkmark-circle" size={18} color="#15803D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histCode}>{r.code}</Text>
                    <Text style={styles.histLabel}>Visit check-in</Text>
                    <Text style={styles.histDate}>{fmtDate(r.redeemedAt)}</Text>
                  </View>
                  <View style={styles.histCoins}>
                    <Ionicons name="star" size={12} color="#F59E0B" />
                    <Text style={styles.histCoinsText}>+{r.needCoins}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>

      <ConfirmPopup
        visible={confirmVisible}
        code={codeInput.trim().toUpperCase()}
        onConfirm={handleConfirm}
        onCancel={() => { setConfirmVisible(false); scannedRef.current = false; }}
        loading={confirming}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },

  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    margin: 16, backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16,
  },
  infoCardCoin:  { width: 52, height: 52 },
  infoCardTitle: { fontSize: 16, fontWeight: '800', color: '#14532D', marginBottom: 4 },
  infoCardSub:   { fontSize: 12, color: '#166534', lineHeight: 17 },

  tabRow: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 4,
    backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4,
  },
  tab:           { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabActive:     { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tabText:       { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#111', fontWeight: '700' },

  redeemContent:     { padding: 16 },
  redeemInstruction: { fontSize: 14, color: '#4B5563', marginBottom: 20, lineHeight: 20 },
  inputRow:          { flexDirection: 'row', gap: 10, marginBottom: 16 },
  codeInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 18, fontWeight: '700', letterSpacing: 3, color: '#111',
  },
  submitCodeBtn: {
    backgroundColor: '#15803D', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center',
  },
  submitCodeText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  orRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  orLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  orText: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  scanBtn: {
    backgroundColor: '#1E293B', borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16,
  },
  scanBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  cameraWrap:     { borderRadius: 16, overflow: 'hidden', height: 320, position: 'relative' },
  camera:         { flex: 1 },
  cameraCrosshair: {
    position: 'absolute', top: '50%', left: '50%',
    width: 160, height: 160, marginTop: -80, marginLeft: -80,
    borderWidth: 2.5, borderColor: '#fff', borderRadius: 16,
  },
  cancelScanBtn: {
    position: 'absolute', bottom: 16, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 9,
  },
  cancelScanText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  histContent: { padding: 16 },
  emptyWrap:   { alignItems: 'center', paddingTop: 60 },
  emptyText:   { color: '#9CA3AF', fontSize: 15, marginTop: 12 },
  histRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  histIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#DCFCE7',
  },
  histCode:      { fontSize: 15, fontWeight: '800', letterSpacing: 2, color: '#111', marginBottom: 2 },
  histLabel:     { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  histDate:      { fontSize: 11, color: '#9CA3AF' },
  histCoins:     { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFFBEB' },
  histCoinsText: { fontSize: 13, fontWeight: '700', color: '#92400E' },

  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  confirmBox:     { backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '84%', alignItems: 'center' },
  confirmCoin:    { width: 64, height: 64, marginBottom: 14 },
  confirmTitle:   { fontSize: 19, fontWeight: '900', color: '#111', marginBottom: 6 },
  confirmSub:     { fontSize: 14, color: '#6B7280', marginBottom: 4 },
  confirmCode:    { fontWeight: '900', letterSpacing: 2, color: '#111' },
  confirmCoins: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFBEB', borderRadius: 10,
    padding: 10, marginBottom: 24,
  },
  confirmCoinsText: { fontSize: 13, color: '#92400E', fontWeight: '600', flex: 1 },
  confirmBtns:    { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn:      { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelBtnText:  { fontSize: 15, fontWeight: '700', color: '#374151' },
  confirmBtn:     { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#15803D' },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
