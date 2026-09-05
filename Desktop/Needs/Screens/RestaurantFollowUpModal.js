// Screens/RestaurantFollowUpModal.js
// Post-visit follow-up for restaurant check-ins and offer redemptions.
// Triggered 2 minutes after either a visit code or offer code is confirmed.
// Ratings: Reliability, Responsiveness, Recommended. Awards 20 NeedCoins on submit.
import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserContext } from '../server/CurrentUser';

import { NODE_API } from '../config';
import { authFetch } from '../server/api';

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

export default function RestaurantFollowUpModal({ visible, followUp, userId, onClose }) {
  const { setUserProfile } = React.useContext(UserContext);

  const [step, setStep]           = useState('rating'); // rating | done
  const [reliability, setReliability]       = useState(0);
  const [responsiveness, setResponsiveness] = useState(0);
  const [recommended, setRecommended]       = useState(0);
  const [wouldRecommend, setWouldRecommend] = useState(null);
  const [submitting, setSubmitting]         = useState(false);
  const [coinsEarned, setCoinsEarned]       = useState(0);

  const allStarsSet = reliability > 0 && responsiveness > 0 && recommended > 0 && wouldRecommend !== null;

  const handleClose = () => {
    setStep('rating');
    setReliability(0); setResponsiveness(0); setRecommended(0); setWouldRecommend(null);
    setCoinsEarned(0);
    onClose?.();
  };

  const submitReview = async (skipRatings = false) => {
    if (!followUp?._id || !userId) return;
    setSubmitting(true);
    try {
      const resp = await authFetch(`${NODE_API}/restaurantFollowUps/complete`, {
        method: 'POST',
        body: JSON.stringify({
          followUpId: followUp._id,
          wouldRecommend: skipRatings ? null : wouldRecommend,
          ...(skipRatings ? {} : { reliability, responsiveness, recommended }),
        }),
      });
      if (!resp.ok) throw new Error('Server error');
      const data = await resp.json();
      if (data.coinAwarded > 0) {
        setCoinsEarned(data.coinAwarded);
        setUserProfile?.(prev => prev ? { ...prev, needCoins: (prev.needCoins || 0) + data.coinAwarded } : prev);
      }
      if (data.addedReco) {
        setUserProfile?.(prev => {
          if (!prev) return prev;
          const already = (prev.recommendations || []).some(r => r.name === data.addedReco.name && r.type === data.addedReco.type);
          if (already) return prev;
          return { ...prev, recommendations: [...(prev.recommendations || []), data.addedReco] };
        });
      }
      setStep('done');
    } catch (e) {
      Alert.alert('Error', 'Could not save your response. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderRating = () => (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={styles.starsHeader}>
        {[1,2,3,4,5].map(i => <Ionicons key={i} name="star" size={22} color="#F59E0B" />)}
      </View>
      <Text style={styles.sectionTitle}>How was your visit?</Text>
      {!!followUp?.restaurantName && (
        <Text style={styles.questionSub}>{followUp.restaurantName}</Text>
      )}

      <StarRow label="Reliability"    value={reliability}    onChange={setReliability} />
      <StarRow label="Responsiveness" value={responsiveness} onChange={setResponsiveness} />
      <StarRow label="Recommended"    value={recommended}    onChange={setRecommended} />
      <WouldRecommendRow value={wouldRecommend} onChange={setWouldRecommend} />

      <TouchableOpacity
        style={[styles.primaryBtn, (!allStarsSet || submitting) && styles.btnDisabled]}
        onPress={() => submitReview(false)}
        disabled={!allStarsSet || submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.primaryBtnTxt}>Leave a Review & Earn NeedCoins</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => submitReview(true)} style={styles.skipWrap} disabled={submitting}>
        <Text style={styles.skipTxt}>Skip</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderDone = () => (
    <View style={styles.body}>
      <View style={styles.doneIconWrap}>
        <Ionicons name="checkmark-circle" size={52} color="#fff" />
      </View>
      <Text style={styles.sectionTitle}>Thanks for your feedback!</Text>
      <Text style={styles.bodyText}>Your review helps others find great restaurants.</Text>
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

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {step === 'rating' ? renderRating() : renderDone()}
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

  starsHeader:  { flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
  questionSub:  { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 16 },
  bodyText:     { fontSize: 14, color: '#475569', lineHeight: 22, marginBottom: 20 },

  starRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  starLabel: { fontSize: 14, fontWeight: '700', color: '#1E293B', width: 120 },
  stars:     { flexDirection: 'row', gap: 6 },

  primaryBtn:    { height: 50, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  btnDisabled:   { opacity: 0.5 },
  primaryBtnTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  skipWrap: { alignSelf: 'center', marginTop: 12 },
  skipTxt:  { fontSize: 14, color: '#2563EB', fontWeight: '600' },

  yesNoRow:      { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  yesNoQuestion: { fontSize: 14, fontWeight: '700', color: '#1E293B', marginBottom: 10 },
  yesNoBtns:     { flexDirection: 'row', gap: 10 },
  yesNoBtn:      { flex: 1, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  yesNoBtnYes:   { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  yesNoBtnNo:    { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  yesNoTxt:      { fontSize: 14, fontWeight: '700', color: '#64748B' },
  yesNoTxtActive:{ color: '#fff' },

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
});
