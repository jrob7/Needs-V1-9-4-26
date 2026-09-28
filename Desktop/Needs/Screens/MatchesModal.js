// Screens/MatchesModal.js
// User-facing swipeable match cards (service quotes).
// Outside card: business + price + date summary.
// Tap card: confirm / reschedule / answer questions.
import React, { createElement, useState, useRef, useCallback, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, FlatList, Alert, Platform, ActivityIndicator,
  Dimensions, KeyboardAvoidingView, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { NODE_API } from '../config';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

const { width: SW } = Dimensions.get('window');
const CARD_W = IS_WEB ? Math.min(420, SW - 48) : SW - 32;

const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (d) => {
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending_business:         { label: 'Awaiting Quote',     bg: '#FEF3C7', fg: '#92400E' },
    business_confirmed:       { label: 'Quote Received',     bg: '#DCFCE7', fg: '#166534' },
    business_edited:          { label: 'Quote Updated',      bg: '#DCFCE7', fg: '#166534' },
    awaiting_user_info:       { label: 'Info Requested',     bg: '#EDE9FE', fg: '#5B21B6' },
    user_info_provided:       { label: 'Answers Sent',       bg: '#E0F2FE', fg: '#075985' },
    user_requested_reschedule:{ label: 'Reschedule Pending', bg: '#FEF3C7', fg: '#92400E' },
    appointment_confirmed:    { label: '✓ Confirmed',        bg: '#DCFCE7', fg: '#14532D' },
    cancelled:                { label: 'Cancelled',          bg: '#FEE2E2', fg: '#991B1B' },
  };
  const cfg = map[status] || { label: status, bg: '#F1F5F9', fg: '#475569' };
  return (
    <View style={[sb.wrap, { backgroundColor: cfg.bg }]}>
      <Text style={[sb.txt, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}
const sb = StyleSheet.create({
  wrap: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7, alignSelf: 'flex-start' },
  txt:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
});

// ── Reschedule picker ─────────────────────────────────────────────────────────
function ReschedulePicker({ quoteId, onDone }) {
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(10,0,0,0); return d; });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [sending, setSending] = useState(false);
  const fmtD = (d) => d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });

  const handleSend = async () => {
    setSending(true);
    try {
      const r = await fetch(`${NODE_API}/userRespondToQuote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, action: 'reschedule', requestedDate: fmtD(date), requestedTime: fmtTime(date) }),
      });
      if (!r.ok) throw new Error();
      onDone?.();
    } catch { Alert.alert('Error', 'Could not submit. Please try again.'); }
    finally { setSending(false); }
  };

  return (
    <View style={rp.wrap}>
      <Text style={rp.title}>Request a Different Time</Text>
      {IS_WEB ? (
        <>
          {createElement('input', {
            type: 'date', style: rp.webInput,
            value: `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`,
            min: (() => { const t = new Date(); t.setDate(t.getDate()+1); return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`; })(),
            onChange: (e) => { if (e.target.value) { const [y,mo,d] = e.target.value.split('-').map(Number); const nd = new Date(date); nd.setFullYear(y,mo-1,d); setDate(nd); } },
          })}
          {createElement('input', {
            type: 'time', style: rp.webInput,
            value: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
            onChange: (e) => { if (e.target.value) { const [h,m] = e.target.value.split(':').map(Number); const nd = new Date(date); nd.setHours(h,m,0,0); setDate(nd); } },
          })}
        </>
      ) : Platform.OS === 'ios' ? (
        <>
          <DateTimePicker value={date} mode="date" display="spinner" minimumDate={new Date()} onChange={(_, s) => { if (s) setDate(s); }} style={{ width: '100%' }} />
          <DateTimePicker value={date} mode="time" display="spinner" onChange={(_, s) => { if (s) setDate(s); }} style={{ width: '100%' }} />
        </>
      ) : (
        <>
          <TouchableOpacity style={rp.btn} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={15} color="#2563EB" />
            <Text style={rp.btnTxt}>{fmtD(date)}</Text>
          </TouchableOpacity>
          {showDatePicker && <DateTimePicker value={date} mode="date" minimumDate={new Date()} onChange={(ev, s) => { setShowDatePicker(false); if (ev.type !== 'dismissed' && s) setDate(s); }} />}
          <TouchableOpacity style={rp.btn} onPress={() => setShowTimePicker(true)}>
            <Ionicons name="time-outline" size={15} color="#2563EB" />
            <Text style={rp.btnTxt}>{fmtTime(date)}</Text>
          </TouchableOpacity>
          {showTimePicker && <DateTimePicker value={date} mode="time" onChange={(ev, s) => { setShowTimePicker(false); if (ev.type !== 'dismissed' && s) setDate(s); }} />}
        </>
      )}
      <TouchableOpacity style={[rp.sendBtn, sending && { opacity: 0.5 }]} onPress={handleSend} disabled={sending}>
        <Text style={rp.sendBtnTxt}>{sending ? 'Sending…' : 'Request This Time'}</Text>
      </TouchableOpacity>
    </View>
  );
}
const rp = StyleSheet.create({
  wrap:      { marginTop: 16, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  title:     { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  btn:       { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#EFF6FF', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  btnTxt:    { flex: 1, fontSize: 14, fontWeight: '700', color: '#2563EB' },
  sendBtn:   { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  sendBtnTxt:{ fontSize: 14, fontWeight: '800', color: '#fff' },
  webInput:  { fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', marginBottom: 8, width: '100%' },
});

// ── Answer form ───────────────────────────────────────────────────────────────
function AnswerForm({ quote, onDone }) {
  const questions = quote.infoRequest?.questions || [];
  const [answers, setAnswers] = useState(questions.map(() => ''));
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (answers.some(a => !a.trim())) { Alert.alert('Answer all questions', 'Please fill in all answers.'); return; }
    setSending(true);
    try {
      const r = await fetch(`${NODE_API}/userRespondToQuote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote._id, action: 'provide_info', answers }),
      });
      if (!r.ok) throw new Error();
      onDone?.();
    } catch { Alert.alert('Error', 'Could not send. Please try again.'); }
    finally { setSending(false); }
  };

  return (
    <View style={af.wrap}>
      <Text style={af.title}>Questions from the Business</Text>
      {questions.map((q, i) => (
        <View key={i} style={af.qBlock}>
          <Text style={af.qTxt}>{i+1}. {q}</Text>
          <TextInput style={af.input} placeholder="Your answer…" placeholderTextColor="#94A3B8"
            value={answers[i]} onChangeText={v => setAnswers(prev => prev.map((a, idx) => idx === i ? v : a))} multiline />
        </View>
      ))}
      <TouchableOpacity style={[af.sendBtn, sending && { opacity: 0.5 }]} onPress={handleSend} disabled={sending}>
        <Text style={af.sendBtnTxt}>{sending ? 'Sending…' : 'Send Answers'}</Text>
      </TouchableOpacity>
    </View>
  );
}
const af = StyleSheet.create({
  wrap:     { marginTop: 14, backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#DDD6FE' },
  title:    { fontSize: 13, fontWeight: '800', color: '#5B21B6', marginBottom: 10 },
  qBlock:   { marginBottom: 12 },
  qTxt:     { fontSize: 13, color: '#3B0764', fontWeight: '600', marginBottom: 6, lineHeight: 18 },
  input:    { backgroundColor: '#fff', borderRadius: 9, borderWidth: 1, borderColor: '#DDD6FE', padding: 11, fontSize: 14, color: '#0F172A', textAlignVertical: 'top', minHeight: 64 },
  sendBtn:  { backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  sendBtnTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

// ── Match detail modal (opens when user taps a summary card) ─────────────────
function MatchDetailModal({ quote, onClose, onRefresh }) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [confirmSending, setConfirmSending] = useState(false);
  const { status } = quote;

  const handleConfirm = async () => {
    setConfirmSending(true);
    try {
      const r = await fetch(`${NODE_API}/userRespondToQuote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote._id, action: 'confirm' }),
      });
      if (!r.ok) throw new Error();
      Alert.alert('Appointment Confirmed!', 'Your appointment is booked. Check the Scheduler tab for details.');
      onRefresh?.();
      onClose();
    } catch { Alert.alert('Error', 'Could not confirm. Please try again.'); }
    finally { setConfirmSending(false); }
  };

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        {IS_WEB && <View style={{ height: WEB_HEADER_HEIGHT }} />}

        {/* Header */}
        <View style={dm.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Ionicons name="chevron-down" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={dm.headerTitle}>{quote.serviceName || 'Match Details'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={dm.body} keyboardShouldPersistTaps="handled">
          <StatusBadge status={status} />

          {/* ── Quote received (confirm or reschedule) ───────────── */}
          {(status === 'business_confirmed' || status === 'business_edited') && (
            <>
              <View style={dm.quoteCard}>
                <View style={dm.qRow}>
                  <Ionicons name="cash-outline" size={18} color="#10B981" />
                  <Text style={dm.qLabel}>Quoted Price</Text>
                  <Text style={dm.qValue}>{quote.confirmedPrice ? `$${quote.confirmedPrice}` : '—'}</Text>
                </View>
                <View style={dm.qRow}>
                  <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                  <Text style={dm.qLabel}>Date</Text>
                  <Text style={dm.qValue}>{quote.proposedDate || '—'}</Text>
                </View>
                <View style={dm.qRow}>
                  <Ionicons name="time-outline" size={18} color="#2563EB" />
                  <Text style={dm.qLabel}>Time</Text>
                  <Text style={dm.qValue}>{quote.proposedTime || '—'}</Text>
                </View>
                {quote.businessNote ? (
                  <View style={dm.noteBox}>
                    <Text style={dm.noteLabel}>Note from Business</Text>
                    <Text style={dm.noteTxt}>{quote.businessNote}</Text>
                  </View>
                ) : null}
              </View>

              {!showReschedule ? (
                <View style={dm.actionCol}>
                  <TouchableOpacity
                    style={[dm.btnPrimary, confirmSending && { opacity: 0.5 }]}
                    onPress={handleConfirm} disabled={confirmSending}
                  >
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={dm.btnPrimaryTxt}>{confirmSending ? 'Confirming…' : 'Confirm Appointment'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={dm.btnSecondary} onPress={() => setShowReschedule(true)}>
                    <Ionicons name="calendar-outline" size={16} color="#2563EB" />
                    <Text style={dm.btnSecondaryTxt}>Request Different Time</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ReschedulePicker quoteId={quote._id} onDone={() => { setShowReschedule(false); onRefresh?.(); onClose(); }} />
              )}
            </>
          )}

          {/* ── Business asked questions ─────────────────────────── */}
          {status === 'awaiting_user_info' && (
            <AnswerForm quote={quote} onDone={() => { onRefresh?.(); onClose(); }} />
          )}

          {/* ── Answers sent ─────────────────────────────────────── */}
          {status === 'user_info_provided' && (
            <View style={dm.infoBox}>
              <Ionicons name="checkmark-done-circle-outline" size={36} color="#2563EB" />
              <Text style={dm.infoTitle}>Answers Sent</Text>
              <Text style={dm.infoSub}>The business will review and send an updated quote.</Text>
            </View>
          )}

          {/* ── Reschedule pending ───────────────────────────────── */}
          {status === 'user_requested_reschedule' && (
            <View style={dm.infoBox}>
              <Ionicons name="time-outline" size={36} color="#F59E0B" />
              <Text style={dm.infoTitle}>Reschedule Requested</Text>
              <Text style={dm.infoSub}>Waiting for the business to confirm your preferred time.</Text>
              {quote.userRequestedDate && (
                <Text style={{ marginTop: 8, fontSize: 14, fontWeight: '700', color: '#92400E' }}>
                  {quote.userRequestedDate}{quote.userRequestedTime ? ` at ${quote.userRequestedTime}` : ''}
                </Text>
              )}
            </View>
          )}

          {/* ── Confirmed ────────────────────────────────────────── */}
          {status === 'appointment_confirmed' && (
            <View style={[dm.infoBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
              <Ionicons name="checkmark-circle" size={44} color="#16A34A" />
              <Text style={[dm.infoTitle, { color: '#15803D' }]}>Appointment Confirmed!</Text>
              {quote.proposedDate && <Text style={[dm.infoSub, { color: '#166534', fontWeight: '700' }]}>{quote.proposedDate}{quote.proposedTime ? ` at ${quote.proposedTime}` : ''}</Text>}
              {quote.confirmedPrice && <Text style={[dm.infoSub, { color: '#166534' }]}>Price: ${quote.confirmedPrice}</Text>}
            </View>
          )}

          {/* ── Pending ──────────────────────────────────────────── */}
          {status === 'pending_business' && (
            <View style={[dm.infoBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
              <Ionicons name="hourglass-outline" size={36} color="#D97706" />
              <Text style={[dm.infoTitle, { color: '#92400E' }]}>Awaiting Business Response</Text>
              <Text style={dm.infoSub}>The business has been notified and is preparing a quote.</Text>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const dm = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  body:      { padding: 20 },
  quoteCard: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#E2E8F0', gap: 10 },
  qRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qLabel:    { flex: 1, fontSize: 13, color: '#475569', fontWeight: '600' },
  qValue:    { fontSize: 15, color: '#0F172A', fontWeight: '800' },
  noteBox:   { backgroundColor: '#FFF7ED', borderRadius: 10, padding: 11, borderWidth: 1, borderColor: '#FED7AA', marginTop: 4 },
  noteLabel: { fontSize: 11, fontWeight: '800', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  noteTxt:   { fontSize: 13, color: '#78350F', lineHeight: 18 },
  actionCol: { gap: 10, marginTop: 18 },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 15,
  },
  btnPrimaryTxt:   { fontSize: 15, fontWeight: '800', color: '#fff' },
  btnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 13,
    borderWidth: 1.5, borderColor: '#BFDBFE',
  },
  btnSecondaryTxt: { fontSize: 14, fontWeight: '700', color: '#2563EB' },
  infoBox:   { alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 14, padding: 28, gap: 8, marginTop: 20, borderWidth: 1, borderColor: '#BFDBFE' },
  infoTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  infoSub:   { fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 18 },
});

// ── Match summary card (shown while swiping) ──────────────────────────────────
function MatchSummaryCard({ quote, onTap }) {
  const isPending   = quote.status === 'pending_business';
  const isConfirmed = quote.status === 'appointment_confirmed';
  const isCancelled = quote.status === 'cancelled';
  const hasQuote    = ['business_confirmed','business_edited','user_requested_reschedule'].includes(quote.status);
  const needsInfo   = quote.status === 'awaiting_user_info';
  const infoSent    = quote.status === 'user_info_provided';

  return (
    <TouchableOpacity onPress={() => !isPending && onTap(quote)} activeOpacity={isPending ? 1 : 0.88} style={ms.card}>
      {/* Business header */}
      <View style={ms.businessRow}>
        <View style={ms.bizIcon}>
          <Ionicons name="briefcase-outline" size={20} color="#2563EB" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ms.bizName} numberOfLines={1}>{quote.serviceName || 'Matched Service'}</Text>
          {quote.serviceCategory ? <Text style={ms.bizCat} numberOfLines={1}>{quote.serviceCategory}</Text> : null}
        </View>
        <StatusBadge status={quote.status} />
      </View>

      {/* Pending */}
      {isPending && (
        <View style={ms.pendingRow}>
          <Ionicons name="hourglass-outline" size={18} color="#D97706" />
          <Text style={ms.pendingTxt}>Waiting for the business to respond…</Text>
        </View>
      )}

      {/* Quote received — show price + date/time prominently */}
      {hasQuote && (
        <View style={ms.quoteBlock}>
          {quote.confirmedPrice ? (
            <Text style={ms.priceText}>${quote.confirmedPrice}</Text>
          ) : null}
          {(quote.proposedDate || quote.proposedTime) ? (
            <View style={ms.dateRow}>
              <Ionicons name="calendar-outline" size={14} color="#2563EB" />
              <Text style={ms.dateTxt}>{quote.proposedDate}{quote.proposedTime ? ` · ${quote.proposedTime}` : ''}</Text>
            </View>
          ) : null}
          {quote.businessNote ? <Text style={ms.noteTxt} numberOfLines={2}>"{quote.businessNote}"</Text> : null}
        </View>
      )}

      {/* Needs info */}
      {needsInfo && (
        <View style={[ms.pendingRow, { backgroundColor: '#F5F3FF', borderRadius: 8, padding: 10 }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color="#7C3AED" />
          <Text style={[ms.pendingTxt, { color: '#5B21B6' }]}>Business has questions — tap to answer</Text>
        </View>
      )}

      {/* Info sent */}
      {infoSent && (
        <View style={ms.pendingRow}>
          <Ionicons name="checkmark-done-circle-outline" size={16} color="#2563EB" />
          <Text style={ms.pendingTxt}>Answers sent — awaiting updated quote</Text>
        </View>
      )}

      {/* Confirmed */}
      {isConfirmed && (
        <View style={[ms.quoteBlock, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#15803D' }}>Confirmed</Text>
          </View>
          {quote.proposedDate && <Text style={[ms.dateTxt, { color: '#166534' }]}>{quote.proposedDate}{quote.proposedTime ? ` · ${quote.proposedTime}` : ''}</Text>}
        </View>
      )}

      {/* Cancelled */}
      {isCancelled && (
        <View style={[ms.pendingRow, { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10 }]}>
          <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
          <Text style={[ms.pendingTxt, { color: '#B91C1C' }]}>Cancelled</Text>
        </View>
      )}

      {/* Tap hint for actionable statuses */}
      {!isPending && !isConfirmed && !isCancelled && (
        <View style={ms.tapHint}>
          <Text style={ms.tapHintTxt}>Tap to view details and respond →</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const ms = StyleSheet.create({
  card: {
    width: CARD_W, backgroundColor: '#fff', borderRadius: 18, padding: IS_WEB ? 22 : 18,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  businessRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  bizIcon:     { width: 38, height: 38, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BFDBFE' },
  bizName:     { fontSize: IS_WEB ? 16 : 14, fontWeight: '800', color: '#0F172A' },
  bizCat:      { fontSize: 11, color: '#64748B', marginTop: 1 },
  pendingRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  pendingTxt:  { flex: 1, fontSize: 13, color: '#78350F', lineHeight: 18 },
  quoteBlock:  {
    marginTop: 12, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E2E8F0', gap: 6,
  },
  priceText:   { fontSize: IS_WEB ? 28 : 24, fontWeight: '900', color: '#0F172A' },
  dateRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateTxt:     { fontSize: 13, color: '#2563EB', fontWeight: '600' },
  noteTxt:     { fontSize: 12, color: '#64748B', fontStyle: 'italic', lineHeight: 17 },
  tapHint:     { marginTop: 14, alignItems: 'flex-end' },
  tapHintTxt:  { fontSize: 12, color: '#2563EB', fontWeight: '600' },
});

// ── Main modal ────────────────────────────────────────────────────────────────
export default function MatchesModal({ needId, quotes: initialQuotes, onClose, onRefresh }) {
  const [quotes, setQuotes]       = useState(initialQuotes || []);
  const [page, setPage]           = useState(0);
  const [loading, setLoading]     = useState(false);
  const [detailQuote, setDetailQuote] = useState(null);
  const listRef = useRef(null);

  const handleRefresh = useCallback(async () => {
    if (!needId) return;
    setLoading(true);
    try {
      const r = await fetch(`${NODE_API}/serviceQuotes?needId=${needId}`);
      const d = await r.json();
      if (Array.isArray(d)) setQuotes(d);
    } catch { /* silent */ }
    finally { setLoading(false); }
    onRefresh?.();
  }, [needId, onRefresh]);

  useEffect(() => { if (initialQuotes) setQuotes(initialQuotes); }, [initialQuotes]);

  const handleScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    setPage(Math.round(x / (CARD_W + 20)));
  };

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView style={mm.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={!IS_WEB}>
        <View style={IS_WEB ? mm.webWrap : { flex: 1 }}>
          <SafeAreaView style={{ flex: 1 }}>
            {IS_WEB && <View style={{ height: WEB_HEADER_HEIGHT }} />}

            {/* Header */}
            <View style={mm.header}>
              <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
                <Ionicons name="chevron-down" size={IS_WEB ? 28 : 22} color="#0F172A" />
              </TouchableOpacity>
              <Text style={mm.headerTitle}>Your Matches</Text>
              {loading
                ? <ActivityIndicator size="small" color="#2563EB" style={{ width: 40 }} />
                : <View style={{ width: 40 }} />}
            </View>

            {quotes.length === 0 ? (
              <View style={mm.emptyWrap}>
                <Ionicons name="search-circle-outline" size={64} color="#CBD5E1" />
                <Text style={mm.emptyTitle}>Finding Matches</Text>
                <Text style={mm.emptySub}>Businesses are reviewing your request. Check back soon.</Text>
              </View>
            ) : (
              <>
                {/* Swipeable cards */}
                <FlatList
                  ref={listRef}
                  data={quotes}
                  keyExtractor={q => q._id}
                  horizontal
                  pagingEnabled={false}
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={CARD_W + 20}
                  snapToAlignment="start"
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  contentContainerStyle={mm.listContent}
                  renderItem={({ item }) => (
                    <MatchSummaryCard
                      quote={item}
                      onTap={q => setDetailQuote(q)}
                    />
                  )}
                />

                {/* Page dots */}
                {quotes.length > 1 && (
                  <View style={mm.dotsRow}>
                    {quotes.map((_, i) => (
                      <TouchableOpacity key={i}
                        onPress={() => listRef.current?.scrollToIndex({ index: i, animated: true })}
                        style={[mm.dot, i === page && mm.dotActive]}
                      />
                    ))}
                  </View>
                )}

                <Text style={mm.swipeHint}>
                  {quotes.length > 1 ? `${page + 1} of ${quotes.length} matches — swipe to see all` : '1 match'}
                </Text>
              </>
            )}
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>

      {/* Detail modal — opens when user taps a card */}
      {detailQuote && (
        <MatchDetailModal
          quote={detailQuote}
          onClose={() => setDetailQuote(null)}
          onRefresh={() => { setDetailQuote(null); handleRefresh(); }}
        />
      )}
    </Modal>
  );
}

const mm = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: IS_WEB ? '#F0F2F5' : '#F8FAFC' },
  webWrap: { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' },
  header:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: IS_WEB ? 20 : 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#fff',
  },
  headerTitle: { fontSize: IS_WEB ? 20 : 17, fontWeight: '800', color: '#0F172A' },
  listContent: { paddingHorizontal: 16, paddingVertical: 24, gap: 20, alignItems: 'flex-start' },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 10 },
  dot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: '#CBD5E1' },
  dotActive: { width: 10, height: 10, backgroundColor: '#2563EB' },
  swipeHint: { textAlign: 'center', fontSize: 12, color: '#94A3B8', paddingBottom: IS_WEB ? 10 : 18 },
  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  emptySub:   { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
});
