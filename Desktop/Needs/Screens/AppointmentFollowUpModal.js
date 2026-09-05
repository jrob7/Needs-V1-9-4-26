// Screens/AppointmentFollowUpModal.js
// Post-appointment follow-up popup triggered ~2 minutes after the scheduled time.
// Follows the full flowchart:
//   Completed   → 3-star rating fields → Leave Review & Earn NeedCoins → Need Closed
//   In Progress → Got It               → Auto follow-up tomorrow
//   Not Completed → reason picker      → Notify Business
import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserContext } from '../server/CurrentUser';
import { scheduleAppointmentFollowUp } from '../utils/appointmentReminders';
import { invalidateTab2Cache } from './Tab2Content';

import { NODE_API } from '../config';
import { authFetch } from '../server/api';

const NOT_COMPLETED_REASONS = [
  "Business didn't show up",
  "Job couldn't be completed",
  'Appointment canceled',
  'Other',
];

// ── Star rating row ────────────────────────────────────────────────────────────
function WouldRecommendRow({ value, onChange }) {
  return (
    <View style={styles.yesNoRow}>
      <Text style={styles.yesNoQuestion}>Would you recommend to a friend?</Text>
      <View style={styles.yesNoBtns}>
        <TouchableOpacity
          style={[styles.yesNoBtn, value === true && styles.yesNoBtnYes]}
          onPress={() => onChange(true)}
        >
          <Text style={[styles.yesNoTxt, value === true && styles.yesNoTxtActive]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.yesNoBtn, value === false && styles.yesNoBtnNo]}
          onPress={() => onChange(false)}
        >
          <Text style={[styles.yesNoTxt, value === false && styles.yesNoTxtActive]}>No</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StarRow({ label, value, onChange }) {
  return (
    <View style={styles.starRow}>
      <Text style={styles.starLabel}>{label}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Ionicons
              name={n <= value ? 'star' : 'star-outline'}
              size={28}
              color={n <= value ? '#F59E0B' : '#CBD5E1'}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function AppointmentFollowUpModal({ visible, appointment, role, userId, onClose }) {
  const { setUserProfile } = React.useContext(UserContext);

  const [step, setStep] = useState('question'); // question | completed | inProgress | notCompleted | done | donePending | notifyBusiness
  const [notCompletedReason, setNotCompletedReason] = useState(null);

  // Star ratings
  const [reliability,    setReliability]    = useState(0);
  const [responsiveness, setResponsiveness] = useState(0);
  const [recommended,    setRecommended]    = useState(0);
  const [wouldRecommend, setWouldRecommend] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(0);

  const isRequester = role === 'requester';
  const revieweeId  = isRequester ? appointment?.serviceUserId : appointment?.requesterId;
  const allStarsSet = reliability > 0 && responsiveness > 0 && recommended > 0 && wouldRecommend !== null;

  // ── Mark appointment + need as completed after a successful review ─────────
  const closeOutNeed = async () => {
    try {
      // 1. Mark the appointment completed → removes from Scheduler upcoming list
      if (appointment?._id) {
        await authFetch(`${NODE_API}/appointments/${appointment._id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'completed' }),
        });
      }

      // 2. Find and archive the matching need → removes from Tab 2 and marks
      //    completed in Notifications > Activity
      if (appointment?.requesterId && isRequester) {
        const r = await authFetch(`${NODE_API}/myNeedRequests`);
        const needs = await r.json();
        const matching = Array.isArray(needs)
          ? needs.find(n => !n.archived && !n.completedAt &&
              (n.searchText === appointment.needText ||
               (appointment.needText && (n.context || '').includes(appointment.needText)) ||
               (appointment.needText && (n.searchText || '').toLowerCase().includes((appointment.needText || '').toLowerCase()))))
          : null;
        if (matching?._id) {
          await authFetch(`${NODE_API}/needRequests/${matching._id}/archive`, {
            method: 'PATCH',
            body: JSON.stringify({ archived: true, completedAt: new Date().toISOString() }),
          });
          // Force Tab 2 to re-fetch so the completed need disappears immediately
          invalidateTab2Cache();
        }
      }
    } catch (e) {
      console.log('closeOutNeed error:', e?.message);
    }
  };

  // ── Submit review to backend ──────────────────────────────────────────────
  const submitReview = async (completionStatus) => {
    if (!appointment?._id || !userId) return;
    setSubmitting(true);
    try {
      const body = {
        revieweeId,
        role,
        completionStatus,
        notCompletedReason: completionStatus === 'notCompleted' ? notCompletedReason : null,
        ...(completionStatus === 'completed' && allStarsSet
          ? { reliability, responsiveness, recommended, wouldRecommend }
          : {}),
      };
      const resp = await authFetch(`${NODE_API}/appointments/${appointment._id}/review`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('Server error');
      const data = await resp.json();

      if (data.coinAwarded > 0) {
        setCoinsEarned(data.coinAwarded);
        setUserProfile?.(prev => prev ? { ...prev, needCoins: (prev.needCoins || 0) + data.coinAwarded } : prev);
      }

      // After a completed review, close out the need and appointment
      if (completionStatus === 'completed') {
        await closeOutNeed();
      }
    } catch (e) {
      Alert.alert('Error', 'Could not save your response. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Schedule tomorrow's follow-up (Still in Progress) ───────────────────
  const scheduleTomorrowFollowUp = async () => {
    if (!appointment) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    try {
      await scheduleAppointmentFollowUp(
        { ...appointment, date: tomorrow.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), time: '10:00 AM' },
        role
      );
    } catch (e) {
      console.log('Tomorrow follow-up schedule failed:', e?.message);
    }
  };

  const handleClose = () => {
    setStep('question');
    setReliability(0); setResponsiveness(0); setRecommended(0); setWouldRecommend(null);
    setNotCompletedReason(null); setCoinsEarned(0);
    onClose?.();
  };

  // ── STEP: question ────────────────────────────────────────────────────────
  const renderQuestion = () => (
    <View style={styles.body}>
      <View style={styles.questionIconWrap}>
        <Ionicons name="help-circle" size={44} color="#2563EB" />
      </View>
      <Text style={styles.questionTitle}>
        {isRequester ? 'Was your Need completed?' : 'Was this Need completed?'}
      </Text>
      {appointment?.businessName ? (
        <Text style={styles.questionSub}>Appointment with {appointment.businessName}</Text>
      ) : null}

      <TouchableOpacity style={[styles.optionBtn, styles.optionCompleted]}
        onPress={() => setStep('completed')}>
        <Ionicons name="checkmark" size={20} color="#16A34A" />
        <Text style={[styles.optionTxt, { color: '#16A34A' }]}>Completed</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.optionBtn, styles.optionProgress]}
        onPress={() => setStep('inProgress')}>
        <Ionicons name="time-outline" size={20} color="#D97706" />
        <Text style={[styles.optionTxt, { color: '#D97706' }]}>Still in Progress</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.optionBtn, styles.optionNotCompleted]}
        onPress={() => setStep('notCompleted')}>
        <Ionicons name="close" size={20} color="#DC2626" />
        <Text style={[styles.optionTxt, { color: '#DC2626' }]}>Not Completed</Text>
      </TouchableOpacity>
    </View>
  );

  // ── STEP: completed ───────────────────────────────────────────────────────
  const renderCompleted = () => (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={styles.starsHeader}>
        {[1,2,3,4,5].map(i => <Ionicons key={i} name="star" size={22} color="#F59E0B" />)}
      </View>
      <Text style={styles.sectionTitle}>How was your experience?</Text>

      <StarRow label="Reliability"    value={reliability}    onChange={setReliability} />
      <StarRow label="Responsiveness" value={responsiveness} onChange={setResponsiveness} />
      <StarRow label="Recommended"    value={recommended}    onChange={setRecommended} />
      <WouldRecommendRow value={wouldRecommend} onChange={setWouldRecommend} />

      <TouchableOpacity
        style={[styles.primaryBtn, (!allStarsSet || submitting) && styles.btnDisabled]}
        onPress={async () => {
          await submitReview('completed');
          setStep('done');
        }}
        disabled={!allStarsSet || submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.primaryBtnTxt}>Leave a Review & Earn NeedCoins</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={async () => { await submitReview('completed'); setStep('done'); }}
        style={styles.skipWrap}>
        <Text style={styles.skipTxt}>Skip</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ── STEP: inProgress ─────────────────────────────────────────────────────
  const renderInProgress = () => (
    <View style={styles.body}>
      <Ionicons name="hourglass-outline" size={52} color="#D97706" style={{ alignSelf: 'center', marginBottom: 14 }} />
      <Text style={styles.sectionTitle}>Still in Progress</Text>
      <Text style={styles.bodyText}>
        {"Thanks! We'll check back tomorrow to see if your Need has been completed."}
      </Text>
      <TouchableOpacity
        style={[styles.primaryBtn, submitting && styles.btnDisabled]}
        onPress={async () => {
          await submitReview('inProgress');
          await scheduleTomorrowFollowUp();
          setStep('donePending');
        }}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnTxt}>Got It</Text>}
      </TouchableOpacity>
    </View>
  );

  // ── STEP: notCompleted ────────────────────────────────────────────────────
  const renderNotCompleted = () => (
    <View style={styles.body}>
      <Text style={styles.sectionTitle}>Not Completed</Text>
      <Text style={styles.bodyText}>What happened?</Text>
      {NOT_COMPLETED_REASONS.map(reason => (
        <TouchableOpacity key={reason} style={styles.radioRow}
          onPress={() => setNotCompletedReason(reason)}>
          <View style={[styles.radioCircle, notCompletedReason === reason && styles.radioActive]}>
            {notCompletedReason === reason && <View style={styles.radioDot} />}
          </View>
          <Text style={styles.radioLabel}>{reason}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={[styles.primaryBtn, styles.notCompletedBtn, (!notCompletedReason || submitting) && styles.btnDisabled]}
        onPress={async () => {
          await submitReview('notCompleted');
          setStep('notifyBusiness');
        }}
        disabled={!notCompletedReason || submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnTxt}>Continue</Text>}
      </TouchableOpacity>
    </View>
  );

  // ── STEP: done (completed) ────────────────────────────────────────────────
  const renderDone = () => (
    <View style={styles.body}>
      <View style={styles.doneIconWrap}>
        <Ionicons name="checkmark-circle" size={52} color="#fff" />
      </View>
      <Text style={styles.sectionTitle}>Need Closed</Text>
      <Text style={styles.bodyText}>Thank you! Your feedback helps others.</Text>
      {coinsEarned > 0 && (
        <View style={styles.coinBanner}>
          <Image source={require('../assets/NeedCoin.png')} style={styles.coinLogo} />
          <Text style={styles.coinBannerTxt}>+{coinsEarned} NeedCoins earned!</Text>
        </View>
      )}
      <TouchableOpacity style={styles.primaryBtn} onPress={handleClose}>
        <Text style={styles.primaryBtnTxt}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  // ── STEP: donePending (inProgress) ───────────────────────────────────────
  const renderDonePending = () => (
    <View style={styles.body}>
      <Ionicons name="calendar-outline" size={52} color="#2563EB" style={{ alignSelf: 'center', marginBottom: 10 }} />
      <Text style={styles.sectionTitle}>Automatic Follow-Up Tomorrow</Text>
      <Text style={styles.bodyText}>{"We'll ask again tomorrow to confirm your Need is completed."}</Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={handleClose}>
        <Text style={styles.primaryBtnTxt}>Got It</Text>
      </TouchableOpacity>
    </View>
  );

  // ── STEP: notifyBusiness ──────────────────────────────────────────────────
  const renderNotifyBusiness = () => (
    <View style={styles.body}>
      <View style={styles.warningIcon}>
        <Ionicons name="warning" size={28} color="#DC2626" />
      </View>
      <Text style={styles.sectionTitle}>Notify Business</Text>
      <Text style={styles.bodyText}>
        {"We'll share this feedback and keep the conversation open."}
      </Text>
      <TouchableOpacity style={[styles.primaryBtn, styles.notCompletedBtn]} onPress={handleClose}>
        <Text style={styles.primaryBtnTxt}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 'question':       return renderQuestion();
      case 'completed':      return renderCompleted();
      case 'inProgress':     return renderInProgress();
      case 'notCompleted':   return renderNotCompleted();
      case 'done':           return renderDone();
      case 'donePending':    return renderDonePending();
      case 'notifyBusiness': return renderNotifyBusiness();
      default:               return renderQuestion();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {renderStep()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40, minHeight: 360,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#BFDBFE',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  body: { paddingHorizontal: 24, paddingTop: 16 },

  questionIconWrap: { alignSelf: 'center', marginBottom: 8 },
  questionTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 6 },
  questionSub:   { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20 },

  optionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12,
    borderWidth: 1.5, marginBottom: 10,
  },
  optionCompleted:    { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  optionProgress:     { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  optionNotCompleted: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  optionTxt: { fontSize: 16, fontWeight: '700' },

  starsHeader:   { flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 8 },
  sectionTitle:  { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 8 },
  bodyText:      { fontSize: 14, color: '#475569', lineHeight: 22, marginBottom: 20 },

  starRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  starLabel: { fontSize: 14, fontWeight: '700', color: '#1E293B', width: 120 },
  stars:     { flexDirection: 'row', gap: 6 },

  primaryBtn:      { height: 50, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  notCompletedBtn: { backgroundColor: '#DC2626' },
  btnDisabled:     { opacity: 0.5 },
  primaryBtnTxt:   { fontSize: 15, fontWeight: '800', color: '#fff' },

  skipWrap: { alignSelf: 'center', marginTop: 12 },
  skipTxt:  { fontSize: 14, color: '#2563EB', fontWeight: '600' },

  doneIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 14,
  },

  coinBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE',
    paddingHorizontal: 16, paddingVertical: 12, marginTop: 14,
  },
  coinLogo:      { width: 28, height: 28 },
  coinBannerTxt: { fontSize: 16, fontWeight: '800', color: '#1D4ED8' },

  yesNoRow:      { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  yesNoQuestion: { fontSize: 14, fontWeight: '700', color: '#1E293B', marginBottom: 10 },
  yesNoBtns:     { flexDirection: 'row', gap: 10 },
  yesNoBtn:      { flex: 1, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  yesNoBtnYes:   { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  yesNoBtnNo:    { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  yesNoTxt:      { fontSize: 14, fontWeight: '700', color: '#64748B' },
  yesNoTxtActive:{ color: '#fff' },

  radioRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#2563EB' },
  radioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB' },
  radioLabel:  { fontSize: 14, color: '#1E293B' },

  warningIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
});
