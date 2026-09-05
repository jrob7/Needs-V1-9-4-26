// Screens/QuoteBubble.js
// New appointment scheduling flow:
//   Accept Quote → auto-schedules using business's quoted availability
//   Request Different Time → picker → timeRequest message to business
//   Business: Accept → auto-confirms | Suggest Another Time → counter message
//   Customer: Confirm Appointment → auto-schedules counter time
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { scheduleAppointmentReminder, scheduleAppointmentFollowUp } from '../utils/appointmentReminders';

import { NODE_API } from '../config';
import { IS_WEB } from '../webLayout';
import { authFetch } from '../server/api';

const formatDate = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

// Manual time format — avoids U+202F narrow no-break space that iOS inserts before AM/PM
const formatTime = (d) => {
  const h    = d.getHours();
  const m    = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

// ── Shared helper: create appointment + confirmation message + notifications ───
async function confirmAppointment({ date, time, quoteData, quoteMessageId, conversationId, senderId, recipientId }) {
  const aptRes = await authFetch(`${NODE_API}/appointments`, {
    method: 'POST',
    body: JSON.stringify({
      serviceUserId:  quoteData.serviceUserId,
      requesterId:    quoteData.requesterId || senderId,
      conversationId,
      quoteMessageId,
      needText:       quoteData.needText,
      businessName:   quoteData.businessName,
      price:          quoteData.price,
      date,
      time,
    }),
  });
  if (!aptRes.ok) throw new Error('Server error');
  const apt = await aptRes.json();

  // Mark original quote confirmed
  await authFetch(`${NODE_API}/messages/${quoteMessageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: { ...quoteData, quoteStatus: 'confirmed', date, time, appointmentId: apt._id },
    }),
  });

  // System confirmation message in thread
  await authFetch(`${NODE_API}/sendMessage`, {
    method: 'POST',
    body: JSON.stringify({
      recipientId,
      text:           `✅ Appointment confirmed: ${date} at ${time}`,
      type:           'appointmentConfirmed',
      data:           { date, time, businessName: quoteData.businessName, price: quoteData.price, appointmentId: apt._id },
      regardingTitle: quoteData.needText || null,
    }),
  });

  const aptPayload = {
    _id:           apt._id,
    date,
    time,
    businessName:  quoteData.businessName,
    needText:      quoteData.needText,
    serviceUserId: quoteData.serviceUserId,
    requesterId:   quoteData.requesterId || senderId,
  };
  // Schedule on the current user's device only.
  // The business schedules their own follow-up when they open the appointment.
  scheduleAppointmentReminder(aptPayload).catch(() => {});
  scheduleAppointmentFollowUp(aptPayload, 'requester').catch(() => {});

  return apt;
}

// ── Date/time picker sub-component ───────────────────────────────────────────
function AppointmentPicker({ onConfirm, submitting, confirmLabel = 'Confirm' }) {
  const defaultDate = (() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  })();

  const [pickedDate, setPickedDate]           = useState(defaultDate);
  const [showAndroidPicker, setShowAndroid]   = useState(false);
  const [androidMode, setAndroidMode]         = useState('date');

  const onAndroidChange = (event, selected) => {
    if (event.type === 'dismissed') { setShowAndroid(false); return; }
    if (selected) {
      if (androidMode === 'date') {
        const merged = new Date(selected);
        merged.setHours(pickedDate.getHours(), pickedDate.getMinutes(), 0, 0);
        setPickedDate(merged);
        setAndroidMode('time');
      } else {
        const merged = new Date(pickedDate);
        merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        setPickedDate(merged);
        setShowAndroid(false);
      }
    }
  };

  return (
    <View style={styles.stepBox}>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={pickedDate}
          mode="datetime"
          display="spinner"
          minimumDate={new Date()}
          onChange={(_, d) => { if (d) setPickedDate(d); }}
          style={styles.iosPicker}
        />
      ) : (
        <TouchableOpacity
          style={styles.androidDateBtn}
          onPress={() => { setAndroidMode('date'); setShowAndroid(true); }}
        >
          <Ionicons name="calendar-outline" size={IS_WEB ? 20 : 15} color="#2563EB" />
          <Text style={styles.androidDateBtnTxt}>
            {formatDate(pickedDate)} at {formatTime(pickedDate)}
          </Text>
          <Ionicons name="chevron-down" size={IS_WEB ? 17 : 13} color="#2563EB" />
        </TouchableOpacity>
      )}

      {showAndroidPicker && (
        <DateTimePicker
          value={pickedDate}
          mode={androidMode}
          display="default"
          minimumDate={new Date()}
          onChange={onAndroidChange}
        />
      )}

      <TouchableOpacity
        style={[styles.confirmBtn, submitting && styles.confirmBtnDisabled]}
        onPress={() => onConfirm(formatDate(pickedDate), formatTime(pickedDate))}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.confirmBtnTxt}>{confirmLabel}</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Confirmed summary card ────────────────────────────────────────────────────
function ConfirmedCard({ data }) {
  return (
    <View style={styles.confirmedBox}>
      <View style={styles.confirmedRow}>
        <Ionicons name="checkmark-circle" size={IS_WEB ? 23 : 18} color="#16A34A" />
        <Text style={styles.confirmedTitle}>Appointment Confirmed</Text>
      </View>
      <Text style={styles.confirmedDetail}>{data.date}</Text>
      <Text style={styles.confirmedDetail}>{data.time}</Text>
      {data.price && <Text style={styles.confirmedDetail}>💰 ${data.price}</Text>}
    </View>
  );
}

// ── Main QuoteBubble ──────────────────────────────────────────────────────────
export default function QuoteBubble({ message, isMine, userId, conversationId, onUpdated }) {
  const data        = message.data || {};
  const quoteStatus = data.quoteStatus || 'pending';

  const initialStep =
    quoteStatus === 'confirmed'     ? 'confirmed'       :
    quoteStatus === 'timeRequested' ? 'timeRequestSent' : 'quote';

  const [step,           setStep]           = useState(initialStep);
  const [sendingAccept,  setSendingAccept]  = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);

  const patchMessage = async (newData) => {
    const merged = { ...data, ...newData };
    await authFetch(`${NODE_API}/messages/${message._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: merged }),
    });
    onUpdated?.({ ...message, data: merged });
    return merged;
  };

  // ── Business read-only view ──────────────────────────────────────────────
  if (isMine) {
    const statusMap = {
      confirmed:     { bg: '#DCFCE7', text: '#16A34A', label: 'Confirmed' },
      timeRequested: { bg: '#FEF9C3', text: '#92400E', label: 'Time Requested' },
      accepted:      { bg: '#DCFCE7', text: '#16A34A', label: 'Accepted' },
    };
    const sc = statusMap[quoteStatus] || { bg: '#FFF7ED', text: '#EA580C', label: quoteStatus.charAt(0).toUpperCase() + quoteStatus.slice(1) };

    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="document-text" size={IS_WEB ? 20 : 15} color="#2563EB" />
          <Text style={styles.cardBizName} numberOfLines={1}>Quote Sent</Text>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusTxt, { color: sc.text }]}>{sc.label}</Text>
          </View>
        </View>
        <Text style={styles.metaLine}>🕐 {data.availability}</Text>
        {data.price && <Text style={styles.metaLine}>💰 Estimated: ${data.price}</Text>}
        {quoteStatus === 'confirmed' && data.date && <ConfirmedCard data={data} />}
      </View>
    );
  }

  // ── Confirmed ────────────────────────────────────────────────────────────
  if (step === 'confirmed') {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="document-text" size={IS_WEB ? 20 : 15} color="#2563EB" />
          <Text style={styles.cardBizName} numberOfLines={1}>{data.businessName}</Text>
        </View>
        <ConfirmedCard data={data} />
      </View>
    );
  }

  // ── Time request sent — waiting for business ─────────────────────────────
  if (step === 'timeRequestSent') {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="document-text" size={IS_WEB ? 20 : 15} color="#2563EB" />
          <Text style={styles.cardBizName} numberOfLines={1}>{data.businessName}</Text>
        </View>
        <View style={styles.waitBadge}>
          <Ionicons name="time-outline" size={IS_WEB ? 18 : 14} color="#92400E" />
          <Text style={styles.waitBadgeTxt}>Time request sent — awaiting response</Text>
        </View>
        {data.price && <Text style={styles.metaLine}>💰 Estimated Price: ${data.price}</Text>}
      </View>
    );
  }

  // ── Request Different Time — date/time picker ────────────────────────────
  if (step === 'requestingTime') {
    const handleSendRequest = async (resolvedDate, timeSlot) => {
      setSendingRequest(true);
      try {
        await patchMessage({ quoteStatus: 'timeRequested' });
        await authFetch(`${NODE_API}/sendMessage`, {
          method: 'POST',
          body: JSON.stringify({
            recipientId: data.serviceUserId,
            text:        `📅 Customer requested: ${resolvedDate} at ${timeSlot}`,
            type:        'timeRequest',
            data: {
              requestedDate:  resolvedDate,
              requestedTime:  timeSlot,
              quoteMessageId: message._id,
              serviceUserId:  data.serviceUserId,
              requesterId:    data.requesterId || userId,
              businessName:   data.businessName,
              needText:       data.needText,
              price:          data.price,
              conversationId,
              status:         'pending',
            },
            regardingTitle: data.needText || null,
          }),
        });
        setStep('timeRequestSent');
      } catch {
        Alert.alert('Error', 'Could not send time request. Please try again.');
      } finally {
        setSendingRequest(false);
      }
    };

    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="document-text" size={IS_WEB ? 20 : 15} color="#2563EB" />
          <Text style={styles.cardBizName} numberOfLines={1}>{data.businessName}</Text>
        </View>
        <Text style={styles.stepTitle}>Request a Different Time</Text>
        <AppointmentPicker
          onConfirm={handleSendRequest}
          submitting={sendingRequest}
          confirmLabel="Send Time Request"
        />
      </View>
    );
  }

  // ── Step 1: Quote — Accept (auto-schedule) or Request Different Time ──────
  const handleAccept = async () => {
    setSendingAccept(true);
    try {
      // Use the structured date/time fields if available (new flow);
      // fall back to the raw availability string for old quotes.
      const apptDate = data.appointmentDate || data.availability;
      const apptTime = data.appointmentTime || 'As Agreed';
      const apt = await confirmAppointment({
        date:           apptDate,
        time:           apptTime,
        quoteData:      data,
        quoteMessageId: message._id,
        conversationId,
        senderId:       userId,
        recipientId:    data.serviceUserId,
      });
      await patchMessage({ quoteStatus: 'confirmed', date: apptDate, time: apptTime, appointmentId: apt._id });
      setStep('confirmed');
    } catch {
      Alert.alert('Error', 'Could not confirm appointment. Please try again.');
    } finally {
      setSendingAccept(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Ionicons name="document-text" size={IS_WEB ? 20 : 15} color="#2563EB" />
        <Text style={styles.cardBizName} numberOfLines={1}>1. {data.businessName}</Text>
      </View>
      <Text style={styles.metaLine}>🕐 Available: {data.availability}</Text>
      {data.price && <Text style={styles.metaLine}>💰 Estimated Price: ${data.price}</Text>}
      {data.note  && <Text style={styles.noteText}>{data.note}</Text>}

      <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept} disabled={sendingAccept}>
        {sendingAccept
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.acceptBtnTxt}>Accept Quote</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.altBtn}
        onPress={() => setStep('requestingTime')}
        disabled={sendingAccept}
      >
        <Ionicons name="calendar-outline" size={IS_WEB ? 18 : 14} color="#2563EB" />
        <Text style={styles.altBtnTxt}>Request Different Time</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── AppointmentConfirmedBubble (system message) ───────────────────────────────
export function AppointmentConfirmedBubble({ message }) {
  const data = message.data || {};
  return (
    <View style={[styles.card, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
      <View style={styles.cardHeaderRow}>
        <Ionicons name="checkmark-circle" size={IS_WEB ? 23 : 18} color="#16A34A" />
        <Text style={[styles.cardBizName, { color: '#16A34A' }]}>Appointment Confirmed</Text>
      </View>
      {data.businessName && <Text style={styles.metaLine}>🏢 {data.businessName}</Text>}
      <Text style={styles.metaLine}>📅 {data.date}</Text>
      <Text style={styles.metaLine}>🕐 {data.time}</Text>
      {data.price && <Text style={styles.metaLine}>💰 ${data.price}</Text>}
      <Text style={styles.waitNote}>Both parties have been notified.</Text>
    </View>
  );
}

// ── TimeRequestBubble — business receives customer's time request ──────────────
export function TimeRequestBubble({ message, isMine, userId, conversationId, onUpdated }) {
  const data = message.data || {};
  const [step,       setStep]       = useState(data.status || 'pending');
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const patchMessage = async (newData) => {
    const merged = { ...data, ...newData };
    await authFetch(`${NODE_API}/messages/${message._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: merged }),
    });
    onUpdated?.({ ...message, data: merged });
  };

  // Requester (sender) sees read-only status
  if (isMine) {
    return (
      <View style={[styles.card, styles.timeRequestCard]}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="calendar-outline" size={IS_WEB ? 20 : 15} color="#7C3AED" />
          <Text style={styles.cardBizName} numberOfLines={1}>Your Time Request</Text>
        </View>
        <Text style={styles.metaLine}>📅 {data.requestedDate}</Text>
        <Text style={styles.metaLine}>🕐 {data.requestedTime}</Text>
        {step === 'accepted'  && <Text style={styles.acceptedNote}>✅ Business accepted your time request</Text>}
        {step === 'countered' && <Text style={styles.acceptedNote}>💬 Business suggested a different time</Text>}
        {step === 'pending'   && <Text style={styles.waitNote}>Waiting for business to respond…</Text>}
      </View>
    );
  }

  // Business already responded (read-only)
  if (step === 'accepted') {
    return (
      <View style={[styles.card, styles.timeRequestCard]}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="checkmark-circle" size={IS_WEB ? 20 : 15} color="#16A34A" />
          <Text style={styles.cardBizName}>Customer Request — Accepted</Text>
        </View>
        <Text style={styles.metaLine}>📅 {data.requestedDate}</Text>
        <Text style={styles.metaLine}>🕐 {data.requestedTime}</Text>
      </View>
    );
  }

  if (step === 'countered') {
    return (
      <View style={[styles.card, styles.timeRequestCard]}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="calendar-outline" size={IS_WEB ? 20 : 15} color="#7C3AED" />
          <Text style={styles.cardBizName}>Customer Request — Counter Sent</Text>
        </View>
        <Text style={styles.metaLine}>📅 {data.requestedDate}</Text>
        <Text style={styles.metaLine}>🕐 {data.requestedTime}</Text>
      </View>
    );
  }

  // Business: "Suggest Another Time" picker
  if (showPicker) {
    const handleCounter = async (resolvedDate, timeSlot) => {
      setSubmitting(true);
      try {
        await patchMessage({ status: 'countered' });
        await authFetch(`${NODE_API}/sendMessage`, {
          method: 'POST',
          body: JSON.stringify({
            recipientId: data.requesterId,
            text:        `📅 Business suggested: ${resolvedDate} at ${timeSlot}`,
            type:        'timeCounterSuggestion',
            data: {
              suggestedDate:  resolvedDate,
              suggestedTime:  timeSlot,
              quoteMessageId: data.quoteMessageId,
              serviceUserId:  data.serviceUserId,
              requesterId:    data.requesterId,
              businessName:   data.businessName,
              needText:       data.needText,
              price:          data.price,
              conversationId: data.conversationId || conversationId,
              status:         'pending',
            },
            regardingTitle: data.needText || null,
          }),
        });
        setStep('countered');
        setShowPicker(false);
      } catch {
        Alert.alert('Error', 'Could not send counter suggestion. Please try again.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <View style={[styles.card, styles.timeRequestCard]}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="calendar-outline" size={IS_WEB ? 20 : 15} color="#7C3AED" />
          <Text style={styles.cardBizName}>Suggest Another Time</Text>
        </View>
        <AppointmentPicker
          onConfirm={handleCounter}
          submitting={submitting}
          confirmLabel="Send Counter Suggestion"
        />
      </View>
    );
  }

  // Business: pending — action buttons
  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const quoteData = {
        serviceUserId: data.serviceUserId,
        requesterId:   data.requesterId,
        businessName:  data.businessName,
        needText:      data.needText,
        price:         data.price,
      };
      await confirmAppointment({
        date:           data.requestedDate,
        time:           data.requestedTime,
        quoteData,
        quoteMessageId: data.quoteMessageId,
        conversationId: data.conversationId || conversationId,
        senderId:       userId,
        recipientId:    data.requesterId,
      });
      await patchMessage({ status: 'accepted' });
      setStep('accepted');
    } catch {
      Alert.alert('Error', 'Could not confirm appointment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.card, styles.timeRequestCard]}>
      <View style={styles.cardHeaderRow}>
        <Ionicons name="calendar-outline" size={IS_WEB ? 20 : 15} color="#7C3AED" />
        <Text style={styles.cardBizName} numberOfLines={1}>Customer Requested</Text>
      </View>
      <Text style={styles.metaLine}>📅 {data.requestedDate}</Text>
      <Text style={styles.metaLine}>🕐 {data.requestedTime}</Text>

      <TouchableOpacity
        style={[styles.acceptBtn, submitting && styles.confirmBtnDisabled]}
        onPress={handleAccept}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.acceptBtnTxt}>Accept</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.altBtn, styles.altBtnPurple]}
        onPress={() => setShowPicker(true)}
        disabled={submitting}
      >
        <Ionicons name="calendar-outline" size={IS_WEB ? 18 : 14} color="#7C3AED" />
        <Text style={[styles.altBtnTxt, { color: '#7C3AED' }]}>Suggest Another Time</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── TimeCounterBubble — customer sees business's counter-suggestion ────────────
export function TimeCounterBubble({ message, isMine, userId, conversationId, onUpdated }) {
  const data = message.data || {};
  const [confirmed,  setConfirmed]  = useState(data.status === 'confirmed');
  const [submitting, setSubmitting] = useState(false);

  const patchMessage = async (newData) => {
    const merged = { ...data, ...newData };
    await authFetch(`${NODE_API}/messages/${message._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: merged }),
    });
    onUpdated?.({ ...message, data: merged });
  };

  // Business (sender) read-only
  if (isMine) {
    return (
      <View style={[styles.card, styles.counterCard]}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="calendar-outline" size={IS_WEB ? 20 : 15} color="#7C3AED" />
          <Text style={styles.cardBizName} numberOfLines={1}>Counter Suggestion Sent</Text>
        </View>
        <Text style={styles.metaLine}>📅 {data.suggestedDate}</Text>
        <Text style={styles.metaLine}>🕐 {data.suggestedTime}</Text>
        {confirmed && <Text style={styles.acceptedNote}>✅ Customer confirmed this time</Text>}
        {!confirmed && <Text style={styles.waitNote}>Waiting for customer to confirm…</Text>}
      </View>
    );
  }

  // Already confirmed
  if (confirmed) {
    return (
      <View style={[styles.card, styles.counterCard]}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="checkmark-circle" size={IS_WEB ? 20 : 15} color="#16A34A" />
          <Text style={styles.cardBizName}>Appointment Confirmed</Text>
        </View>
        <Text style={styles.metaLine}>📅 {data.suggestedDate}</Text>
        <Text style={styles.metaLine}>🕐 {data.suggestedTime}</Text>
      </View>
    );
  }

  // Customer: show counter, "Confirm Appointment" button
  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const quoteData = {
        serviceUserId: data.serviceUserId,
        requesterId:   data.requesterId,
        businessName:  data.businessName,
        needText:      data.needText,
        price:         data.price,
      };
      await confirmAppointment({
        date:           data.suggestedDate,
        time:           data.suggestedTime,
        quoteData,
        quoteMessageId: data.quoteMessageId,
        conversationId: data.conversationId || conversationId,
        senderId:       userId,
        recipientId:    data.serviceUserId,
      });
      await patchMessage({ status: 'confirmed' });
      setConfirmed(true);
    } catch {
      Alert.alert('Error', 'Could not confirm appointment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.card, styles.counterCard]}>
      <View style={styles.cardHeaderRow}>
        <Ionicons name="calendar-outline" size={IS_WEB ? 20 : 15} color="#7C3AED" />
        <Text style={styles.cardBizName} numberOfLines={1}>{data.businessName}</Text>
      </View>
      <Text style={styles.stepTitle}>Business Suggested</Text>
      <Text style={styles.metaLine}>📅 {data.suggestedDate}</Text>
      <Text style={styles.metaLine}>🕐 {data.suggestedTime}</Text>
      {data.price && <Text style={styles.metaLine}>💰 ${data.price}</Text>}

      <TouchableOpacity
        style={[styles.confirmBtn, submitting && styles.confirmBtnDisabled]}
        onPress={handleConfirm}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.confirmBtnTxt}>Confirm Appointment</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: IS_WEB ? 21 : 16, padding: IS_WEB ? 18 : 14,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    maxWidth: '96%', minWidth: IS_WEB ? 312 : 240, marginBottom: IS_WEB ? 5 : 4,
  },
  timeRequestCard: { borderColor: '#DDD6FE', backgroundColor: '#FAFAFF' },
  counterCard:     { borderColor: '#DDD6FE', backgroundColor: '#FAFAFF' },

  cardHeaderRow:   { flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 8 : 6, marginBottom: IS_WEB ? 10 : 8 },
  cardBizName:     { fontSize: IS_WEB ? 18 : 14, fontWeight: '800', color: '#0F172A', flex: 1, flexShrink: 1 },
  statusBadge:     { borderRadius: IS_WEB ? 10 : 8, paddingHorizontal: IS_WEB ? 10 : 8, paddingVertical: IS_WEB ? 4 : 3, flexShrink: 0 },
  statusTxt:       { fontSize: IS_WEB ? 13 : 10, fontWeight: '800' },

  metaLine:  { fontSize: IS_WEB ? 18 : 14, color: '#1E293B', marginBottom: IS_WEB ? 7 : 5 },
  noteText:  { fontSize: IS_WEB ? 17 : 13, color: '#475569', fontStyle: 'italic', marginBottom: IS_WEB ? 10 : 8 },
  waitNote:  { fontSize: IS_WEB ? 16 : 12, color: '#64748B', marginTop: IS_WEB ? 8 : 6, fontStyle: 'italic' },
  stepTitle: { fontSize: IS_WEB ? 18 : 14, fontWeight: '800', color: '#0F172A', marginBottom: IS_WEB ? 13 : 10 },

  acceptedNote: { fontSize: IS_WEB ? 16 : 12, color: '#16A34A', fontWeight: '700', marginTop: IS_WEB ? 8 : 6 },

  waitBadge:    { flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 8 : 6, backgroundColor: '#FEF9C3', borderRadius: IS_WEB ? 10 : 8, paddingHorizontal: IS_WEB ? 13 : 10, paddingVertical: IS_WEB ? 8 : 6, marginBottom: IS_WEB ? 10 : 8, alignSelf: 'flex-start' },
  waitBadgeTxt: { fontSize: IS_WEB ? 16 : 12, fontWeight: '700', color: '#92400E' },

  acceptBtn:    { height: IS_WEB ? 60 : 46, borderRadius: IS_WEB ? 16 : 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginTop: IS_WEB ? 16 : 12 },
  acceptBtnTxt: { fontSize: IS_WEB ? 20 : 15, fontWeight: '800', color: '#fff' },

  altBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: IS_WEB ? 8 : 6, height: IS_WEB ? 52 : 40, borderRadius: IS_WEB ? 16 : 12, borderWidth: 1.5, borderColor: '#2563EB', marginTop: IS_WEB ? 10 : 8 },
  altBtnPurple: { borderColor: '#7C3AED' },
  altBtnTxt:    { fontSize: IS_WEB ? 18 : 14, fontWeight: '700', color: '#2563EB' },

  // Picker
  stepBox:           { marginTop: IS_WEB ? 5 : 4 },
  iosPicker:        { width: '100%', marginBottom: IS_WEB ? 5 : 4 },
  androidDateBtn:   { flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 10 : 8, paddingHorizontal: IS_WEB ? 18 : 14, paddingVertical: IS_WEB ? 16 : 12, borderRadius: IS_WEB ? 13 : 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', marginBottom: IS_WEB ? 13 : 10 },
  androidDateBtnTxt:{ flex: 1, fontSize: IS_WEB ? 18 : 14, fontWeight: '700', color: '#2563EB' },
  confirmBtn:        { height: IS_WEB ? 60 : 46, borderRadius: IS_WEB ? 16 : 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginTop: IS_WEB ? 18 : 14 },
  confirmBtnDisabled:{ backgroundColor: '#93C5FD' },
  confirmBtnTxt:     { fontSize: IS_WEB ? 20 : 15, fontWeight: '800', color: '#fff' },

  // Confirmed card
  confirmedBox:    { marginTop: IS_WEB ? 13 : 10, padding: IS_WEB ? 16 : 12, backgroundColor: '#F0FDF4', borderRadius: IS_WEB ? 13 : 10 },
  confirmedRow:    { flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 8 : 6, marginBottom: IS_WEB ? 8 : 6 },
  confirmedTitle:  { fontSize: IS_WEB ? 17 : 13, fontWeight: '800', color: '#0F172A' },
  confirmedDetail: { fontSize: IS_WEB ? 18 : 14, fontWeight: '600', color: '#1E293B', marginBottom: IS_WEB ? 3 : 2 },
});
