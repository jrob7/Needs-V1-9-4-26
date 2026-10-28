// Screens/RescheduleRequestModal.js
// Lets the requester (or business) suggest a new date/time for a confirmed
// appointment, instead of the old plain confirm-only Alert.
import React, { createElement, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { NODE_API } from '../config';
import { IS_WEB } from '../webLayout';
import { authFetch } from '../server/api';

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (d) => {
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m)} ${ampm}`;
};

export default function RescheduleRequestModal({ appointment, onClose, onSent }) {
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d;
  });
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const resp = await authFetch(`${NODE_API}/appointments/${appointment._id}/rescheduleRequest`, {
        method: 'POST',
        body: JSON.stringify({
          proposedDate: fmtDate(date),
          proposedTime: fmtTime(date),
          note: note.trim() || null,
        }),
      });
      if (!resp.ok) throw new Error('Server error');
      Alert.alert('Request Sent', 'The other party has been notified of your suggested time.');
      onSent?.();
    } catch {
      Alert.alert('Error', "Couldn't send your reschedule request. Please try again.");
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
            <Text style={st.headerTitle}>Request Reschedule</Text>
            <View style={{ width: IS_WEB ? 40 : 30 }} />
          </View>

          <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
            <Text style={st.helper}>Suggest a new date and time. The other party will see your suggestion and confirm it.</Text>

            <Text style={st.label}>New Date</Text>
            {IS_WEB ? (
              createElement('input', {
                type: 'date',
                value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
                onChange: e => {
                  if (!e.target.value) return;
                  const [y, m, d2] = e.target.value.split('-').map(Number);
                  const next = new Date(date); next.setFullYear(y, m - 1, d2); setDate(next);
                },
                style: st.webInput,
              })
            ) : (
              <TouchableOpacity style={st.pickerBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color="#2563EB" />
                <Text style={st.pickerBtnTxt}>{fmtDate(date)}</Text>
              </TouchableOpacity>
            )}
            {!IS_WEB && showDatePicker && (
              <DateTimePicker
                value={date} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(_, sel) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (sel) { const next = new Date(date); next.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate()); setDate(next); }
                }}
              />
            )}

            <Text style={[st.label, { marginTop: 18 }]}>New Time</Text>
            {IS_WEB ? (
              createElement('input', {
                type: 'time',
                value: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
                onChange: e => {
                  if (!e.target.value) return;
                  const [h, m] = e.target.value.split(':').map(Number);
                  const next = new Date(date); next.setHours(h, m, 0, 0); setDate(next);
                },
                style: st.webInput,
              })
            ) : (
              <TouchableOpacity style={st.pickerBtn} onPress={() => setShowTimePicker(true)}>
                <Ionicons name="time-outline" size={16} color="#2563EB" />
                <Text style={st.pickerBtnTxt}>{fmtTime(date)}</Text>
              </TouchableOpacity>
            )}
            {!IS_WEB && showTimePicker && (
              <DateTimePicker
                value={date} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, sel) => {
                  if (Platform.OS === 'android') setShowTimePicker(false);
                  if (sel) { const next = new Date(date); next.setHours(sel.getHours(), sel.getMinutes(), 0, 0); setDate(next); }
                }}
              />
            )}

            <Text style={[st.label, { marginTop: 18 }]}>Note (optional)</Text>
            <TextInput
              style={st.noteInput}
              placeholder="Anything they should know…"
              placeholderTextColor="#94A3B8"
              value={note}
              onChangeText={setNote}
              multiline
            />

            <View style={st.summary}>
              <Ionicons name="checkmark-circle" size={15} color="#10B981" />
              <Text style={st.summaryTxt}>Suggesting {fmtDate(date)} at {fmtTime(date)}</Text>
            </View>
          </ScrollView>

          <View style={st.footer}>
            <TouchableOpacity style={[st.sendBtn, sending && { opacity: 0.6 }]} onPress={handleSend} disabled={sending}>
              <Text style={st.sendBtnTxt}>{sending ? 'Sending…' : 'Send Request'}</Text>
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

  noteInput: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12,
    fontSize: 14, color: '#0F172A', minHeight: 70, textAlignVertical: 'top',
  },

  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FDF4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 20,
  },
  summaryTxt: { fontSize: 13, fontWeight: '700', color: '#15803D' },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  sendBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sendBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
