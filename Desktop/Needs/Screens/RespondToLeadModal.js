// Screens/RespondToLeadModal.js
import React, { createElement, useState, useContext } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { UserContext } from '../server/CurrentUser';

import { NODE_API } from '../config';
import { IS_WEB } from '../webLayout';
import { authFetch } from '../server/api';

// Formats stored in quoteData.appointmentDate — parseable by appointmentReminders
const fmtDate = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
// Formats stored in quoteData.appointmentTime — parseable by appointmentReminders
// Manually formatted to avoid locale-specific characters (e.g. U+202F on iOS)
const fmtTime = (d) => {
  const h    = d.getHours();
  const m    = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

// Web <input type="datetime-local"> value format: "YYYY-MM-DDTHH:MM"
const pad = (n) => String(n).padStart(2, '0');
const toInputValue = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toInputMin = () => toInputValue(new Date());

export default function RespondToLeadModal({ notification, onClose, onSent }) {
  const { userId } = useContext(UserContext);

  // Default to next whole hour so the picker starts at a sensible time
  const defaultDate = (() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  })();

  const [appointmentDate, setAppointmentDate] = useState(defaultDate);
  const [showAndroidPicker, setShowAndroidPicker]   = useState(false);
  const [androidPickerMode, setAndroidPickerMode]   = useState('date'); // 'date' | 'time'
  const [price, setPrice]             = useState('');
  const [showOptional, setShowOptional]             = useState(false);
  const [optionalMessage, setOptionalMessage]       = useState('');
  const [sending, setSending]         = useState(false);

  const handleSend = async () => {
    if (!notification?.fromUserId) {
      Alert.alert('Error', "Can't find who to respond to.");
      return;
    }

    setSending(true);
    const dateStr = fmtDate(appointmentDate);  // "Thu, Jul 16, 2026"
    const timeStr = fmtTime(appointmentDate);  // "8:39 PM"

    try {
      const meRes = await fetch(`${NODE_API}/getUserDetails?userId=${userId}`);
      const me = await meRes.json();
      const businessName = me?.displayName || [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Service Provider';

      const quoteData = {
        // Human-readable display string shown in the quote bubble
        availability:    `${dateStr} at ${timeStr}`,
        // Separate fields used by parseAppointmentDateTime for notification scheduling
        appointmentDate: dateStr,
        appointmentTime: timeStr,
        price:         price.trim() || null,
        note:          showOptional && optionalMessage.trim() ? optionalMessage.trim() : null,
        businessName,
        serviceUserId: userId,
        requesterId:   notification.fromUserId,
        needText:      notification.needText || null,
        quoteStatus:   'pending',
      };

      const resp = await authFetch(`${NODE_API}/sendMessage`, {
        method: 'POST',
        body: JSON.stringify({
          recipientId:    notification.fromUserId,
          text:           `${businessName} sent you a quote`,
          type:           'quote',
          data:           quoteData,
          regardingTitle: notification.needText || null,
        }),
      });
      if (!resp.ok) throw new Error('Server error');
      const data = await resp.json();

      authFetch(`${NODE_API}/markNotificationsRead`, {
        method: 'POST',
        body: JSON.stringify({ notificationIds: [notification._id] }),
      }).catch(() => {});

      onSent?.({
        conversationId: data.conversationId,
        recipientId:    notification.fromUserId,
        recipientName:  notification.fromName,
        regardingTitle: notification.needText || null,
      });
    } catch {
      Alert.alert('Error', "Couldn't send your response. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // ── Android: two-step date then time dialog ───────────────────────────────
  const openAndroidPicker = () => {
    setAndroidPickerMode('date');
    setShowAndroidPicker(true);
  };

  const onAndroidChange = (event, selected) => {
    if (event.type === 'dismissed') {
      setShowAndroidPicker(false);
      return;
    }
    if (selected) {
      if (androidPickerMode === 'date') {
        // Preserve the current time on the newly-selected date
        const merged = new Date(selected);
        merged.setHours(appointmentDate.getHours(), appointmentDate.getMinutes(), 0, 0);
        setAppointmentDate(merged);
        setAndroidPickerMode('time');
      } else {
        const merged = new Date(appointmentDate);
        merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        setAppointmentDate(merged);
        setShowAndroidPicker(false);
      }
    }
  };

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={!IS_WEB}
      >
        <View style={IS_WEB ? { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' } : { flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={IS_WEB ? 31 : 24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Respond to Request</Text>
          <View style={{ width: IS_WEB ? 42 : 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {notification?.needText ? (
            <View style={styles.needBanner}>
              <Text style={styles.needBannerLabel}>Request</Text>
              <Text style={styles.needBannerText}>{notification.needText}</Text>
            </View>
          ) : null}

          {/* ── Appointment date & time ─────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Appointment Date & Time</Text>

          {IS_WEB ? (
            createElement('input', {
              type: 'datetime-local',
              value: toInputValue(appointmentDate),
              min: toInputMin(),
              onChange: (e) => { if (e.target.value) setAppointmentDate(new Date(e.target.value)); },
              style: {
                width: '100%', boxSizing: 'border-box',
                fontSize: 11, fontWeight: '700', color: '#2563EB',
                backgroundColor: '#EFF6FF', border: '1.5px solid #BFDBFE',
                borderRadius: 11, padding: '9px 14px', cursor: 'pointer',
                outline: 'none', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                lineHeight: '1.4', WebkitAppearance: 'none', colorScheme: 'light',
                zoom: 1.5,
              },
            })
          ) : Platform.OS === 'ios' ? (
            // iOS: inline spinner, always visible
            <DateTimePicker
              value={appointmentDate}
              mode="datetime"
              display="spinner"
              minimumDate={new Date()}
              onChange={(_, selected) => { if (selected) setAppointmentDate(selected); }}
              style={styles.iosPicker}
            />
          ) : (
            // Android: show the selected value as a tappable button
            <TouchableOpacity style={styles.androidDateBtn} onPress={openAndroidPicker}>
              <Ionicons name="calendar-outline" size={16} color="#2563EB" />
              <Text style={styles.androidDateBtnTxt}>
                {fmtDate(appointmentDate)} at {fmtTime(appointmentDate)}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#2563EB" />
            </TouchableOpacity>
          )}

          {!IS_WEB && showAndroidPicker && (
            <DateTimePicker
              value={appointmentDate}
              mode={androidPickerMode}
              display="default"
              minimumDate={new Date()}
              onChange={onAndroidChange}
            />
          )}

          <View style={styles.divider} />

          {/* ── Estimated price ─────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Estimated Price</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceDollar}>$</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
            />
          </View>

          <View style={styles.divider} />

          {/* ── Optional message ────────────────────────────────────────── */}
          <TouchableOpacity style={styles.checkboxRow} onPress={() => setShowOptional(v => !v)}>
            <Ionicons name={showOptional ? 'checkbox' : 'square-outline'} size={IS_WEB ? 26 : 20} color="#2563EB" />
            <Text style={styles.checkboxLabel}>Add Optional Message</Text>
          </TouchableOpacity>
          {showOptional && (
            <TextInput
              style={styles.optionalInput}
              placeholder="Type a message..."
              placeholderTextColor="#94A3B8"
              multiline
              value={optionalMessage}
              onChangeText={setOptionalMessage}
            />
          )}

          <View style={styles.divider} />

          <TouchableOpacity
            style={[styles.sendBtn, sending && { opacity: 0.6 }]}
            onPress={handleSend}
            disabled={sending}
          >
            <Text style={styles.sendBtnText}>{sending ? 'Sending...' : 'Send Response'}</Text>
          </TouchableOpacity>
          <View style={{ height: 30 }} />
        </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: IS_WEB ? '#F0F2F5' : '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: IS_WEB ? 21 : 16,
    paddingTop: IS_WEB ? 14 : 54,
    paddingBottom: IS_WEB ? 18 : 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  closeBtn:    { width: IS_WEB ? 42 : 32 },
  headerTitle: { fontSize: IS_WEB ? 21 : 16, fontWeight: '800', color: '#0F172A' },

  body: { paddingHorizontal: IS_WEB ? 26 : 20, paddingTop: IS_WEB ? 26 : 20 },

  needBanner: {
    backgroundColor: '#F8FAFC', borderRadius: IS_WEB ? 16 : 12,
    padding: IS_WEB ? 18 : 14, marginBottom: IS_WEB ? 31 : 24,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  needBannerLabel: { fontSize: IS_WEB ? 14 : 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: IS_WEB ? 5 : 4, letterSpacing: 0.5 },
  needBannerText:  { fontSize: IS_WEB ? 18 : 14, color: '#0F172A', lineHeight: IS_WEB ? 26 : 20 },

  sectionTitle: { fontSize: IS_WEB ? 21 : 16, fontWeight: '800', color: '#0F172A', marginBottom: IS_WEB ? 16 : 12 },

  iosPicker: { width: '100%', marginBottom: 4 },

  androidDateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 10 : 8,
    paddingHorizontal: IS_WEB ? 21 : 16, paddingVertical: IS_WEB ? 18 : 14,
    borderRadius: IS_WEB ? 16 : 12,
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
  },
  androidDateBtnTxt: { flex: 1, fontSize: IS_WEB ? 20 : 15, fontWeight: '700', color: '#2563EB' },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: IS_WEB ? 26 : 20 },

  priceRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: IS_WEB ? 13 : 10,
    paddingHorizontal: IS_WEB ? 18 : 14, backgroundColor: '#F8FAFC',
  },
  priceDollar: { fontSize: IS_WEB ? 21 : 16, fontWeight: '700', color: '#475569', marginRight: IS_WEB ? 5 : 4 },
  priceInput:  { flex: 1, fontSize: IS_WEB ? 21 : 16, color: '#0F172A', paddingVertical: IS_WEB ? 16 : 12 },

  checkboxRow:  { flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 13 : 10 },
  checkboxLabel:{ fontSize: IS_WEB ? 20 : 15, fontWeight: '600', color: '#1E293B' },
  optionalInput: {
    marginTop: IS_WEB ? 16 : 12, minHeight: IS_WEB ? 117 : 90,
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: IS_WEB ? 13 : 10, padding: IS_WEB ? 16 : 12,
    fontSize: IS_WEB ? 18 : 14, color: '#0F172A',
    backgroundColor: '#F8FAFC', textAlignVertical: 'top',
  },

  sendBtn:    { height: IS_WEB ? 68 : 52, borderRadius: IS_WEB ? 16 : 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  sendBtnText:{ fontSize: IS_WEB ? 20 : 15, fontWeight: '800', color: '#fff' },
});
