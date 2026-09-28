// Screens/MatchesModal.js
// User-facing swipeable card view for their matched service quotes.
// Full state-based UI per card — no messages involved.
import React, { createElement, useState, useRef, useCallback, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, FlatList, Alert, Platform, ActivityIndicator,
  Dimensions, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { NODE_API } from '../config';
import { IS_WEB } from '../webLayout';

const { width: SW } = Dimensions.get('window');
const CARD_W = IS_WEB ? Math.min(400, SW - 48) : SW - 40;

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (d) => {
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
};

// ── Pulse animation ───────────────────────────────────────────────────────────
function PulseText({ text, style }) {
  return <Text style={[{ color: '#F59E0B', fontWeight: '800' }, style]}>{text}</Text>;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending_business:        { label: 'Awaiting Response', bg: '#FEF3C7', fg: '#92400E' },
    business_confirmed:      { label: 'Quote Received',   bg: '#DCFCE7', fg: '#166534' },
    business_edited:         { label: 'Quote Updated',    bg: '#DCFCE7', fg: '#166534' },
    awaiting_user_info:      { label: 'Info Requested',   bg: '#EDE9FE', fg: '#5B21B6' },
    user_info_provided:      { label: 'Answers Sent',     bg: '#E0F2FE', fg: '#075985' },
    user_requested_reschedule:{ label: 'Reschedule Pending', bg: '#FEF3C7', fg: '#92400E' },
    appointment_confirmed:   { label: 'Confirmed',        bg: '#DCFCE7', fg: '#14532D' },
    cancelled:               { label: 'Cancelled',        bg: '#FEE2E2', fg: '#991B1B' },
  };
  const cfg = map[status] || { label: status, bg: '#F1F5F9', fg: '#475569' };
  return (
    <View style={[badge.wrap, { backgroundColor: cfg.bg }]}>
      <Text style={[badge.txt, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}
const badge = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginTop: 4 },
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
      const resp = await fetch(`${NODE_API}/userRespondToQuote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId,
          action: 'reschedule',
          requestedDate: fmtD(date),
          requestedTime: fmtTime(date),
        }),
      });
      if (!resp.ok) throw new Error('Server error');
      onDone?.();
    } catch {
      Alert.alert('Error', 'Could not submit request. Please try again.');
    } finally { setSending(false); }
  };

  return (
    <View style={rp.wrap}>
      <Text style={rp.title}>Request a Different Time</Text>

      {IS_WEB ? (
        createElement('input', {
          type: 'date',
          value: `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`,
          min: (() => { const t = new Date(); t.setDate(t.getDate()+1); return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`; })(),
          onChange: (e) => {
            if (e.target.value) {
              const [y, mo, d] = e.target.value.split('-').map(Number);
              const nd = new Date(date); nd.setFullYear(y, mo-1, d); setDate(nd);
            }
          },
          style: { fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', marginBottom: 8, width: '100%' },
        })
      ) : Platform.OS === 'ios' ? (
        <DateTimePicker value={date} mode="date" display="spinner" minimumDate={new Date()}
          onChange={(_, s) => { if (s) setDate(s); }} style={{ width: '100%', marginBottom: 6 }} />
      ) : (
        <>
          <TouchableOpacity style={rp.btn} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={15} color="#2563EB" />
            <Text style={rp.btnTxt}>{fmtD(date)}</Text>
          </TouchableOpacity>
          {showDatePicker && <DateTimePicker value={date} mode="date" minimumDate={new Date()}
            onChange={(ev, s) => { setShowDatePicker(false); if (ev.type !== 'dismissed' && s) setDate(s); }} />}
        </>
      )}

      {IS_WEB ? (
        createElement('input', {
          type: 'time',
          value: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
          onChange: (e) => {
            if (e.target.value) {
              const [h, m] = e.target.value.split(':').map(Number);
              const nd = new Date(date); nd.setHours(h, m, 0, 0); setDate(nd);
            }
          },
          style: { fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', marginBottom: 8 },
        })
      ) : Platform.OS === 'ios' ? (
        <DateTimePicker value={date} mode="time" display="spinner"
          onChange={(_, s) => { if (s) setDate(s); }} style={{ width: '100%', marginBottom: 6 }} />
      ) : (
        <>
          <TouchableOpacity style={rp.btn} onPress={() => setShowTimePicker(true)}>
            <Ionicons name="time-outline" size={15} color="#2563EB" />
            <Text style={rp.btnTxt}>{fmtTime(date)}</Text>
          </TouchableOpacity>
          {showTimePicker && <DateTimePicker value={date} mode="time"
            onChange={(ev, s) => { setShowTimePicker(false); if (ev.type !== 'dismissed' && s) setDate(s); }} />}
        </>
      )}

      <TouchableOpacity style={[rp.sendBtn, sending && { opacity: 0.5 }]} onPress={handleSend} disabled={sending}>
        <Text style={rp.sendBtnTxt}>{sending ? 'Sending…' : 'Request This Time'}</Text>
      </TouchableOpacity>
    </View>
  );
}
const rp = StyleSheet.create({
  wrap:    { marginTop: 14, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  title:   { fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  btn:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#EFF6FF', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  btnTxt:  { fontSize: 14, fontWeight: '700', color: '#2563EB', flex: 1 },
  sendBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  sendBtnTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

// ── Answer form ───────────────────────────────────────────────────────────────
function AnswerForm({ quote, onDone }) {
  const questions = quote.infoRequest?.questions || [];
  const [answers, setAnswers] = useState(questions.map(() => ''));
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (answers.some(a => !a.trim())) { Alert.alert('Answer all questions', 'Please fill in all answers before sending.'); return; }
    setSending(true);
    try {
      const resp = await fetch(`${NODE_API}/userRespondToQuote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote._id, action: 'provide_info', answers }),
      });
      if (!resp.ok) throw new Error('Server error');
      onDone?.();
    } catch {
      Alert.alert('Error', 'Could not send answers. Please try again.');
    } finally { setSending(false); }
  };

  return (
    <View style={af.wrap}>
      <Text style={af.title}>Questions from the Business</Text>
      {questions.map((q, i) => (
        <View key={i} style={af.qBlock}>
          <Text style={af.qTxt}>{i+1}. {q}</Text>
          <TextInput
            style={af.input}
            placeholder="Your answer…"
            placeholderTextColor="#94A3B8"
            value={answers[i]}
            onChangeText={v => setAnswers(prev => prev.map((a, idx) => idx === i ? v : a))}
            multiline
          />
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
  sendBtn:  { backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 6 },
  sendBtnTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

// ── Single match card ─────────────────────────────────────────────────────────
function MatchCard({ quote, onRefresh }) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [confirmSending, setConfirmSending] = useState(false);
  const { status } = quote;

  const handleConfirm = async () => {
    setConfirmSending(true);
    try {
      const resp = await fetch(`${NODE_API}/userRespondToQuote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote._id, action: 'confirm' }),
      });
      if (!resp.ok) throw new Error('Server error');
      Alert.alert('Appointment Confirmed!', `Your appointment has been booked. You'll receive a confirmation shortly.`);
      onRefresh?.();
    } catch {
      Alert.alert('Error', 'Could not confirm. Please try again.');
    } finally { setConfirmSending(false); }
  };

  const handleRescheduleDone = () => { setShowReschedule(false); onRefresh?.(); };
  const handleAnswersDone    = () => onRefresh?.();

  return (
    <ScrollView style={mc.scroll} contentContainerStyle={mc.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Service header */}
      <View style={mc.serviceRow}>
        <View style={mc.serviceIcon}>
          <Ionicons name="briefcase-outline" size={22} color="#2563EB" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={mc.serviceName} numberOfLines={1}>{quote.serviceName || 'Matched Service'}</Text>
          <Text style={mc.serviceCategory} numberOfLines={1}>{quote.serviceCategory || ''}</Text>
        </View>
      </View>

      <StatusBadge status={status} />

      {/* ── pending_business ───────────────────────────────────── */}
      {status === 'pending_business' && (
        <View style={mc.pendingWrap}>
          <View style={mc.pulseRing}>
            <Ionicons name="hourglass-outline" size={28} color="#F59E0B" />
          </View>
          <Text style={mc.pendingTitle}>Awaiting Response</Text>
          <Text style={mc.pendingSubtitle}>The business has received your request and is preparing a quote.</Text>
        </View>
      )}

      {/* ── business_confirmed / business_edited ───────────────── */}
      {(status === 'business_confirmed' || status === 'business_edited') && (
        <>
          <View style={mc.quoteCard}>
            <View style={mc.quoteRow}>
              <Ionicons name="cash-outline" size={18} color="#10B981" />
              <Text style={mc.quoteLabel}>Quoted Price</Text>
              <Text style={mc.quoteValue}>{quote.confirmedPrice ? `$${quote.confirmedPrice}` : 'Not specified'}</Text>
            </View>
            <View style={mc.quoteRow}>
              <Ionicons name="calendar-outline" size={18} color="#2563EB" />
              <Text style={mc.quoteLabel}>Proposed Date</Text>
              <Text style={mc.quoteValue}>{quote.proposedDate || '—'}</Text>
            </View>
            <View style={mc.quoteRow}>
              <Ionicons name="time-outline" size={18} color="#2563EB" />
              <Text style={mc.quoteLabel}>Time</Text>
              <Text style={mc.quoteValue}>{quote.proposedTime || '—'}</Text>
            </View>
            {quote.businessNote ? (
              <View style={mc.noteBox}>
                <Text style={mc.noteLabel}>Note from Business</Text>
                <Text style={mc.noteText}>{quote.businessNote}</Text>
              </View>
            ) : null}
          </View>

          {!showReschedule && (
            <View style={mc.actionRow}>
              <TouchableOpacity
                style={[mc.btnPrimary, confirmSending && { opacity: 0.5 }]}
                onPress={handleConfirm} disabled={confirmSending}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={mc.btnPrimaryTxt}>{confirmSending ? 'Confirming…' : 'Confirm Appointment'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={mc.btnSecondary} onPress={() => setShowReschedule(true)}>
                <Ionicons name="calendar-outline" size={17} color="#2563EB" />
                <Text style={mc.btnSecondaryTxt}>Request Different Time</Text>
              </TouchableOpacity>
            </View>
          )}

          {showReschedule && (
            <ReschedulePicker quoteId={quote._id} onDone={handleRescheduleDone} />
          )}
        </>
      )}

      {/* ── awaiting_user_info ─────────────────────────────────── */}
      {status === 'awaiting_user_info' && (
        <AnswerForm quote={quote} onDone={handleAnswersDone} />
      )}

      {/* ── user_info_provided ─────────────────────────────────── */}
      {status === 'user_info_provided' && (
        <View style={mc.infoBox}>
          <Ionicons name="checkmark-done-circle-outline" size={32} color="#2563EB" />
          <Text style={mc.infoBoxTitle}>Answers Sent</Text>
          <Text style={mc.infoBoxSubtitle}>The business will review your answers and send an updated quote shortly.</Text>
        </View>
      )}

      {/* ── user_requested_reschedule ──────────────────────────── */}
      {status === 'user_requested_reschedule' && (
        <View style={mc.infoBox}>
          <Ionicons name="time-outline" size={32} color="#F59E0B" />
          <Text style={mc.infoBoxTitle}>Reschedule Requested</Text>
          <Text style={mc.infoBoxSubtitle}>Waiting for the business to confirm your new preferred time.</Text>
          {quote.userRequestedDate && (
            <View style={{ marginTop: 10 }}>
              <Text style={mc.infoBoxDetail}>{quote.userRequestedDate}{quote.userRequestedTime ? ` at ${quote.userRequestedTime}` : ''}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── appointment_confirmed ──────────────────────────────── */}
      {status === 'appointment_confirmed' && (
        <View style={[mc.infoBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
          <Ionicons name="checkmark-circle" size={36} color="#16A34A" />
          <Text style={[mc.infoBoxTitle, { color: '#15803D' }]}>Appointment Confirmed!</Text>
          <View style={mc.confirmedDetails}>
            {quote.proposedDate && (
              <View style={mc.confirmedRow}>
                <Ionicons name="calendar" size={15} color="#16A34A" />
                <Text style={mc.confirmedTxt}>{quote.proposedDate}</Text>
              </View>
            )}
            {quote.proposedTime && (
              <View style={mc.confirmedRow}>
                <Ionicons name="time" size={15} color="#16A34A" />
                <Text style={mc.confirmedTxt}>{quote.proposedTime}</Text>
              </View>
            )}
            {quote.confirmedPrice && (
              <View style={mc.confirmedRow}>
                <Ionicons name="cash" size={15} color="#16A34A" />
                <Text style={mc.confirmedTxt}>${quote.confirmedPrice}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── cancelled ──────────────────────────────────────────── */}
      {status === 'cancelled' && (
        <View style={[mc.infoBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
          <Ionicons name="close-circle-outline" size={32} color="#DC2626" />
          <Text style={[mc.infoBoxTitle, { color: '#B91C1C' }]}>Cancelled</Text>
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const mc = StyleSheet.create({
  scroll:   { width: CARD_W },
  scrollContent: { paddingHorizontal: 2 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  serviceIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BFDBFE',
  },
  serviceName:     { fontSize: IS_WEB ? 16 : 14, fontWeight: '800', color: '#0F172A' },
  serviceCategory: { fontSize: 12, color: '#64748B', marginTop: 1 },

  pendingWrap: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  pulseRing:   {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FDE68A',
  },
  pendingTitle:    { fontSize: 16, fontWeight: '800', color: '#92400E', textAlign: 'center' },
  pendingSubtitle: { fontSize: 13, color: '#78350F', textAlign: 'center', lineHeight: 18, paddingHorizontal: 10 },

  quoteCard:  { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#E2E8F0', gap: 10 },
  quoteRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  quoteLabel: { flex: 1, fontSize: 13, color: '#475569', fontWeight: '600' },
  quoteValue: { fontSize: 14, color: '#0F172A', fontWeight: '800' },
  noteBox:    { backgroundColor: '#FFF7ED', borderRadius: 10, padding: 11, borderWidth: 1, borderColor: '#FED7AA', marginTop: 4 },
  noteLabel:  { fontSize: 11, fontWeight: '800', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  noteText:   { fontSize: 13, color: '#78350F', lineHeight: 18 },

  actionRow: { gap: 10, marginTop: 14 },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 14,
  },
  btnPrimaryTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  btnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 13,
    borderWidth: 1.5, borderColor: '#BFDBFE',
  },
  btnSecondaryTxt: { fontSize: 14, fontWeight: '700', color: '#2563EB' },

  infoBox: {
    alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 14,
    padding: 24, gap: 8, marginTop: 16, borderWidth: 1, borderColor: '#BFDBFE',
  },
  infoBoxTitle:    { fontSize: 16, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  infoBoxSubtitle: { fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  infoBoxDetail:   { fontSize: 14, fontWeight: '700', color: '#2563EB', textAlign: 'center' },
  confirmedDetails: { gap: 6, marginTop: 6 },
  confirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center' },
  confirmedTxt: { fontSize: 14, fontWeight: '700', color: '#166534' },
});

// ── Main modal ────────────────────────────────────────────────────────────────
export default function MatchesModal({ needId, quotes: initialQuotes, onClose, onRefresh }) {
  const [quotes, setQuotes]     = useState(initialQuotes || []);
  const [page,   setPage]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const listRef = useRef(null);

  // Re-poll quotes when user triggers action in a card
  const handleRefresh = useCallback(async () => {
    if (!needId) return;
    setLoading(true);
    try {
      const resp = await fetch(`${NODE_API}/serviceQuotes?needId=${needId}`);
      const data = await resp.json();
      if (Array.isArray(data)) setQuotes(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
    onRefresh?.();
  }, [needId, onRefresh]);

  // Keep quotes fresh if parent pushes new ones
  useEffect(() => {
    if (initialQuotes) setQuotes(initialQuotes);
  }, [initialQuotes]);

  const handleScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    setPage(Math.round(x / (CARD_W + 20)));
  };

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={mm.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={!IS_WEB}
      >
        <View style={IS_WEB ? mm.webWrap : { flex: 1 }}>

          {/* Header */}
          <View style={mm.header}>
            <TouchableOpacity onPress={onClose} style={mm.closeBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
              <Ionicons name="close" size={IS_WEB ? 28 : 22} color="#0F172A" />
            </TouchableOpacity>
            <Text style={mm.headerTitle}>Your Matches</Text>
            {loading
              ? <ActivityIndicator size="small" color="#2563EB" style={{ width: IS_WEB ? 40 : 30 }} />
              : <View style={{ width: IS_WEB ? 40 : 30 }} />
            }
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
                  <View style={[mm.cardWrap, { width: CARD_W }]}>
                    <MatchCard quote={item} onRefresh={handleRefresh} />
                  </View>
                )}
              />

              {/* Page dots */}
              {quotes.length > 1 && (
                <View style={mm.dotsRow}>
                  {quotes.map((_, i) => (
                    <TouchableOpacity
                      key={i}
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mm = StyleSheet.create({
  screen: { flex: 1, backgroundColor: IS_WEB ? '#F0F2F5' : '#fff' },
  webWrap: { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: IS_WEB ? 20 : 16,
    paddingTop: IS_WEB ? 14 : 54,
    paddingBottom: IS_WEB ? 16 : 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  closeBtn:    { width: IS_WEB ? 40 : 30 },
  headerTitle: { fontSize: IS_WEB ? 20 : 17, fontWeight: '800', color: '#0F172A' },

  listContent: { paddingHorizontal: IS_WEB ? 20 : 20, paddingVertical: 20, gap: 20 },
  cardWrap: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 12 },
  dot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: '#CBD5E1' },
  dotActive:{ width: 10, height: 10, backgroundColor: '#2563EB' },
  swipeHint: { textAlign: 'center', fontSize: 12, color: '#94A3B8', paddingBottom: IS_WEB ? 10 : 20 },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  emptySub:   { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
});
