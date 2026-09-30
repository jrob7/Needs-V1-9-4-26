// Screens/QuoteResponseModal.js
// Business-facing modal for responding to a quote_request notification.
// Stores response directly in ServiceQuotes — no messages.
// Two tabs: "Send Quote" (calendar + price) | "Ask a Question"
import React, { createElement, useState, useContext, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, Image, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { UserContext } from '../server/CurrentUser';
import { NODE_API, FLASK_API } from '../config';
import { IS_WEB } from '../webLayout';
import { authFetch } from '../server/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const toYMD = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fmtDate = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (d) => {
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m)} ${ampm}`;
};
function parseSlotTime(str, base) {
  const match = (str || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const ampm = (match[3] || '').toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const d = new Date(base); d.setHours(h, min, 0, 0); return d;
}

// ── Mini calendar ─────────────────────────────────────────────────────────────
const DAY_LABELS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES  = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

function MonthCalendar({ selectedDay, onSelectDay, busyDays, calMonth, onChangeMonth }) {
  const year = calMonth.getFullYear(), m = calMonth.getMonth();
  const today = new Date(); today.setHours(0,0,0,0);
  const firstWD = new Date(year, m, 1).getDay();
  const daysInM = new Date(year, m+1, 0).getDate();
  const total   = Math.ceil((firstWD + daysInM) / 7) * 7;
  const rows = [];
  for (let r = 0; r < total/7; r++) {
    const row = [];
    for (let c = 0; c < 7; c++) {
      const d = r*7 + c - firstWD + 1;
      row.push(d >= 1 && d <= daysInM ? d : null);
    }
    rows.push(row);
  }
  return (
    <View style={calSt.cal}>
      <View style={calSt.header}>
        <TouchableOpacity onPress={() => onChangeMonth(-1)} hitSlop={{top:8,bottom:8,left:12,right:12}}>
          <Ionicons name="chevron-back" size={20} color="#2563EB" />
        </TouchableOpacity>
        <Text style={calSt.title}>{MONTH_NAMES[m]} {year}</Text>
        <TouchableOpacity onPress={() => onChangeMonth(1)} hitSlop={{top:8,bottom:8,left:12,right:12}}>
          <Ionicons name="chevron-forward" size={20} color="#2563EB" />
        </TouchableOpacity>
      </View>
      <View style={calSt.dayRow}>
        {DAY_LABELS.map(l => <Text key={l} style={calSt.dayLabel}>{l}</Text>)}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={calSt.weekRow}>
          {row.map((day, ci) => {
            if (!day) return <View key={ci} style={calSt.cell} />;
            const cellDate = new Date(year, m, day); cellDate.setHours(0,0,0,0);
            const isPast = cellDate < today;
            const ymd   = toYMD(cellDate);
            const isBusy = busyDays.has(ymd);
            const isSel  = selectedDay && toYMD(selectedDay) === ymd;
            const isTod  = toYMD(today) === ymd;
            return (
              <TouchableOpacity
                key={ci} style={[calSt.cell, isSel && calSt.cellSel, isTod && !isSel && calSt.cellToday, isPast && calSt.cellPast]}
                onPress={() => !isPast && onSelectDay(cellDate)} disabled={isPast} activeOpacity={0.75}
              >
                <Text style={[calSt.cellTxt, isSel && calSt.cellTxtSel, isTod && !isSel && calSt.cellTxtToday, isPast && calSt.cellTxtPast]}>{day}</Text>
                {isBusy && <View style={[calSt.dot, isSel && { backgroundColor: '#fff' }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <View style={calSt.legend}>
        <View style={calSt.legendItem}><View style={calSt.dot} /><Text style={calSt.legendTxt}>Has appointments</Text></View>
      </View>
    </View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function QuoteResponseModal({ notification, onClose, onSent, initialTab = 'quote' }) {
  const { userId } = useContext(UserContext);
  const [activeTab, setActiveTab] = useState(initialTab); // 'quote' | 'ask'
  const [sending, setSending] = useState(false);

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [busyDays, setBusyDays] = useState(new Set());
  const [calConnected, setCalConnected] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);

  // Day / slot
  const [selectedDay,    setSelectedDay]    = useState(null);
  const [availableSlots, setAvailableSlots] = useState(null);
  const [loadingSlots,   setLoadingSlots]   = useState(false);
  const [selectedSlot,   setSelectedSlot]   = useState(null);
  const [appointmentDate, setAppointmentDate] = useState(() => { const d = new Date(); d.setHours(d.getHours()+1,0,0,0); return d; });
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Quote fields
  const [price, setPrice] = useState(
    notification?.estimateMin != null && notification?.estimateMax != null
      ? `${Math.round((notification.estimateMin + notification.estimateMax) / 2)}`
      : ''
  );
  const [note, setNote] = useState('');

  // Ask fields
  const [questions,     setQuestions]     = useState([]);
  const [customQuestion, setCustomQuestion] = useState('');

  // Full quote doc — fetched when opened from info_provided to show customer's answers
  const [quoteDoc, setQuoteDoc] = useState(null);
  useEffect(() => {
    const qId = notification?.quoteId;
    if (!qId || notification?.type !== 'info_provided') return;
    authFetch(`${NODE_API}/serviceQuote/${qId}`)
      .then(r => r.json())
      .then(d => { if (d && !d.error) setQuoteDoc(d); })
      .catch(() => {});
  }, [notification?.quoteId]);

  // ── Fetch busy days ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || activeTab !== 'quote') return;
    const month = `${calMonth.getFullYear()}-${pad(calMonth.getMonth()+1)}`;
    setLoadingMonth(true);
    fetch(`${NODE_API}/calendar/monthEvents?month=${month}&serviceUserId=${userId}`)
      .then(r => r.json())
      .then(d => { setCalConnected(d.connected !== false); setBusyDays(new Set(d.busyDays || [])); })
      .catch(() => {})
      .finally(() => setLoadingMonth(false));
  }, [calMonth, userId, activeTab]);


  // ── Select a day ────────────────────────────────────────────────────────
  const handleSelectDay = useCallback(async (day) => {
    setSelectedDay(day);
    setSelectedSlot(null);
    setAvailableSlots(null);
    const merged = new Date(appointmentDate);
    merged.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    setAppointmentDate(merged);
    if (!userId || !calConnected) return;
    setLoadingSlots(true);
    try {
      const res = await fetch(`${NODE_API}/calendar/slots?date=${toYMD(day)}&serviceUserId=${userId}`);
      const data = await res.json();
      setAvailableSlots(Array.isArray(data.slots) ? data.slots : []);
    } catch { setAvailableSlots([]); }
    finally { setLoadingSlots(false); }
  }, [userId, calConnected, appointmentDate]);

  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot);
    const t = parseSlotTime(slot.start, selectedDay || appointmentDate);
    if (t) setAppointmentDate(t);
  };

  // ── Send quote ───────────────────────────────────────────────────────────
  const handleSendQuote = async () => {
    if (!selectedDay) { Alert.alert('Select a date', 'Please pick a date from the calendar.'); return; }
    const quoteId = notification?.quoteId;
    if (!quoteId) { Alert.alert('Error', 'Quote ID missing.'); return; }

    setSending(true);
    try {
      const dateStr = fmtDate(appointmentDate);
      const timeStr = fmtTime(appointmentDate);
      const resp = await fetch(`${NODE_API}/respondToServiceQuote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId,
          action: 'confirm',
          proposedDate: dateStr,
          proposedTime: timeStr,
          confirmedPrice: price.trim() || null,
          businessNote: note.trim() || null,
        }),
      });
      if (!resp.ok) throw new Error('Server error');

      // Mark notification read
      authFetch(`${NODE_API}/markNotificationsRead`, {
        method: 'POST',
        body: JSON.stringify({ notificationIds: [notification._id] }),
      }).catch(() => {});

      Alert.alert('✅ Quote Sent', `Your quote for ${dateStr} at ${timeStr} has been sent to the customer.`);
      onSent?.();
    } catch {
      Alert.alert('Error', "Couldn't send your quote. Please try again.");
    } finally { setSending(false); }
  };

  // ── Send questions ───────────────────────────────────────────────────────
  const handleSendQuestions = async () => {
    const all = [...questions, ...(customQuestion.trim() ? [customQuestion.trim()] : [])].filter(Boolean);
    if (all.length === 0) { Alert.alert('Add a question', 'Please add at least one question.'); return; }
    const quoteId = notification?.quoteId;
    if (!quoteId) { Alert.alert('Error', 'Quote ID missing.'); return; }

    setSending(true);
    try {
      const resp = await fetch(`${NODE_API}/respondToServiceQuote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, action: 'ask', questions: all }),
      });
      if (!resp.ok) throw new Error('Server error');

      authFetch(`${NODE_API}/markNotificationsRead`, {
        method: 'POST',
        body: JSON.stringify({ notificationIds: [notification._id] }),
      }).catch(() => {});

      Alert.alert('✅ Questions Sent', 'The customer will answer your questions in their matches view.');
      onSent?.();
    } catch {
      Alert.alert('Error', "Couldn't send your questions. Please try again.");
    } finally { setSending(false); }
  };

  // ── Android time picker ──────────────────────────────────────────────────
  const onAndroidTimeChange = (event, selected) => {
    setShowTimePicker(false);
    if (event.type !== 'dismissed' && selected) {
      const merged = new Date(appointmentDate);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setAppointmentDate(merged);
    }
  };

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={!IS_WEB}>
        <View style={IS_WEB ? { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' } : { flex: 1 }}>

          {/* Header */}
          <View style={st.header}>
            <TouchableOpacity onPress={onClose} style={st.closeBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
              <Ionicons name="close" size={IS_WEB ? 28 : 22} color="#0F172A" />
            </TouchableOpacity>
            <Text style={st.headerTitle}>Respond to Request</Text>
            <View style={{ width: IS_WEB ? 40 : 30 }} />
          </View>

          {/* Tabs */}
          <View style={st.tabs}>
            {[['quote','📋 Send Quote'],['ask','💬 Ask Question']].map(([key, label]) => (
              <TouchableOpacity key={key} style={[st.tab, activeTab === key && st.tabActive]} onPress={() => setActiveTab(key)}>
                <Text style={[st.tabTxt, activeTab === key && st.tabTxtActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">

            {/* Request banner */}
            {notification?.needText ? (
              <View style={st.needBanner}>
                <Text style={st.needBannerLabel}>Request</Text>
                <Text style={st.needBannerText}>{notification.needText}</Text>
              </View>
            ) : null}
            {notification?.estimateMin != null && (
              <View style={st.estHint}>
                <Ionicons name="sparkles-outline" size={13} color="#7C3AED" />
                <Text style={st.estHintTxt}>
                  AI suggested: ${Math.round(notification.estimateMin)}–${Math.round(notification.estimateMax)}
                </Text>
              </View>
            )}

            {/* ── QUOTE TAB ──────────────────────────────────────────── */}
            {activeTab === 'quote' && (
              <>
                {/* Customer Q&A — shown when business opens from info_provided notification */}
                {quoteDoc?.infoRequest?.questions?.length > 0 && (
                  <View style={{ backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#DDD6FE', marginBottom: 18 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#5B21B6', marginBottom: 10 }}>Customer's Answers</Text>
                    {quoteDoc.infoRequest.questions.map((q, i) => (
                      <View key={i} style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, color: '#3B0764', fontWeight: '600', marginBottom: 4 }}>{i + 1}. {q}</Text>
                        <Text style={{ fontSize: 13, color: '#1E1B4B', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#DDD6FE', padding: 10 }}>
                          {Array.isArray(quoteDoc.infoResponse?.answers)
                            ? quoteDoc.infoResponse.answers[i] || '—'
                            : quoteDoc.infoResponse?.answers?.[i] || '—'}
                        </Text>
                      </View>
                    ))}
                    {quoteDoc.infoResponse?.photoUrl ? (
                      <View style={{ marginTop: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#5B21B6', marginBottom: 6 }}>Attached Photo</Text>
                        <Image
                          source={{ uri: quoteDoc.infoResponse.photoUrl }}
                          style={{ width: '100%', height: 180, borderRadius: 10, resizeMode: 'cover', borderWidth: 1, borderColor: '#DDD6FE' }}
                        />
                      </View>
                    ) : null}
                  </View>
                )}

                <View style={st.sectionRow}>
                  <Text style={st.sectionTitle}>Select a Date</Text>
                  {loadingMonth && <ActivityIndicator size="small" color="#2563EB" style={{ marginLeft: 8 }} />}
                </View>

                <MonthCalendar
                  selectedDay={selectedDay}
                  onSelectDay={handleSelectDay}
                  busyDays={busyDays}
                  calMonth={calMonth}
                  onChangeMonth={dir => setCalMonth(p => { const n = new Date(p); n.setMonth(n.getMonth()+dir); return n; })}
                />

                {selectedDay && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={st.sectionTitle}>
                      Select a Time — {selectedDay.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
                    </Text>

                    {loadingSlots && (
                      <View style={st.slotsLoading}>
                        <ActivityIndicator color="#2563EB" />
                        <Text style={st.slotsLoadingTxt}>Checking your calendar…</Text>
                      </View>
                    )}

                    {!loadingSlots && calConnected && availableSlots !== null && availableSlots.length === 0 && (
                      <View style={st.noSlots}>
                        <Ionicons name="calendar-clear-outline" size={18} color="#94A3B8" />
                        <Text style={st.noSlotsTxt}>No open 1-hour slots this day — set a custom time below.</Text>
                      </View>
                    )}

                    {!loadingSlots && availableSlots?.length > 0 && (
                      <View style={st.slotsGrid}>
                        {availableSlots.map(slot => {
                          const chosen = selectedSlot?.start === slot.start;
                          return (
                            <TouchableOpacity key={slot.start}
                              style={[st.slotChip, chosen && st.slotChipSel]}
                              onPress={() => handleSelectSlot(slot)} activeOpacity={0.8}
                            >
                              <Text style={[st.slotChipTxt, chosen && st.slotChipTxtSel]}>{slot.start}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {/* Manual time */}
                    <Text style={st.manualLabel}>
                      {calConnected && availableSlots?.length > 0 ? 'Or set a custom time:' : 'Set appointment time:'}
                    </Text>
                    {IS_WEB ? (
                      createElement('input', {
                        type: 'time',
                        value: `${pad(appointmentDate.getHours())}:${pad(appointmentDate.getMinutes())}`,
                        onChange: e => {
                          if (e.target.value) {
                            const [h, min] = e.target.value.split(':').map(Number);
                            const d = new Date(appointmentDate); d.setHours(h, min, 0, 0); setAppointmentDate(d); setSelectedSlot(null);
                          }
                        },
                        style: {
                          fontSize: 15, fontWeight: '700', color: '#2563EB',
                          backgroundColor: '#EFF6FF', border: '1.5px solid #BFDBFE',
                          borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                          outline: 'none', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                          WebkitAppearance: 'none', colorScheme: 'light',
                        },
                      })
                    ) : Platform.OS === 'ios' ? (
                      <DateTimePicker value={appointmentDate} mode="time" display="spinner"
                        onChange={(_, sel) => { if (sel) { setAppointmentDate(sel); setSelectedSlot(null); } }}
                        style={{ width: '100%' }} />
                    ) : (
                      <>
                        <TouchableOpacity style={st.androidTimeBtn} onPress={() => setShowTimePicker(true)}>
                          <Ionicons name="time-outline" size={16} color="#2563EB" />
                          <Text style={st.androidTimeTxt}>{fmtTime(appointmentDate)}</Text>
                          <Ionicons name="chevron-down" size={13} color="#2563EB" />
                        </TouchableOpacity>
                        {showTimePicker && <DateTimePicker value={appointmentDate} mode="time" display="default" onChange={onAndroidTimeChange} />}
                      </>
                    )}
                  </View>
                )}

                {selectedDay && (
                  <View style={st.selectedSummary}>
                    <Ionicons name="checkmark-circle" size={15} color="#10B981" />
                    <Text style={st.selectedSummaryTxt}>{fmtDate(appointmentDate)} at {fmtTime(appointmentDate)}</Text>
                  </View>
                )}

                {!selectedDay && (
                  <View style={st.tapPrompt}>
                    <Ionicons name="finger-print-outline" size={16} color="#94A3B8" />
                    <Text style={st.tapPromptTxt}>Tap a date above to see your availability</Text>
                  </View>
                )}

                <View style={st.divider} />

                <Text style={st.sectionTitle}>Your Price</Text>
                <View style={st.priceRow}>
                  <Text style={st.dollar}>$</Text>
                  <TextInput
                    style={st.priceInput} placeholder="0.00" placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad" value={price} onChangeText={setPrice}
                  />
                </View>

                <View style={st.divider} />

                <Text style={st.sectionTitle}>Optional Note</Text>
                <TextInput
                  style={st.noteInput} placeholder="Add a note for the customer…"
                  placeholderTextColor="#94A3B8" multiline value={note} onChangeText={setNote}
                />

                <View style={st.divider} />

                <TouchableOpacity
                  style={[st.sendBtn, (sending || !selectedDay) && { opacity: 0.5 }]}
                  onPress={handleSendQuote} disabled={sending || !selectedDay}
                >
                  <Text style={st.sendBtnTxt}>{sending ? 'Sending…' : 'Send Quote'}</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── ASK TAB ────────────────────────────────────────────── */}
            {activeTab === 'ask' && (
              <>
                <Text style={[st.sectionTitle, { marginBottom: 6 }]}>Ask the Customer</Text>
                <Text style={[st.noteInput, { color: '#6B7280', fontSize: 13, borderWidth: 0, paddingHorizontal: 0, backgroundColor: 'transparent', marginBottom: 12 }]}>
                  Type your question(s) below. The customer will see them in their quote view and can reply before you finalize the quote.
                </Text>

                {questions.map((q, i) => (
                  <View key={i} style={st.questionRow}>
                    <TextInput
                      style={st.questionInput}
                      value={q}
                      onChangeText={v => setQuestions(prev => prev.map((old, idx) => idx === i ? v : old))}
                      multiline
                    />
                    <TouchableOpacity
                      onPress={() => setQuestions(prev => prev.filter((_, idx) => idx !== i))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>
                ))}

                <TextInput
                  style={[st.questionInput, { marginTop: 8 }]}
                  placeholder="Type a question…"
                  placeholderTextColor="#94A3B8"
                  value={customQuestion}
                  onChangeText={setCustomQuestion}
                  onSubmitEditing={() => {
                    if (customQuestion.trim()) {
                      setQuestions(prev => [...prev, customQuestion.trim()]);
                      setCustomQuestion('');
                    }
                  }}
                  returnKeyType="done"
                />

                <View style={st.divider} />

                <TouchableOpacity
                  style={[st.sendBtn, { backgroundColor: '#7C3AED' }, sending && { opacity: 0.5 }]}
                  onPress={handleSendQuestions} disabled={sending}
                >
                  <Text style={st.sendBtnTxt}>{sending ? 'Sending…' : 'Send Questions'}</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={{ height: 36 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Calendar styles ───────────────────────────────────────────────────────────
const calSt = StyleSheet.create({
  cal:      { backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: IS_WEB ? 14 : 10, marginBottom: 4 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: IS_WEB ? 14 : 10 },
  title:    { fontSize: IS_WEB ? 17 : 14, fontWeight: '800', color: '#0F172A' },
  dayRow:   { flexDirection: 'row', marginBottom: 4 },
  dayLabel: { width: `${100/7}%`, textAlign: 'center', fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  weekRow:  { flexDirection: 'row', marginBottom: 3 },
  cell:     { width: `${100/7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, position: 'relative' },
  cellSel:  { backgroundColor: '#2563EB' },
  cellToday:{ backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#BFDBFE' },
  cellPast: { opacity: 0.3 },
  cellTxt:  { fontSize: IS_WEB ? 14 : 12, fontWeight: '600', color: '#1E293B' },
  cellTxtSel:   { color: '#fff', fontWeight: '800' },
  cellTxtToday: { color: '#2563EB', fontWeight: '800' },
  cellTxtPast:  { color: '#94A3B8' },
  dot:      { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: '#F59E0B' },
  legend:   { flexDirection: 'row', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendTxt:  { fontSize: 11, color: '#6B7280' },
});

// ── Modal styles ──────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: IS_WEB ? '#F0F2F5' : '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: IS_WEB ? 20 : 16, paddingTop: IS_WEB ? 14 : 54, paddingBottom: IS_WEB ? 16 : 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  closeBtn:    { width: IS_WEB ? 40 : 30 },
  headerTitle: { fontSize: IS_WEB ? 20 : 16, fontWeight: '800', color: '#0F172A' },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tab: { flex: 1, paddingVertical: IS_WEB ? 14 : 11, alignItems: 'center', borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#2563EB' },
  tabTxt:    { fontSize: IS_WEB ? 15 : 13, fontWeight: '600', color: '#94A3B8' },
  tabTxtActive: { color: '#2563EB', fontWeight: '800' },

  body: { paddingHorizontal: IS_WEB ? 24 : 16, paddingTop: IS_WEB ? 20 : 16 },

  needBanner: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  needBannerLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 3, letterSpacing: 0.5 },
  needBannerText:  { fontSize: 14, color: '#0F172A', lineHeight: 20 },

  estHint: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F5F3FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    marginBottom: 16, alignSelf: 'flex-start',
  },
  estHintTxt: { fontSize: 12, color: '#7C3AED', fontWeight: '600' },

  sectionRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionTitle:{ fontSize: IS_WEB ? 17 : 14, fontWeight: '800', color: '#0F172A', marginBottom: 8 },

  slotsLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  slotsLoadingTxt: { fontSize: 13, color: '#64748B' },
  noSlots: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#FFF7ED', borderRadius: 10, padding: 11, marginBottom: 10 },
  noSlotsTxt: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  slotChip:    { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 9, borderWidth: 1.5, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  slotChipSel: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  slotChipTxt:    { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  slotChipTxtSel: { color: '#fff' },
  manualLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 8, marginTop: 4 },
  androidTimeBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  androidTimeTxt: { flex: 1, fontSize: 15, fontWeight: '700', color: '#2563EB' },
  tapPrompt: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginTop: 6, marginBottom: 4 },
  tapPromptTxt: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic' },
  selectedSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FDF4', borderRadius: 9, padding: 11, marginTop: 10,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  selectedSummaryTxt: { fontSize: 13, color: '#15803D', fontWeight: '600' },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: IS_WEB ? 20 : 16 },

  priceRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 14, backgroundColor: '#F8FAFC',
  },
  dollar:     { fontSize: 16, fontWeight: '700', color: '#475569', marginRight: 4 },
  priceInput: { flex: 1, fontSize: 16, color: '#0F172A', paddingVertical: 12 },

  noteInput: {
    minHeight: 76, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
  },

  questionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  questionInput: {
    flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
  },

  sendBtn:    { height: 52, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  sendBtnTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
