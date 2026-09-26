// Screens/RespondToLeadModal.js
import React, { createElement, useState, useContext, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { UserContext } from '../server/CurrentUser';

import { NODE_API } from '../config';
import { IS_WEB } from '../webLayout';
import { authFetch } from '../server/api';

// ── Date/time formatters (stored in quoteData, parsed by appointmentReminders) ─
const fmtDate = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (d) => {
  const h    = d.getHours();
  const m    = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};
const pad = (n) => String(n).padStart(2, '0');
const toYMD = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

// Parse a slot time string like "2:00 PM" back into hours/minutes
function parseSlotTime(str, baseDate) {
  const match = (str || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const ampm = (match[3] || '').toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const d = new Date(baseDate);
  d.setHours(h, min, 0, 0);
  return d;
}

// ── Month calendar constants ──────────────────────────────────────────────────
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── MonthCalendar component ───────────────────────────────────────────────────
function MonthCalendar({ selectedDay, onSelectDay, busyDays, calMonth, onChangeMonth }) {
  const year = calMonth.getFullYear();
  const m    = calMonth.getMonth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstWeekday = new Date(year, m, 1).getDay();
  const daysInMonth  = new Date(year, m + 1, 0).getDate();

  // Split into rows of 7
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const rows = [];
  for (let r = 0; r < totalCells / 7; r++) {
    const row = [];
    for (let c = 0; c < 7; c++) {
      const dayNum = r * 7 + c - firstWeekday + 1;
      row.push(dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null);
    }
    rows.push(row);
  }

  return (
    <View style={calStyles.calendar}>
      {/* Month navigation */}
      <View style={calStyles.monthHeader}>
        <TouchableOpacity
          onPress={() => onChangeMonth(-1)}
          hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
          style={calStyles.monthArrow}
        >
          <Ionicons name="chevron-back" size={20} color="#2563EB" />
        </TouchableOpacity>
        <Text style={calStyles.monthTitle}>{MONTH_NAMES[m]} {year}</Text>
        <TouchableOpacity
          onPress={() => onChangeMonth(1)}
          hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
          style={calStyles.monthArrow}
        >
          <Ionicons name="chevron-forward" size={20} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Day-of-week header */}
      <View style={calStyles.dayLabelsRow}>
        {DAY_LABELS.map(l => (
          <Text key={l} style={calStyles.dayLabelText}>{l}</Text>
        ))}
      </View>

      {/* Day grid */}
      {rows.map((row, ri) => (
        <View key={ri} style={calStyles.weekRow}>
          {row.map((dayNum, ci) => {
            if (!dayNum) return <View key={ci} style={calStyles.dayCell} />;

            const cellDate = new Date(year, m, dayNum);
            cellDate.setHours(0, 0, 0, 0);
            const isPast       = cellDate < today;
            const ymd          = toYMD(cellDate);
            const isBusy       = busyDays.has(ymd);
            const isSelected   = selectedDay && toYMD(selectedDay) === ymd;
            const isToday      = toYMD(today) === ymd;

            return (
              <TouchableOpacity
                key={ci}
                style={[
                  calStyles.dayCell,
                  isSelected && calStyles.dayCellSelected,
                  isToday && !isSelected && calStyles.dayCellToday,
                  isPast && calStyles.dayCellPast,
                ]}
                onPress={() => !isPast && onSelectDay(cellDate)}
                disabled={isPast}
                activeOpacity={0.75}
              >
                <Text style={[
                  calStyles.dayCellText,
                  isSelected && calStyles.dayCellTextSelected,
                  isToday && !isSelected && calStyles.dayCellTextToday,
                  isPast && calStyles.dayCellTextPast,
                ]}>
                  {dayNum}
                </Text>
                {isBusy && (
                  <View style={[
                    calStyles.busyDot,
                    isSelected && { backgroundColor: '#fff' },
                  ]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Legend */}
      <View style={calStyles.legend}>
        <View style={calStyles.legendItem}>
          <View style={calStyles.busyDot} />
          <Text style={calStyles.legendText}>Has appointments</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.busyDot, { backgroundColor: '#2563EB', borderRadius: 6 }]} />
          <Text style={calStyles.legendText}>Selected</Text>
        </View>
      </View>
    </View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function RespondToLeadModal({ notification, onClose, onSent }) {
  const { userId } = useContext(UserContext);

  const defaultDate = (() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  })();

  // Calendar state
  const [calMonth,  setCalMonth]  = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d;
  });
  const [busyDays,  setBusyDays]  = useState(new Set());
  const [calConnected, setCalConnected] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);

  // Day / slot selection
  const [selectedDay,   setSelectedDay]   = useState(null);
  const [availableSlots, setAvailableSlots] = useState(null); // null = not fetched yet
  const [loadingSlots,  setLoadingSlots]  = useState(false);
  const [selectedSlot,  setSelectedSlot]  = useState(null);  // { start, end } string pair

  // Appointment date (final value sent)
  const [appointmentDate, setAppointmentDate] = useState(defaultDate);

  // Time picker fallback (no calendar / manual override)
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Price / message
  const [price,          setPrice]          = useState(
    notification?.estimateMin != null && notification?.estimateMax != null
      ? `${Math.round((notification.estimateMin + notification.estimateMax) / 2)}`
      : ''
  );
  const [showOptional,   setShowOptional]   = useState(false);
  const [optionalMessage, setOptionalMessage] = useState('');
  const [sending, setSending] = useState(false);

  // ── Fetch busy days whenever the calendar month changes ──────────────────
  useEffect(() => {
    if (!userId) return;
    const month = `${calMonth.getFullYear()}-${pad(calMonth.getMonth() + 1)}`;
    setLoadingMonth(true);
    fetch(`${NODE_API}/calendar/monthEvents?month=${month}&serviceUserId=${userId}`)
      .then(r => r.json())
      .then(data => {
        setCalConnected(data.connected !== false);
        setBusyDays(new Set(data.busyDays || []));
      })
      .catch(() => {})
      .finally(() => setLoadingMonth(false));
  }, [calMonth, userId]);

  // ── Fetch available slots when a day is selected ─────────────────────────
  const handleSelectDay = useCallback(async (day) => {
    setSelectedDay(day);
    setSelectedSlot(null);
    setAvailableSlots(null);

    // Merge selected day into current appointmentDate (keep existing time)
    const merged = new Date(appointmentDate);
    merged.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    setAppointmentDate(merged);

    if (!userId || !calConnected) return;

    setLoadingSlots(true);
    try {
      const ymd = toYMD(day);
      const res = await fetch(`${NODE_API}/calendar/slots?date=${ymd}&serviceUserId=${userId}`);
      const data = await res.json();
      setAvailableSlots(Array.isArray(data.slots) ? data.slots : []);
    } catch {
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [userId, calConnected, appointmentDate]);

  // ── Select a time slot chip ───────────────────────────────────────────────
  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot);
    const t = parseSlotTime(slot.start, selectedDay || appointmentDate);
    if (t) setAppointmentDate(t);
  };

  const handleChangeMonth = (dir) => {
    setCalMonth(prev => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + dir);
      return next;
    });
  };

  // ── Send the response as a quote message ─────────────────────────────────
  const handleSend = async () => {
    if (!notification?.fromUserId) {
      Alert.alert('Error', "Can't find who to respond to.");
      return;
    }
    setSending(true);
    const dateStr = fmtDate(appointmentDate);
    const timeStr = fmtTime(appointmentDate);

    try {
      const meRes = await fetch(`${NODE_API}/getUserDetails?userId=${userId}`);
      const me = await meRes.json();
      const businessName = me?.displayName || [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Service Provider';

      const quoteData = {
        availability:    `${dateStr} at ${timeStr}`,
        appointmentDate: dateStr,
        appointmentTime: timeStr,
        price:           price.trim() || null,
        note:            showOptional && optionalMessage.trim() ? optionalMessage.trim() : null,
        businessName,
        serviceUserId:   userId,
        requesterId:     notification.fromUserId,
        needText:        notification.needText || null,
        quoteStatus:     'pending',
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

  // ── Android time picker callbacks ─────────────────────────────────────────
  const onAndroidTimeChange = (event, selected) => {
    setShowTimePicker(false);
    if (event.type !== 'dismissed' && selected) {
      const merged = new Date(appointmentDate);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setAppointmentDate(merged);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={!IS_WEB}
      >
        <View style={IS_WEB ? { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' } : { flex: 1 }}>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={IS_WEB ? 31 : 24} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Respond to Request</Text>
            <View style={{ width: IS_WEB ? 42 : 32 }} />
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

            {/* Request banner */}
            {notification?.needText ? (
              <View style={styles.needBanner}>
                <Text style={styles.needBannerLabel}>Request</Text>
                <Text style={styles.needBannerText}>{notification.needText}</Text>
              </View>
            ) : null}

            {/* Suggested price hint */}
            {notification?.estimateMin != null && notification?.estimateMax != null && (
              <View style={styles.estimateHint}>
                <Ionicons name="sparkles-outline" size={14} color="#7C3AED" />
                <Text style={styles.estimateHintText}>
                  Suggested: ${Math.round(notification.estimateMin)}–${Math.round(notification.estimateMax)}
                </Text>
              </View>
            )}

            {/* ── Calendar section ─────────────────────────────────────── */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Select a Date</Text>
              {loadingMonth && <ActivityIndicator size="small" color="#2563EB" style={{ marginLeft: 8 }} />}
            </View>

            {!calConnected && !loadingMonth && (
              <View style={styles.calNoConnectBanner}>
                <Ionicons name="calendar-outline" size={14} color="#6B7280" />
                <Text style={styles.calNoConnectText}>
                  Connect Google Calendar in Settings to see your availability.
                </Text>
              </View>
            )}

            <MonthCalendar
              selectedDay={selectedDay}
              onSelectDay={handleSelectDay}
              busyDays={busyDays}
              calMonth={calMonth}
              onChangeMonth={handleChangeMonth}
            />

            {/* ── Time selection ───────────────────────────────────────── */}
            {selectedDay && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.sectionTitle}>
                  Select a Time
                  {selectedDay ? ` — ${selectedDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}
                </Text>

                {loadingSlots && (
                  <View style={styles.slotsLoading}>
                    <ActivityIndicator color="#2563EB" />
                    <Text style={styles.slotsLoadingText}>Checking your calendar…</Text>
                  </View>
                )}

                {/* Available time slots from Google Calendar */}
                {!loadingSlots && calConnected && availableSlots !== null && (
                  availableSlots.length === 0 ? (
                    <View style={styles.noSlotsWrap}>
                      <Ionicons name="calendar-clear-outline" size={20} color="#94A3B8" />
                      <Text style={styles.noSlotsText}>No open slots this day — pick a different date or set a time manually below.</Text>
                    </View>
                  ) : (
                    <View style={styles.slotsGrid}>
                      {availableSlots.map(slot => {
                        const isChosen = selectedSlot?.start === slot.start;
                        return (
                          <TouchableOpacity
                            key={slot.start}
                            style={[styles.slotChip, isChosen && styles.slotChipSelected]}
                            onPress={() => handleSelectSlot(slot)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.slotChipText, isChosen && styles.slotChipTextSelected]}>
                              {slot.start}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )
                )}

                {/* Manual time override — always available after a day is selected */}
                <View style={styles.manualTimeWrap}>
                  <Text style={styles.manualTimeLabel}>
                    {calConnected && availableSlots?.length > 0 ? 'Or set a custom time:' : 'Set appointment time:'}
                  </Text>

                  {IS_WEB ? (
                    createElement('input', {
                      type: 'time',
                      value: `${pad(appointmentDate.getHours())}:${pad(appointmentDate.getMinutes())}`,
                      onChange: (e) => {
                        if (e.target.value) {
                          const [h, min] = e.target.value.split(':').map(Number);
                          const d = new Date(appointmentDate);
                          d.setHours(h, min, 0, 0);
                          setAppointmentDate(d);
                          setSelectedSlot(null);
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
                    <DateTimePicker
                      value={appointmentDate}
                      mode="time"
                      display="spinner"
                      minimumDate={new Date()}
                      onChange={(_, sel) => { if (sel) { setAppointmentDate(sel); setSelectedSlot(null); } }}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.androidTimeBtn}
                        onPress={() => setShowTimePicker(true)}
                      >
                        <Ionicons name="time-outline" size={16} color="#2563EB" />
                        <Text style={styles.androidTimeBtnTxt}>{fmtTime(appointmentDate)}</Text>
                        <Ionicons name="chevron-down" size={14} color="#2563EB" />
                      </TouchableOpacity>
                      {showTimePicker && (
                        <DateTimePicker
                          value={appointmentDate}
                          mode="time"
                          display="default"
                          onChange={onAndroidTimeChange}
                        />
                      )}
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Prompt if no day selected yet */}
            {!selectedDay && (
              <View style={styles.tapDatePrompt}>
                <Ionicons name="finger-print-outline" size={18} color="#94A3B8" />
                <Text style={styles.tapDatePromptText}>Tap a date above to see your availability</Text>
              </View>
            )}

            {/* Selected appointment summary */}
            {selectedDay && (
              <View style={styles.selectedSummary}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.selectedSummaryText}>
                  {fmtDate(appointmentDate)} at {fmtTime(appointmentDate)}
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* Estimated price */}
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

            {/* Optional message */}
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
              style={[styles.sendBtn, (sending || !selectedDay) && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={sending || !selectedDay}
            >
              <Text style={styles.sendBtnText}>{sending ? 'Sending…' : 'Send Response'}</Text>
            </TouchableOpacity>
            <View style={{ height: 36 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Calendar styles ───────────────────────────────────────────────────────────
const calStyles = StyleSheet.create({
  calendar: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: IS_WEB ? 16 : 12,
    marginBottom: 4,
  },
  monthHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: IS_WEB ? 16 : 12,
  },
  monthArrow: { padding: 4 },
  monthTitle: { fontSize: IS_WEB ? 18 : 15, fontWeight: '800', color: '#0F172A' },
  dayLabelsRow: { flexDirection: 'row', marginBottom: IS_WEB ? 10 : 6 },
  dayLabelText: {
    width: `${100/7}%`,
    textAlign: 'center',
    fontSize: IS_WEB ? 13 : 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  weekRow: { flexDirection: 'row', marginBottom: IS_WEB ? 6 : 4 },
  dayCell: {
    width: `${100/7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    position: 'relative',
  },
  dayCellSelected: { backgroundColor: '#2563EB' },
  dayCellToday: { backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#BFDBFE' },
  dayCellPast: { opacity: 0.3 },
  dayCellText: { fontSize: IS_WEB ? 15 : 13, fontWeight: '600', color: '#1E293B' },
  dayCellTextSelected: { color: '#fff', fontWeight: '800' },
  dayCellTextToday: { color: '#2563EB', fontWeight: '800' },
  dayCellTextPast: { color: '#94A3B8' },
  busyDot: {
    position: 'absolute', bottom: IS_WEB ? 5 : 3,
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: '#F59E0B',
  },
  legend: {
    flexDirection: 'row', gap: IS_WEB ? 20 : 14,
    marginTop: IS_WEB ? 14 : 10, paddingTop: IS_WEB ? 10 : 8,
    borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText:  { fontSize: IS_WEB ? 12 : 11, color: '#6B7280' },
});

// ── Modal styles ──────────────────────────────────────────────────────────────
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

  body: { paddingHorizontal: IS_WEB ? 26 : 16, paddingTop: IS_WEB ? 22 : 18 },

  needBanner: {
    backgroundColor: '#F8FAFC', borderRadius: IS_WEB ? 16 : 12,
    padding: IS_WEB ? 18 : 14, marginBottom: IS_WEB ? 16 : 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  needBannerLabel: { fontSize: IS_WEB ? 14 : 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 },
  needBannerText:  { fontSize: IS_WEB ? 18 : 14, color: '#0F172A', lineHeight: IS_WEB ? 26 : 20 },

  estimateHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F5F3FF', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: IS_WEB ? 20 : 16,
    alignSelf: 'flex-start',
  },
  estimateHintText: { fontSize: IS_WEB ? 14 : 13, color: '#7C3AED', fontWeight: '600' },

  sectionRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: IS_WEB ? 12 : 8 },
  sectionTitle:{ fontSize: IS_WEB ? 18 : 15, fontWeight: '800', color: '#0F172A', marginBottom: IS_WEB ? 12 : 8 },

  calNoConnectBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F9FAFB', borderRadius: 10,
    padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  calNoConnectText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 17 },

  slotsLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  slotsLoadingText: { fontSize: 14, color: '#64748B' },

  noSlotsWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFF7ED', borderRadius: 10,
    padding: 12, marginBottom: 12,
  },
  noSlotsText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },

  slotsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: IS_WEB ? 10 : 8,
    marginBottom: IS_WEB ? 16 : 12,
  },
  slotChip: {
    paddingHorizontal: IS_WEB ? 18 : 14,
    paddingVertical: IS_WEB ? 10 : 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  slotChipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  slotChipText:     { fontSize: IS_WEB ? 15 : 13, fontWeight: '700', color: '#2563EB' },
  slotChipTextSelected: { color: '#fff' },

  manualTimeWrap: { marginTop: IS_WEB ? 12 : 8 },
  manualTimeLabel: { fontSize: IS_WEB ? 13 : 12, color: '#64748B', fontWeight: '600', marginBottom: IS_WEB ? 10 : 8 },

  androidTimeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 13,
    borderRadius: 12, backgroundColor: '#EFF6FF',
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  androidTimeBtnTxt: { flex: 1, fontSize: 15, fontWeight: '700', color: '#2563EB' },

  tapDatePrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 10,
    padding: 14, marginTop: 8, marginBottom: 4,
  },
  tapDatePromptText: { fontSize: 14, color: '#94A3B8', fontStyle: 'italic' },

  selectedSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#F0FDF4', borderRadius: 10,
    padding: 12, marginTop: IS_WEB ? 14 : 10,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  selectedSummaryText: { fontSize: IS_WEB ? 15 : 13, color: '#15803D', fontWeight: '600' },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: IS_WEB ? 22 : 18 },

  priceRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: IS_WEB ? 13 : 10,
    paddingHorizontal: IS_WEB ? 18 : 14, backgroundColor: '#F8FAFC',
  },
  priceDollar: { fontSize: IS_WEB ? 21 : 16, fontWeight: '700', color: '#475569', marginRight: IS_WEB ? 5 : 4 },
  priceInput:  { flex: 1, fontSize: IS_WEB ? 21 : 16, color: '#0F172A', paddingVertical: IS_WEB ? 16 : 12 },

  checkboxRow:   { flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 13 : 10 },
  checkboxLabel: { fontSize: IS_WEB ? 20 : 15, fontWeight: '600', color: '#1E293B' },
  optionalInput: {
    marginTop: IS_WEB ? 16 : 12, minHeight: IS_WEB ? 100 : 80,
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: IS_WEB ? 13 : 10, padding: IS_WEB ? 16 : 12,
    fontSize: IS_WEB ? 18 : 14, color: '#0F172A',
    backgroundColor: '#F8FAFC', textAlignVertical: 'top',
  },

  sendBtn:     { height: IS_WEB ? 68 : 52, borderRadius: IS_WEB ? 16 : 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { fontSize: IS_WEB ? 20 : 15, fontWeight: '800', color: '#fff' },
});
