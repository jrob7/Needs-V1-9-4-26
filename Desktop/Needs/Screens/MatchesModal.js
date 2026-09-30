// Screens/MatchesModal.js
// User-facing service quote cards — BroadSummaryCard style.
// Tap card → ServiceDetailModal with confirm / reschedule / answer-questions.
import React, { createElement, useState, useRef, useCallback, useEffect } from 'react';
import {
  Modal, View, Text, Image, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, FlatList, Alert, Platform, ActivityIndicator,
  Dimensions, KeyboardAvoidingView, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { NODE_API } from '../config';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

const { width: SW } = Dimensions.get('window');
const CARD_W = IS_WEB ? Math.min(400, SW - 48) : SW - 32;

// Resolve a raw portfolio URL the same way Tab2Content does.
// Handles: full http URL, MongoDB ObjectId filename, relative path, or null.
const DEFAULT_SERVICE_IMG = 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80';
const resolveServiceImg = (url) => {
  if (!url) return DEFAULT_SERVICE_IMG;
  if (url.startsWith('http')) return url;
  if (/^[0-9a-f]{24}$/i.test(url)) return `${NODE_API}/images/${url}`;
  return `${NODE_API}/uploads/${url}`;
};

const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (d) => {
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
};

// ── Avatar helper ─────────────────────────────────────────────────────────────
function BusinessAvatar({ picUrl, name, size = 64 }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  if (picUrl && !failed) {
    return (
      <Image
        source={{ uri: picUrl }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#E2E8F0' }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.35, fontWeight: '800', color: '#fff' }}>{initials}</Text>
    </View>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending_business:          { label: 'Awaiting Quote',     bg: '#FEF3C7', fg: '#92400E' },
    business_confirmed:        { label: 'Quote Ready',        bg: '#DCFCE7', fg: '#166534' },
    business_edited:           { label: 'Quote Updated',      bg: '#DCFCE7', fg: '#166534' },
    awaiting_user_info:        { label: 'Answer Needed',      bg: '#EDE9FE', fg: '#5B21B6' },
    user_info_provided:        { label: 'Answers Sent',       bg: '#E0F2FE', fg: '#075985' },
    user_requested_reschedule: { label: 'Reschedule Pending', bg: '#FEF3C7', fg: '#92400E' },
    appointment_confirmed:     { label: '✓ Confirmed',        bg: '#DCFCE7', fg: '#14532D' },
    cancelled:                 { label: 'Cancelled',          bg: '#FEE2E2', fg: '#991B1B' },
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
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [sending, setSending] = useState(false);
  const fmtD = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

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
            type: 'date',
            style: { fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', marginBottom: 8, width: '100%' },
            value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
            min: (() => { const t = new Date(); t.setDate(t.getDate() + 1); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; })(),
            onChange: (e) => { if (e.target.value) { const [y, mo, d] = e.target.value.split('-').map(Number); const nd = new Date(date); nd.setFullYear(y, mo - 1, d); setDate(nd); } },
          })}
          {createElement('input', {
            type: 'time',
            style: { fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', marginBottom: 8 },
            value: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
            onChange: (e) => { if (e.target.value) { const [h, m] = e.target.value.split(':').map(Number); const nd = new Date(date); nd.setHours(h, m, 0, 0); setDate(nd); } },
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
  wrap:     { marginTop: 16, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  title:    { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  btn:      { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#EFF6FF', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  btnTxt:   { flex: 1, fontSize: 14, fontWeight: '700', color: '#2563EB' },
  sendBtn:  { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  sendBtnTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

// ── Answer form ───────────────────────────────────────────────────────────────
function AnswerForm({ quote, onDone }) {
  const questions = quote.infoRequest?.questions || [];
  const [answers, setAnswers] = useState(questions.map(() => ''));
  const [photo, setPhoto] = useState(null);   // { uri, base64 }
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const pickPhoto = async () => {
    if (!IS_WEB) {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to attach a photo.'); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: !IS_WEB, quality: 0.7, base64: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      let b64 = asset.base64 || null;
      // On web, the URI may be a blob: URL — fetch it and convert to base64
      if (!b64 && asset.uri) {
        try {
          const resp = await fetch(asset.uri);
          const blob = await resp.blob();
          b64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result || '').split(',')[1] || null);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (_) { b64 = null; }
      }
      setPhoto({ uri: asset.uri, base64: b64 });
    }
  };

  const handleSend = async () => {
    if (answers.some(a => !a.trim())) { Alert.alert('Answer all questions', 'Please fill in all answers before sending.'); return; }
    setSending(true);
    try {
      let photoUrl = null;
      if (photo?.base64) {
        setUploading(true);
        const up = await fetch(`${NODE_API}/uploadImage`, {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: `data:image/jpeg;base64,${photo.base64}`,
        });
        const upData = await up.json();
        photoUrl = upData?.url || upData?.imageUrl || null;
        setUploading(false);
      }
      const r = await fetch(`${NODE_API}/userRespondToQuote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote._id, action: 'provide_info', answers, photoUrl }),
      });
      if (!r.ok) throw new Error();
      onDone?.();
    } catch { Alert.alert('Error', 'Could not send. Please try again.'); setUploading(false); }
    finally { setSending(false); }
  };

  return (
    <View style={af.wrap}>
      <Text style={af.title}>Questions from the Business</Text>
      {questions.map((q, i) => (
        <View key={i} style={af.qBlock}>
          <Text style={af.qTxt}>{i + 1}. {q}</Text>
          <TextInput
            style={af.input} placeholder="Your answer…" placeholderTextColor="#94A3B8"
            value={answers[i]} onChangeText={v => setAnswers(prev => prev.map((a, idx) => idx === i ? v : a))}
            multiline
            onFocus={IS_WEB ? (e) => e.target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) : undefined}
          />
        </View>
      ))}

      {/* Photo attachment */}
      <View style={af.photoRow}>
        <TouchableOpacity style={af.photoBtn} onPress={pickPhoto}>
          <Ionicons name="camera-outline" size={18} color="#7C3AED" />
          <Text style={af.photoBtnTxt}>{photo ? 'Change Photo' : 'Attach Photo'}</Text>
        </TouchableOpacity>
        {photo && (
          <View style={af.photoPreviewWrap}>
            <Image source={{ uri: photo.uri }} style={af.photoPreview} />
            <TouchableOpacity style={af.photoRemove} onPress={() => setPhoto(null)}>
              <Ionicons name="close-circle" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={[af.sendBtn, (sending || uploading) && { opacity: 0.5 }]} onPress={handleSend} disabled={sending || uploading}>
        <Text style={af.sendBtnTxt}>{uploading ? 'Uploading…' : sending ? 'Sending…' : 'Send Answers'}</Text>
      </TouchableOpacity>
    </View>
  );
}
const af = StyleSheet.create({
  wrap:           { marginTop: 14, backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#DDD6FE' },
  title:          { fontSize: 13, fontWeight: '800', color: '#5B21B6', marginBottom: 10 },
  qBlock:         { marginBottom: 12 },
  qTxt:           { fontSize: 13, color: '#3B0764', fontWeight: '600', marginBottom: 6, lineHeight: 18 },
  input:          { backgroundColor: '#fff', borderRadius: 9, borderWidth: 1, borderColor: '#DDD6FE', padding: 11, fontSize: 14, color: '#0F172A', textAlignVertical: 'top', minHeight: 64 },
  photoRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  photoBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EDE9FE', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  photoBtnTxt:    { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
  photoPreviewWrap: { position: 'relative' },
  photoPreview:   { width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: '#DDD6FE' },
  photoRemove:    { position: 'absolute', top: -8, right: -8 },
  sendBtn:        { backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  sendBtnTxt:     { fontSize: 14, fontWeight: '800', color: '#fff' },
});

// ── Service detail modal — full BroadDetailModal-style profile + quote actions ──
function ServiceDetailModal({ quote, onClose, onRefresh }) {
  const [service, setService]         = useState(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [confirmSending, setConfirmSending] = useState(false);
  const { status } = quote;
  const canConfirm = status === 'business_confirmed' || status === 'business_edited';

  // Fetch the full service profile
  useEffect(() => {
    if (!quote.serviceId) return;
    fetch(`${NODE_API}/services/${quote.serviceId}`)
      .then(r => r.json())
      .then(d => { if (d && !d.error) setService(d); })
      .catch(() => {});
  }, [quote.serviceId]);

  const coverUrl = resolveServiceImg(service?.portfolioImageUrls?.[0] || quote.businessLogoUrl || null);
  const displayName = quote.businessName || service?.businessName || 'Service Provider';

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
      <View style={{ flex: 1, backgroundColor: IS_WEB ? '#F7F7F7' : '#fff' }}>
        <View style={IS_WEB ? { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' } : { flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          {IS_WEB && <View style={{ height: WEB_HEADER_HEIGHT }} />}
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              contentContainerStyle={IS_WEB ? { paddingBottom: 300 } : undefined}>

              {/* Hero image */}
              <View style={{ position: 'relative' }}>
                <Image source={{ uri: coverUrl }} style={sd.hero} resizeMode="cover" />
                <TouchableOpacity style={sd.backBtn} onPress={onClose}>
                  <Ionicons name="chevron-back" size={26} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={sd.body}>
                {/* Status badge — mirrors BroadDetailModal's "Available" badge */}
                <View style={[sd.statusBadge, { backgroundColor: '#DCFCE7' }]}>
                  <Text style={[sd.statusBadgeText, { color: '#166534' }]}>
                    {status === 'appointment_confirmed' ? '✓ Confirmed' : 'Quote Ready'}
                  </Text>
                </View>

                {/* Business name — large, matching BroadDetailModal */}
                <Text style={sd.bizName}>{displayName}</Text>
                {service?.providerName ? (
                  <Text style={sd.providerName}>{service.providerName}</Text>
                ) : null}

                {/* Meta row — rating + category + location */}
                <View style={sd.metaRow}>
                  <Ionicons name="star" size={18} color="#F59E0B" />
                  <Text style={sd.metaTxt}> {service?.rating || '4.8'} · </Text>
                  <Text style={sd.metaTxt}>{service?.category || quote.subService || 'Service'}</Text>
                  {service?.serviceArea
                    ? <Text style={sd.metaTxt}> · {service.serviceArea}</Text>
                    : null}
                </View>

                {/* About */}
                {service?.description ? (
                  <View style={sd.section}>
                    <Text style={sd.sectionTitle}>About</Text>
                    <Text style={sd.aboutTxt}>{service.description}</Text>
                  </View>
                ) : null}

                {/* Top services */}
                {service?.topServices?.filter(s => s.name).length > 0 && (
                  <View style={sd.section}>
                    <Text style={sd.sectionTitle}>Top Services</Text>
                    {service.topServices.filter(s => s.name).map((sv, i) => (
                      <View key={i} style={sd.serviceRow}>
                        <Text style={sd.serviceRowName}>{sv.name}</Text>
                        {sv.price ? <Text style={sd.serviceRowPrice}>Est. ${sv.price}</Text> : null}
                      </View>
                    ))}
                  </View>
                )}

                {/* Stats grid — availability + response time */}
                {(service?.availability || service?.responseTime) && (
                  <View style={sd.statsGrid}>
                    {service.availability && (
                      <View style={sd.statBox}>
                        <Text style={sd.statVal}>{service.availability}</Text>
                        <Text style={sd.statLbl}>Availability</Text>
                      </View>
                    )}
                    {service.responseTime && (
                      <View style={sd.statBox}>
                        <Text style={sd.statVal} numberOfLines={2}>{service.responseTime}</Text>
                        <Text style={sd.statLbl}>Response</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Portfolio */}
                {service?.portfolioImageUrls?.length > 0 && (
                  <View style={sd.section}>
                    <Text style={sd.sectionTitle}>Portfolio</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {service.portfolioImageUrls.slice(0, 5).map((url, i) => (
                        <Image key={i} source={{ uri: resolveServiceImg(url) }} style={sd.portfolioImg} resizeMode="cover" />
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* AI note */}
                <View style={sd.aiNote}>
                  <Ionicons name="sparkles" size={17} color="#2563EB" />
                  <Text style={sd.aiNoteTxt}>Matched for your request</Text>
                </View>

                {/* ── Quote section ───────────────────────────────── */}
                <View style={sd.divider} />

                {/* Confirmed appointment */}
                {status === 'appointment_confirmed' && (
                  <View style={[sd.infoBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                    <Ionicons name="checkmark-circle" size={44} color="#16A34A" />
                    <Text style={[sd.infoTitle, { color: '#15803D' }]}>Appointment Confirmed!</Text>
                    {quote.proposedDate && (
                      <Text style={[sd.infoSub, { color: '#166534', fontWeight: '700' }]}>
                        {quote.proposedDate}{quote.proposedTime ? ` at ${quote.proposedTime}` : ''}
                      </Text>
                    )}
                    {quote.confirmedPrice && (
                      <Text style={[sd.infoSub, { color: '#166534' }]}>Price: ${quote.confirmedPrice}</Text>
                    )}
                  </View>
                )}

                {/* Quote details card */}
                {(canConfirm || status === 'user_requested_reschedule') && (
                  <View style={sd.quoteCard}>
                    <Text style={sd.quoteCardTitle}>Quote Details</Text>
                    {quote.confirmedPrice ? (
                      <View style={sd.priceRow}>
                        <Text style={sd.priceLabel}>Price</Text>
                        <Text style={sd.priceValue}>${quote.confirmedPrice}</Text>
                      </View>
                    ) : (quote.estimateMin || quote.estimateMax) ? (
                      <View style={sd.priceRow}>
                        <Text style={sd.priceLabel}>Estimate</Text>
                        <Text style={sd.priceValue}>
                          {quote.estimateMin && quote.estimateMax
                            ? `$${quote.estimateMin}–$${quote.estimateMax}`
                            : `$${quote.estimateMin || quote.estimateMax}`}
                        </Text>
                      </View>
                    ) : null}
                    {(quote.proposedDate || quote.proposedTime) && (
                      <View style={sd.detailRow}>
                        <Ionicons name="calendar-outline" size={16} color="#2563EB" />
                        <Text style={sd.detailTxt}>
                          {quote.proposedDate}{quote.proposedTime ? ` at ${quote.proposedTime}` : ''}
                        </Text>
                      </View>
                    )}
                    {quote.businessNote ? (
                      <View style={sd.noteBox}>
                        <Text style={sd.noteLabel}>Note from Business</Text>
                        <Text style={sd.noteTxt}>{quote.businessNote}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {status === 'pending_business' && (
                  <View style={[sd.infoBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                    <Ionicons name="hourglass-outline" size={36} color="#D97706" />
                    <Text style={[sd.infoTitle, { color: '#92400E' }]}>Awaiting Quote</Text>
                    <Text style={sd.infoSub}>The business has been notified and is preparing your quote.</Text>
                  </View>
                )}

                {status === 'awaiting_user_info' && (
                  <AnswerForm quote={quote} onDone={() => { onRefresh?.(); onClose(); }} />
                )}

                {status === 'user_info_provided' && (
                  <View style={sd.infoBox}>
                    <Ionicons name="checkmark-done-circle-outline" size={36} color="#2563EB" />
                    <Text style={sd.infoTitle}>Answers Sent</Text>
                    <Text style={sd.infoSub}>The business will review and send an updated quote.</Text>
                  </View>
                )}

                {status === 'user_requested_reschedule' && (
                  <View style={[sd.infoBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', marginTop: 12 }]}>
                    <Ionicons name="time-outline" size={32} color="#F59E0B" />
                    <Text style={[sd.infoTitle, { color: '#92400E' }]}>Reschedule Requested</Text>
                    {quote.userRequestedDate && (
                      <Text style={{ marginTop: 4, fontSize: 14, fontWeight: '700', color: '#92400E' }}>
                        {quote.userRequestedDate}{quote.userRequestedTime ? ` at ${quote.userRequestedTime}` : ''}
                      </Text>
                    )}
                    <Text style={sd.infoSub}>Waiting for the business to confirm your preferred time.</Text>
                  </View>
                )}

                {/* CTA buttons */}
                {canConfirm && !showReschedule && (
                  <View style={sd.actionCol}>
                    <TouchableOpacity
                      style={[sd.btnPrimary, confirmSending && { opacity: 0.5 }]}
                      onPress={handleConfirm}
                      disabled={confirmSending}
                    >
                      <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
                      <Text style={sd.btnPrimaryTxt}>{confirmSending ? 'Confirming…' : 'Confirm Appointment'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={sd.btnSecondary} onPress={() => setShowReschedule(true)}>
                      <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                      <Text style={sd.btnSecondaryTxt}>Request Different Time</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {showReschedule && (
                  <ReschedulePicker
                    quoteId={quote._id}
                    onDone={() => { setShowReschedule(false); onRefresh?.(); onClose(); }}
                  />
                )}

                <View style={{ height: 40 }} />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const sd = StyleSheet.create({
  hero:         { width: '100%', aspectRatio: 1.4 },
  backBtn:      { position: 'absolute', top: IS_WEB ? 20 : 52, left: 20, width: 47, height: 47, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  body:         { padding: 26 },
  statusBadge:  { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 13 },
  statusBadgeText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  bizName:      { fontSize: IS_WEB ? 34 : 31, fontWeight: '900', color: '#111827', marginBottom: 5 },
  providerName: { fontSize: 18, fontWeight: '600', color: '#2563EB', marginBottom: 10 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' },
  metaTxt:      { fontSize: 17, color: '#6B7280' },
  section:      { marginBottom: 26 },
  sectionTitle: { fontSize: IS_WEB ? 22 : 21, fontWeight: '800', color: '#111827', marginBottom: 13 },
  aboutTxt:     { fontSize: 18, color: '#374151', lineHeight: 29 },
  serviceRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  serviceRowName:  { fontSize: 20, fontWeight: '600', color: '#111827' },
  serviceRowPrice: { fontSize: 16, color: '#6B7280' },
  statsGrid:    { flexDirection: 'row', gap: 13, marginBottom: 26 },
  statBox:      { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 16, padding: 18, alignItems: 'center' },
  statVal:      { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: 5 },
  statLbl:      { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  portfolioImg: { width: 156, height: 117, borderRadius: 13, marginRight: 13 },
  aiNote:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 13, padding: 16, marginBottom: 4 },
  aiNoteTxt:    { fontSize: 17, fontWeight: '700', color: '#2563EB' },
  divider:      { height: 1, backgroundColor: '#F1F5F9', marginVertical: 22 },
  quoteCard:    { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', gap: 12, marginBottom: 4 },
  quoteCardTitle: { fontSize: 13, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  priceRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel:   { fontSize: 14, color: '#64748B', fontWeight: '600' },
  priceValue:   { fontSize: IS_WEB ? 34 : 30, fontWeight: '900', color: '#0F172A' },
  detailRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailTxt:    { fontSize: 16, color: '#2563EB', fontWeight: '600' },
  noteBox:      { backgroundColor: '#FFF7ED', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FED7AA' },
  noteLabel:    { fontSize: 12, fontWeight: '800', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  noteTxt:      { fontSize: 15, color: '#78350F', lineHeight: 22 },
  actionCol:    { gap: 12, marginTop: 23 },
  btnPrimary:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16A34A', borderRadius: 16, height: 65 },
  btnPrimaryTxt:{ fontSize: 18, fontWeight: '800', color: '#fff' },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 16, height: 58, borderWidth: 1.5, borderColor: '#BFDBFE' },
  btnSecondaryTxt: { fontSize: 17, fontWeight: '700', color: '#2563EB' },
  infoBox:      { alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 14, padding: 28, gap: 8, marginTop: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  infoTitle:    { fontSize: 19, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  infoSub:      { fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 22 },
});

// ── Quote summary card (BroadSummaryCard-style) ───────────────────────────────
function QuoteSummaryCard({ quote, onTap }) {
  const isPending   = quote.status === 'pending_business';
  const isConfirmed = quote.status === 'appointment_confirmed';
  const isCancelled = quote.status === 'cancelled';
  const coverUrl    = resolveServiceImg(quote.businessLogoUrl || null);

  const priceDisplay = quote.confirmedPrice
    ? `$${quote.confirmedPrice}`
    : (quote.estimateMin && quote.estimateMax)
      ? `$${quote.estimateMin}–$${quote.estimateMax}`
      : quote.estimateMin
        ? `From $${quote.estimateMin}`
        : null;

  return (
    <TouchableOpacity style={qs.card} onPress={() => onTap(quote)} activeOpacity={0.88}>
      {/* Cover image */}
      <View style={qs.coverWrap}>
        <Image source={{ uri: coverUrl }} style={qs.cover} resizeMode="cover" />
        <View style={qs.coverOverlay} />
        <View style={qs.statusBadgeWrap}>
          <StatusBadge status={quote.status} />
        </View>
      </View>

      {/* Card body */}
      <View style={qs.body}>
        {/* Business row */}
        <View style={qs.bizRow}>
          <BusinessAvatar picUrl={quote.businessProfilePic} name={quote.businessName} size={48} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={qs.bizName} numberOfLines={1}>{quote.businessName || 'Service Provider'}</Text>
            {quote.subService
              ? <Text style={qs.bizSub} numberOfLines={1}>{quote.subService}</Text>
              : null}
          </View>
        </View>

        {/* Pending state */}
        {isPending && (
          <View style={qs.pendingRow}>
            <Ionicons name="hourglass-outline" size={15} color="#D97706" />
            <Text style={qs.pendingTxt}>Preparing your quote…</Text>
          </View>
        )}

        {/* Quote details */}
        {!isPending && !isCancelled && (
          <View style={qs.quoteBlock}>
            {priceDisplay && <Text style={qs.priceText}>{priceDisplay}</Text>}
            {(quote.proposedDate || quote.proposedTime) && (
              <View style={qs.dateRow}>
                <Ionicons name="calendar-outline" size={13} color="#2563EB" />
                <Text style={qs.dateTxt}>
                  {quote.proposedDate}{quote.proposedTime ? ` · ${quote.proposedTime}` : ''}
                </Text>
              </View>
            )}
            {isConfirmed && (
              <View style={qs.confirmedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                <Text style={qs.confirmedTxt}>Appointment Confirmed</Text>
              </View>
            )}
          </View>
        )}

        {isCancelled && (
          <View style={[qs.pendingRow, { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10 }]}>
            <Ionicons name="close-circle-outline" size={15} color="#DC2626" />
            <Text style={[qs.pendingTxt, { color: '#B91C1C' }]}>Cancelled</Text>
          </View>
        )}

        {/* Tap hint */}
        {!isConfirmed && !isCancelled && (
          <View style={qs.tapHint}>
            <Text style={qs.tapHintTxt}>{isPending ? 'Tap for details →' : 'Tap to confirm or reschedule →'}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const qs = StyleSheet.create({
  card:        { width: CARD_W, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.09, shadowRadius: 12, elevation: 4 },
  coverWrap:   { width: '100%', aspectRatio: 1.3, position: 'relative' },
  cover:       { width: '100%', height: '100%' },
  coverOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  statusBadgeWrap: { position: 'absolute', bottom: 10, right: 12 },
  body:        { padding: IS_WEB ? 18 : 14 },
  bizRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  bizName:     { fontSize: IS_WEB ? 16 : 15, fontWeight: '800', color: '#0F172A' },
  bizSub:      { fontSize: 12, color: '#64748B', marginTop: 2 },
  pendingRow:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  pendingTxt:  { flex: 1, fontSize: 13, color: '#92400E' },
  quoteBlock:  { gap: 6, marginBottom: 8 },
  priceText:   { fontSize: IS_WEB ? 26 : 22, fontWeight: '900', color: '#0F172A' },
  dateRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateTxt:     { fontSize: 13, color: '#2563EB', fontWeight: '600' },
  confirmedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  confirmedTxt:  { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  tapHint:     { alignItems: 'flex-end', marginTop: 6 },
  tapHintTxt:  { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
});

// ── Main export ───────────────────────────────────────────────────────────────
export default function ServiceMatchesModal({ needId, needText, quotes: initialQuotes, onClose, onRefresh }) {
  const [quotes, setQuotes]           = useState(initialQuotes || []);
  const [page, setPage]               = useState(0);
  const [loading, setLoading]         = useState(false);
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
              <Text style={mm.headerTitle}>
                {quotes.length > 0 ? `${quotes.length} Quote${quotes.length !== 1 ? 's' : ''} Received` : 'Your Quotes'}
              </Text>
              {loading
                ? <ActivityIndicator size="small" color="#2563EB" style={{ width: 40 }} />
                : <View style={{ width: 40 }} />}
            </View>

            {quotes.length === 0 ? (
              <View style={mm.emptyWrap}>
                <Ionicons name="search-circle-outline" size={64} color="#CBD5E1" />
                <Text style={mm.emptyTitle}>Finding Quotes</Text>
                <Text style={mm.emptySub}>Businesses are reviewing your request. Check back soon.</Text>
              </View>
            ) : (
              <>
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
                    <QuoteSummaryCard quote={item} onTap={q => setDetailQuote(q)} />
                  )}
                />

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
                  {quotes.length > 1
                    ? `${page + 1} of ${quotes.length} quotes — swipe to see all`
                    : 'Tap the card to confirm or request a new time'}
                </Text>
              </>
            )}
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>

      {detailQuote && (
        <ServiceDetailModal
          quote={detailQuote}
          onClose={() => setDetailQuote(null)}
          onRefresh={() => { setDetailQuote(null); handleRefresh(); }}
        />
      )}
    </Modal>
  );
}

const mm = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: IS_WEB ? '#F0F2F5' : '#F8FAFC' },
  webWrap:    { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: IS_WEB ? 20 : 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#fff' },
  headerTitle:{ fontSize: IS_WEB ? 20 : 17, fontWeight: '800', color: '#0F172A' },
  listContent:{ paddingHorizontal: 16, paddingVertical: 24, gap: 20, alignItems: 'flex-start' },
  dotsRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 10 },
  dot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: '#CBD5E1' },
  dotActive:  { width: 10, height: 10, backgroundColor: '#2563EB' },
  swipeHint:  { textAlign: 'center', fontSize: 12, color: '#94A3B8', paddingBottom: IS_WEB ? 10 : 18 },
  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  emptySub:   { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
});
