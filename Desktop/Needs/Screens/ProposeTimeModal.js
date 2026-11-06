// Screens/ProposeTimeModal.js
// Business-facing modal for proposing up to 3 candidate meeting times to a
// guest lead that already accepted a price-only quote by email (no app
// account, so this gets emailed to them with a one-click confirm link per
// option rather than shown in-app). Offering a few options instead of one
// fixed time cuts down the back-and-forth when the first slot doesn't work.
import React, { createElement, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { NODE_API } from '../config';
import { IS_WEB } from '../webLayout';
import { authFetch } from '../server/api';

const MAX_SLOTS = 3;

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (d) => {
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m)} ${ampm}`;
};
const defaultSlot = (daysOut) => {
  const d = new Date(); d.setDate(d.getDate() + daysOut); d.setHours(10, 0, 0, 0); return d;
};

export default function ProposeTimeModal({ notification, onClose, onSent }) {
  const [slots, setSlots] = useState([defaultSlot(1)]);
  const [sending, setSending] = useState(false);
  // Which slot's native picker is open, and whether it's the date or time
  // half - only one slot's picker is ever open at a time, so this is
  // simpler than tracking visibility per slot.
  const [activePicker, setActivePicker] = useState(null); // { index, mode: 'date'|'time' }

  const updateSlot = (index, next) => {
    setSlots(prev => prev.map((s, i) => (i === index ? next : s)));
  };
  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    setSlots(prev => [...prev, defaultSlot(prev.length + 1)]);
  };
  const removeSlot = (index) => {
    setSlots(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    const quoteId = notification?.quoteId;
    if (!quoteId) { Alert.alert('Error', 'Quote ID missing.'); return; }
    setSending(true);
    try {
      const options = slots.map(d => ({ date: fmtDate(d), time: fmtTime(d) }));
      const resp = await authFetch(`${NODE_API}/proposeAppointmentTime`, {
        method: 'POST',
        body: JSON.stringify({ quoteId, options }),
      });
      if (!resp.ok) throw new Error('Server error');
      Alert.alert(
        slots.length > 1 ? 'Times Proposed' : 'Time Proposed',
        slots.length > 1
          ? `The customer has been emailed ${slots.length} times to choose from.`
          : 'The customer has been emailed your proposed time to confirm.'
      );
      onSent?.({ options });
    } catch {
      Alert.alert('Error', "Couldn't send your proposed time. Please try again.");
    } finally { setSending(false); }
  };

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={!IS_WEB}>
        <View style={IS_WEB ? { maxWidth: 560, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' } : { flex: 1, backgroundColor: '#fff' }}>

          <View style={st.header}>
            <TouchableOpacity onPress={onClose} style={st.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={IS_WEB ? 28 : 22} color="#0F172A" />
            </TouchableOpacity>
            <Text style={st.headerTitle}>Propose Times</Text>
            <View style={{ width: IS_WEB ? 40 : 30 }} />
          </View>

          <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
            <Text style={st.helper}>
              This customer accepted your price but isn't on the app, so pick up to {MAX_SLOTS} times that
              work for you — we'll email them all three to choose from, each with its own one-click confirm link.
            </Text>

            {slots.map((date, index) => (
              <View key={index} style={st.slotCard}>
                <View style={st.slotHeader}>
                  <Text style={st.slotLabel}>Option {index + 1}</Text>
                  {slots.length > 1 && (
                    <TouchableOpacity onPress={() => removeSlot(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={st.label}>Date</Text>
                {IS_WEB ? (
                  createElement('input', {
                    type: 'date',
                    value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
                    onChange: e => {
                      if (!e.target.value) return;
                      const [y, m, d2] = e.target.value.split('-').map(Number);
                      const next = new Date(date); next.setFullYear(y, m - 1, d2); updateSlot(index, next);
                    },
                    style: st.webInput,
                  })
                ) : (
                  <TouchableOpacity style={st.pickerBtn} onPress={() => setActivePicker({ index, mode: 'date' })}>
                    <Ionicons name="calendar-outline" size={16} color="#2563EB" />
                    <Text style={st.pickerBtnTxt}>{fmtDate(date)}</Text>
                  </TouchableOpacity>
                )}
                {!IS_WEB && activePicker?.index === index && activePicker.mode === 'date' && (
                  <DateTimePicker
                    value={date} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={new Date()}
                    onChange={(_, sel) => {
                      if (Platform.OS === 'android') setActivePicker(null);
                      if (sel) { const next = new Date(date); next.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate()); updateSlot(index, next); }
                    }}
                  />
                )}

                <Text style={[st.label, { marginTop: 14 }]}>Time</Text>
                {IS_WEB ? (
                  createElement('input', {
                    type: 'time',
                    value: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
                    onChange: e => {
                      if (!e.target.value) return;
                      const [h, m] = e.target.value.split(':').map(Number);
                      const next = new Date(date); next.setHours(h, m, 0, 0); updateSlot(index, next);
                    },
                    style: st.webInput,
                  })
                ) : (
                  <TouchableOpacity style={st.pickerBtn} onPress={() => setActivePicker({ index, mode: 'time' })}>
                    <Ionicons name="time-outline" size={16} color="#2563EB" />
                    <Text style={st.pickerBtnTxt}>{fmtTime(date)}</Text>
                  </TouchableOpacity>
                )}
                {!IS_WEB && activePicker?.index === index && activePicker.mode === 'time' && (
                  <DateTimePicker
                    value={date} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, sel) => {
                      if (Platform.OS === 'android') setActivePicker(null);
                      if (sel) { const next = new Date(date); next.setHours(sel.getHours(), sel.getMinutes(), 0, 0); updateSlot(index, next); }
                    }}
                  />
                )}
              </View>
            ))}

            {slots.length < MAX_SLOTS && (
              <TouchableOpacity style={st.addBtn} onPress={addSlot}>
                <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
                <Text style={st.addBtnTxt}>Add another time</Text>
              </TouchableOpacity>
            )}

            <View style={st.summary}>
              <Ionicons name="checkmark-circle" size={15} color="#10B981" />
              <Text style={st.summaryTxt}>
                Proposing {slots.length} time{slots.length > 1 ? 's' : ''}
              </Text>
            </View>
          </ScrollView>

          <View style={st.footer}>
            <TouchableOpacity style={[st.sendBtn, sending && { opacity: 0.6 }]} onPress={handleSend} disabled={sending}>
              <Text style={st.sendBtnTxt}>{sending ? 'Sending…' : `Email ${slots.length > 1 ? 'These Times' : 'This Time'} to Customer`}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: IS_WEB ? '#F0F2F5' : '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: IS_WEB ? 14 : 54, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: IS_WEB ? 20 : 16, fontWeight: '800', color: '#0F172A' },

  body: { padding: 16, paddingBottom: 32 },
  helper: { fontSize: IS_WEB ? 15 : 13, color: '#64748B', marginBottom: 18, lineHeight: 20 },
  label: { fontSize: IS_WEB ? 14 : 12, fontWeight: '800', color: '#334155', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },

  slotCard: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 14, marginBottom: 12 },
  slotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  slotLabel: { fontSize: 12, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 },

  webInput: {
    fontSize: 15, fontWeight: '700', color: '#2563EB',
    backgroundColor: '#EFF6FF', border: '1.5px solid #BFDBFE',
    borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
    outline: 'none', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    WebkitAppearance: 'none', colorScheme: 'light',
  },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#BFDBFE',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, alignSelf: 'flex-start',
  },
  pickerBtnTxt: { fontSize: 15, fontWeight: '700', color: '#2563EB' },

  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 6 },
  addBtnTxt: { fontSize: 13, fontWeight: '700', color: '#2563EB' },

  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FDF4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10,
  },
  summaryTxt: { fontSize: 13, fontWeight: '700', color: '#15803D' },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  sendBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sendBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
