// Screens/SingleItemView.js
import React, { useLayoutEffect, useEffect, useState, useCallback } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import NeedsVideoPlayer from '../utils/NeedsVideoPlayer';

import { NODE_API } from '../config';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';
import { authFetch } from '../server/api';

const resolveImg = (uri) => {
  if (!uri) return null;
  if (uri.startsWith('http') || uri.startsWith('data:')) return uri;
  if (/^[0-9a-f]{24}$/i.test(uri)) return `${NODE_API}/images/${uri}`;
  return `${NODE_API}/uploads/${uri}`;
};

// Mongo ObjectIds embed their creation time in the first 4 bytes —
// gives a real "member since" date with no schema change needed.
const memberSinceLabel = (id) => {
  if (!id || typeof id !== 'string' || id.length < 8) return null;
  const seconds = parseInt(id.substring(0, 8), 16);
  if (!Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  return `Member since ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
};

const SingleItemView = ({ route }) => {
  const { item: initialItem, fromNeedInquiry } = route.params || {};
  const navigation = useNavigation();
  const [liveItem, setLiveItem] = useState(null); // fresh copy from server
  const item = liveItem || initialItem;           // prefer live data
  const [userProfile, setUserProfile] = useState(null);
  const [avatarError, setAvatarError] = useState(false);
  const [responseData, setResponseData] = useState(null);   // { volunteersConfirmed, supplyTotals, myVolunteer, mySupplies }
  const [submitting, setSubmitting] = useState(false);
  const [supplyQtys, setSupplyQtys] = useState({});         // { [item]: qty string }
  const [donateItem, setDonateItem] = useState('');
  const [donateQty, setDonateQty] = useState('');
  const [donateDate, setDonateDate] = useState(null);   // Date object
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const formatDonateDate = (d) => d
    ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  // Renders the "When can you bring it?" date+time field.
  // Web: native <input type="datetime-local">. Native: DateTimePicker in date→time sequence.
  const renderDateField = () => IS_WEB ? (
    <input
      type="datetime-local"
      min={new Date().toISOString().slice(0, 16)}
      value={donateDate ? new Date(donateDate.getTime() - donateDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
      onChange={e => { if (e.target.value) setDonateDate(new Date(e.target.value)); }}
      style={{ border: '1.5px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', fontSize: 15, color: donateDate ? '#1E40AF' : '#93C5FD', backgroundColor: '#EFF6FF', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
    />
  ) : (
    <>
      <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
        <Ionicons name="calendar-outline" size={18} color="#2563EB" />
        <Text style={donateDate ? styles.datePickerBtnText : styles.datePickerBtnPlaceholder}>
          {donateDate ? formatDonateDate(donateDate) : 'Select date & time'}
        </Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={donateDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onChange={(ev, selected) => {
            setShowDatePicker(false);
            if (ev.type !== 'dismissed' && selected) { setDonateDate(selected); setShowTimePicker(true); }
          }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={donateDate || new Date()}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(ev, selected) => {
            setShowTimePicker(false);
            if (ev.type !== 'dismissed' && selected) setDonateDate(selected);
          }}
        />
      )}
    </>
  );
  const isOrgBroadcast = item?.needType === 'org_broadcast';
  const isMyOwnBroadcast = isOrgBroadcast && item?.userId && String(item.userId) === String(item?._currentUserId);
  console.log('[SingleItemView] needType=' + item?.needType + ' requestType=' + item?.requestType + ' isVolunteer=' + item?.isVolunteer + ' isSupplies=' + item?.isSupplies + ' isOrgBroadcast=' + isOrgBroadcast + ' isMyOwnBroadcast=' + isMyOwnBroadcast + ' userId=' + item?.userId + ' _currentUserId=' + item?._currentUserId);
  // Derive flags — requestType first, then isVolunteer/isSupplies, then fallback to 'volunteer'
  const hasSupplyItems = Array.isArray(item?.supplies) && item.supplies.length > 0;
  const requestType = item?.requestType || (isOrgBroadcast ? 'volunteer' : null);
  const showVolunteer = isOrgBroadcast && (
    requestType === 'volunteer' || requestType === 'both' || item?.isVolunteer === true
  );
  const showSupplies = isOrgBroadcast && (
    requestType === 'supplies' || requestType === 'both' || item?.isSupplies === true
  );
  console.log('[SingleItemView] requestType=' + requestType + ' showVolunteer=' + showVolunteer + ' showSupplies=' + showSupplies + ' hasSupplyItems=' + hasSupplyItems);
  // --- NORMALIZER: supports NeedRequest + UploadedItem + Fundraiser ---
  const normalized = {
    // Full description — context holds the richer text on need requests
    // created through the slow/clarify path; falls back to the heading.
    details:
      item?.context ||
      item?.searchText ||
      item?.title ||
      "",

    // Price
    price: item?.bidprice ?? item?.offer ?? 0,

    // Urgency
    urgency: item?.urgency || "Anytime",

    // Media
    mediaUri:
      item?.media?.uri ||
      (item?.images?.[0] ? resolveImg(item.images[0]) : null),

    mediaType: item?.media?.type || "image",

    // Ownership
    userId: item?.userId || item?.createdBy || null,
  };

  const isUploadedItem = !!item?.title && !item?.searchText;
  const isFundraiser   = !!item?.targetAmount;
  const badge = isFundraiser
    ? { label: 'Fundraiser', color: '#0A84FF' }
    : isUploadedItem
      ? { label: 'Item', color: '#16A34A' }
      : { label: 'Need', color: '#007bff' };

  const handleBackPress = () => {
    if (fromNeedInquiry) navigation.navigate('NeedInquiryView');
    else navigation.goBack();
  };

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // For org_broadcasts: re-fetch from server to get the latest fields
  // (cached items in Tab2 may be missing requestType/isVolunteer/isSupplies)
  useEffect(() => {
    const needId = initialItem?._id;
    if (!needId || initialItem?.needType !== 'org_broadcast') return;
    authFetch(`${NODE_API}/needRequest/${needId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d._id) {
          console.log('[SingleItemView] live fetch needType=' + d.needType + ' requestType=' + d.requestType + ' isVolunteer=' + d.isVolunteer + ' isSupplies=' + d.isSupplies);
          setLiveItem({ ...initialItem, ...d });
        }
      })
      .catch(() => {});
  }, [initialItem?._id]);

  // Fetch creator profile using getUserDetails (has profilePicture field)
  useEffect(() => {
    const fetchUser = async () => {
      if (!normalized.userId) return;
      try {
        const resp = await fetch(`${NODE_API}/getUserDetails?userId=${normalized.userId}`);
        const result = await resp.json();
        if (resp.ok) setUserProfile(result);
      } catch {}
    };
    fetchUser();
  }, [normalized.userId]);

  // Fetch existing responses for org_broadcast needs
  useEffect(() => {
    if (!isOrgBroadcast || !item?._id) return;
    const fetchResponses = async () => {
      try {
        const r = await authFetch(`${NODE_API}/orgBroadcastResponses/${item._id}`);
        if (r.ok) setResponseData(await r.json());
      } catch {}
    };
    fetchResponses();
  }, [isOrgBroadcast, item?._id]);

  const submitVolunteer = async (volunteering) => {
    if (!item?._id) return;
    setSubmitting(true);
    try {
      await authFetch(`${NODE_API}/orgBroadcastResponse`, {
        method: 'POST',
        body: JSON.stringify({ needId: String(item._id), type: 'volunteer', volunteering }),
      });
      const r = await authFetch(`${NODE_API}/orgBroadcastResponses/${item._id}`);
      if (r.ok) setResponseData(await r.json());
    } catch {}
    setSubmitting(false);
  };

  const submitSupplies = async () => {
    if (!item?._id) return;
    const suppliesArr = (item.supplies || []).map(s => ({
      item: s.item,
      qty: parseFloat(supplyQtys[s.item] || 0) || 0,
      unit: s.unit || '',
    })).filter(s => s.qty > 0);
    if (!suppliesArr.length) { Alert.alert('Enter at least one quantity'); return; }
    setSubmitting(true);
    try {
      await authFetch(`${NODE_API}/orgBroadcastResponse`, {
        method: 'POST',
        body: JSON.stringify({
          needId: String(item._id), type: 'supplies', supplies: suppliesArr,
          whenBringing: formatDonateDate(donateDate),
          whenBringingISO: donateDate ? donateDate.toISOString() : null,
        }),
      });
      const r = await authFetch(`${NODE_API}/orgBroadcastResponses/${item._id}`);
      if (r.ok) setResponseData(await r.json());
    } catch {}
    setSubmitting(false);
  };

  const submitGeneralDonation = async () => {
    if (!item?._id) return;
    if (!donateItem.trim()) { Alert.alert('Please describe what you can bring'); return; }
    const suppliesArr = [{ item: donateItem.trim(), qty: parseFloat(donateQty) || 1, unit: '' }];
    setSubmitting(true);
    try {
      await authFetch(`${NODE_API}/orgBroadcastResponse`, {
        method: 'POST',
        body: JSON.stringify({
          needId: String(item._id), type: 'supplies', supplies: suppliesArr,
          whenBringing: formatDonateDate(donateDate),
          whenBringingISO: donateDate ? donateDate.toISOString() : null,
        }),
      });
      const r = await authFetch(`${NODE_API}/orgBroadcastResponses/${item._id}`);
      if (r.ok) setResponseData(await r.json());
    } catch {}
    setSubmitting(false);
  };

  const creatorName = userProfile
    ? userProfile.organization || userProfile.displayName || [userProfile.firstName, userProfile.lastName].filter(Boolean).join(' ') || userProfile.name || 'Anonymous'
    : null;

  const creatorPic = userProfile
    ? resolveImg(userProfile.profilePicture || userProfile.profileImageUrl || userProfile.profileImage || userProfile.logo)
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: IS_WEB ? '#F7F7F7' : '#fff' }}>
      <View style={IS_WEB ? { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' } : { flex: 1 }}>
      <View style={[styles.headerRow, IS_WEB && { paddingTop: WEB_HEADER_HEIGHT + 8 }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.headerIconBtn}>
          <Ionicons name="chevron-back" size={36} color="#111827" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIconBtn}>
          <Ionicons name="ellipsis-horizontal" size={31} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>

        <View style={[styles.badge, { backgroundColor: badge.color }]}>
          <Text style={styles.badgeText}>{badge.label}</Text>
        </View>

        {/* --- WHEN --- */}
        <View style={styles.row}>
          <Ionicons name="time-outline" size={27} color="#2563EB" />
          <Text style={styles.rowLabel}>When</Text>
          <Text style={styles.rowValue}>{normalized.urgency}</Text>
        </View>
        <View style={styles.divider} />

        {/* --- DETAILS --- */}
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="document-text-outline" size={26} color="#2563EB" />
          <Text style={styles.sectionHeaderText}>Details</Text>
        </View>
        <Text style={styles.detailsText}>{normalized.details}</Text>

        {/* --- RESPOND (org_broadcast only, not org's own card) --- */}
        {isOrgBroadcast && !isMyOwnBroadcast && (
          <View>
            <View style={styles.divider} />
            <View style={styles.respondSection}>
              <Text style={styles.respondTitle}>How would you like to help?</Text>

              {/* ── Volunteer ── */}
              {showVolunteer && (
                <View style={styles.respondBlock}>
                  <View style={styles.respondBlockHeader}>
                    <Ionicons name="people-outline" size={20} color="#1D4ED8" />
                    <Text style={styles.respondBlockTitle}>
                      Volunteer{item?.volunteersNeeded ? ` · ${responseData?.volunteersConfirmed ?? 0} / ${item.volunteersNeeded} confirmed` : ''}
                    </Text>
                  </View>
                  {responseData?.myVolunteer ? (
                    <View style={styles.committedRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                      <Text style={styles.committedText}>
                        {responseData.myVolunteer.volunteering ? 'You\'re volunteering ✓' : 'You declined'}
                      </Text>
                      <TouchableOpacity onPress={() => submitVolunteer(!responseData.myVolunteer.volunteering)}>
                        <Text style={styles.changeLink}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity
                        style={[styles.respondBtn, { backgroundColor: '#2563EB', flex: 1 }]}
                        onPress={() => submitVolunteer(true)}
                        disabled={submitting}
                      >
                        {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.respondBtnTextLight}>Yes, I Can Help</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.respondBtn, { backgroundColor: '#F1F5F9', flex: 1 }]}
                        onPress={() => submitVolunteer(false)}
                        disabled={submitting}
                      >
                        <Text style={styles.respondBtnTextDark}>No</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* ── Supplies ── */}
              {showSupplies && (
                <View style={styles.respondBlock}>
                  <View style={styles.respondBlockHeader}>
                    <Ionicons name="cube-outline" size={20} color="#15803D" />
                    <Text style={styles.respondBlockTitle}>Donate Supplies</Text>
                  </View>
                  {responseData?.mySupplies ? (
                    <View style={styles.committedRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                      <Text style={styles.committedText}>
                        {(responseData.mySupplies.supplies || []).length > 0
                          ? `Committed: ${responseData.mySupplies.supplies.map(s => `${s.qty} ${s.unit || ''} ${s.item}`).join(', ')}`
                          : "You're donating ✓"}
                        {responseData.mySupplies.whenBringing ? `  ·  ${responseData.mySupplies.whenBringing}` : ''}
                      </Text>
                      <TouchableOpacity onPress={() => { setDonateItem(''); setDonateQty(''); setDonateWhen(''); /* clear committed to allow re-entry */ authFetch(`${NODE_API}/orgBroadcastResponse`, { method: 'POST', body: JSON.stringify({ needId: String(item._id), type: 'supplies', supplies: [], whenBringing: null }) }).then(() => authFetch(`${NODE_API}/orgBroadcastResponses/${item._id}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setResponseData(d); })).catch(() => {}); }}>
                        <Text style={styles.changeLink}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  ) : hasSupplyItems ? (
                    <View>
                      {item.supplies.map((s, idx) => (
                        <View key={idx} style={styles.supplyRow}>
                          <Text style={styles.supplyLabel}>
                            {s.item}{s.unit ? ` (${s.unit})` : ''}
                            {responseData?.supplyTotals?.[s.item?.toLowerCase()] != null
                              ? `  ·  ${responseData.supplyTotals[s.item.toLowerCase()]} committed`
                              : ''}
                          </Text>
                          <TextInput
                            style={styles.supplyInput}
                            placeholder="Qty"
                            keyboardType="numeric"
                            value={supplyQtys[s.item] || ''}
                            onChangeText={v => setSupplyQtys(prev => ({ ...prev, [s.item]: v }))}
                          />
                        </View>
                      ))}
                      <Text style={styles.supplyFormLabel}>When can you bring it?</Text>
                      {renderDateField()}
                      <View style={IS_WEB ? { alignItems: 'center', marginTop: 10 } : { marginTop: 10 }}>
                        <TouchableOpacity
                          style={[styles.respondBtn, { backgroundColor: '#16A34A' }, IS_WEB && { minWidth: 200, paddingHorizontal: 40 }]}
                          onPress={submitSupplies}
                          disabled={submitting}
                        >
                          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.respondBtnTextLight}>Confirm Donation</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    /* No specific items listed — general donation form */
                    <View>
                      <Text style={styles.supplyFormLabel}>What can you bring?</Text>
                      <TextInput
                        style={styles.supplyFormInput}
                        placeholder="e.g. 2 cases of bottled water"
                        value={donateItem}
                        onChangeText={setDonateItem}
                      />
                      <Text style={styles.supplyFormLabel}>Quantity</Text>
                      <TextInput
                        style={styles.supplyFormInput}
                        placeholder="e.g. 2"
                        keyboardType="numeric"
                        value={donateQty}
                        onChangeText={setDonateQty}
                      />
                      <Text style={styles.supplyFormLabel}>When can you bring it?</Text>
                      {renderDateField()}
                      <View style={IS_WEB ? { alignItems: 'center', marginTop: 10 } : { marginTop: 10 }}>
                        <TouchableOpacity
                          style={[styles.respondBtn, { backgroundColor: '#16A34A' }, IS_WEB && { minWidth: 200, paddingHorizontal: 40 }]}
                          onPress={submitGeneralDonation}
                          disabled={submitting}
                        >
                          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.respondBtnTextLight}>Confirm Donation</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* --- REQUESTOR DASHBOARD (org's own broadcast) --- */}
        {isMyOwnBroadcast && (responseData?.volunteerList?.length > 0 || responseData?.supplyList?.length > 0) && (
          <View>
            <View style={styles.divider} />
            <View style={styles.dashboardSection}>
              {showVolunteer && (
                <View style={styles.dashboardBlock}>
                  <View style={styles.dashboardHeaderRow}>
                    <Text style={styles.dashboardTitle}>Volunteer Sign-Ups</Text>
                    <Text style={styles.dashboardCount}>
                      {responseData.volunteersConfirmed ?? 0}{item?.volunteersNeeded ? ` of ${item.volunteersNeeded}` : ''} confirmed
                    </Text>
                  </View>
                  {(responseData.volunteerList || []).map((v, i) => (
                    <View key={i} style={styles.dashboardRow}>
                      <Text style={styles.dashboardName}>{v.name}</Text>
                      <View style={styles.confirmedPill}><Text style={styles.confirmedPillText}>Confirmed</Text></View>
                      <Text style={styles.dashboardDate}>{v.date}</Text>
                    </View>
                  ))}
                  {(responseData.volunteerList || []).length === 0 && (
                    <Text style={styles.dashboardEmpty}>No sign-ups yet</Text>
                  )}
                </View>
              )}

              {showSupplies && (
                <View style={[styles.dashboardBlock, { marginTop: showVolunteer ? 14 : 0 }]}>
                  <View style={styles.dashboardHeaderRow}>
                    <Text style={styles.dashboardTitle}>Supplies Donations</Text>
                    <Text style={styles.dashboardCount}>{responseData.supplyDonors ?? 0} donor{responseData.supplyDonors !== 1 ? 's' : ''}</Text>
                  </View>
                  {(responseData.supplyList || []).length > 0 && (
                    <View style={styles.dashboardTableHeader}>
                      <Text style={[styles.dashboardColHeader, { flex: 1.3 }]}>Name</Text>
                      <Text style={[styles.dashboardColHeader, { flex: 1.5 }]}>Item</Text>
                      <Text style={[styles.dashboardColHeader, { flex: 0.6 }]}>Qty</Text>
                      <Text style={[styles.dashboardColHeader, { flex: 1.3 }]}>Delivery</Text>
                    </View>
                  )}
                  {(responseData.supplyList || []).map((s, i) => {
                    const firstSupply = s.supplies?.[0];
                    const itemName = firstSupply ? firstSupply.item : '—';
                    const qtyLabel = firstSupply
                      ? `${firstSupply.qty}${firstSupply.unit ? ' ' + firstSupply.unit : ''}`
                      : s.supplies?.length > 0 ? `${s.supplies.length}` : '—';
                    const isGeneral = !s.supplies?.length;
                    return (
                      <View key={i} style={[styles.dashboardRow, { alignItems: 'flex-start' }]}>
                        <Text style={[styles.dashboardName, { flex: 1.3 }]}>{s.name}</Text>
                        <Text style={[styles.dashboardRowText, { flex: 1.5 }]}>
                          {isGeneral ? 'General donation' : itemName}
                          {s.supplies?.length > 1 ? ` +${s.supplies.length - 1}` : ''}
                        </Text>
                        <Text style={[styles.dashboardRowText, { flex: 0.6 }]}>{isGeneral ? '—' : qtyLabel}</Text>
                        <Text style={[styles.dashboardRowText, { flex: 1.3 }]}>{s.whenBringing || '—'}</Text>
                      </View>
                    );
                  })}
                  {(responseData.supplyList || []).length === 0 && (
                    <Text style={styles.dashboardEmpty}>No donations yet</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* --- PHOTO (only when media is attached) --- */}
        {normalized.mediaUri && (
          <>
            <View style={styles.divider} />
            {normalized.mediaUri.toLowerCase().endsWith('.mp4') || normalized.mediaUri.toLowerCase().endsWith('.mov') ? (
              <NeedsVideoPlayer uri={normalized.mediaUri} style={styles.media} contentFit="cover" />
            ) : (
              <Image source={{ uri: normalized.mediaUri }} style={styles.media} />
            )}
          </>
        )}

        <View style={[styles.divider, !normalized.mediaUri && styles.dividerNoMedia]} />

        {/* --- POSTED BY --- */}
        {userProfile && (
          <TouchableOpacity
            style={styles.postedByRow}
            onPress={() => navigation.navigate('ProfileView', {
              userId: normalized.userId,
              readOnly: true,
            })}
            activeOpacity={0.8}
          >
            {creatorPic && !avatarError
              ? <Image source={{ uri: creatorPic }} style={styles.creatorAvatar} onError={() => setAvatarError(true)} />
              : <View style={[styles.creatorAvatar, styles.creatorAvatarFallback]}>
                  <Text style={styles.creatorInitial}>{(creatorName?.[0] || '?').toUpperCase()}</Text>
                </View>
            }
            <View>
              <Text style={styles.postedByLabel}>Posted by</Text>
              <Text style={styles.creatorName}>{creatorName}</Text>
              {!!memberSinceLabel(normalized.userId) && (
                <Text style={styles.memberSince}>{memberSinceLabel(normalized.userId)}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}

      </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerIconBtn: { padding: 8 },

  scrollContainer: {
    flexGrow: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 26,
    paddingBottom: 52,
  },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 10,
    marginBottom: 24,
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 21 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  rowLabel: { fontSize: 22, color: '#374151', marginLeft: 10, flex: 1 },
  rowValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 21 },
  dividerNoMedia: { marginTop: 150 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 13 },
  sectionHeaderText: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginLeft: 10 },
  detailsText: { fontSize: 26, color: '#1F2937', lineHeight: 38, marginBottom: 10 },

  media: {
    width: '100%',
    aspectRatio: 2.2,
    borderRadius: 18,
    backgroundColor: '#000',
  },

  postedByRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  creatorAvatar: { width: 67, height: 67, borderRadius: 34, borderWidth: 2, borderColor: '#2563EB' },
  creatorAvatarFallback: { backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  creatorInitial: { fontSize: 23, fontWeight: '900', color: '#2563EB' },
  postedByLabel: { fontSize: 16, color: '#9CA3AF', marginBottom: 2 },
  creatorName: { fontSize: 21, fontWeight: '800', color: '#0F172A' },
  memberSince: { fontSize: 16, color: '#9CA3AF', marginTop: 2 },

  respondSection: { paddingBottom: 8 },
  respondTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  respondBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  respondBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  respondBlockTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B', flex: 1 },
  respondBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  respondBtnTextLight: { fontSize: 16, fontWeight: '700', color: '#fff' },
  respondBtnTextDark: { fontSize: 16, fontWeight: '700', color: '#374151' },
  committedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  committedText: { fontSize: 15, color: '#374151', flex: 1 },
  changeLink: { fontSize: 14, color: '#2563EB', fontWeight: '600' },
  supplyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  supplyLabel: { fontSize: 15, color: '#374151', flex: 1, marginRight: 12 },
  supplyInput: {
    width: 70,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 15,
    textAlign: 'center',
    color: '#0F172A',
    backgroundColor: '#fff',
  },
  supplyFormLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 4 },
  supplyFormInput: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#fff',
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#EFF6FF',
  },
  datePickerBtnText: { fontSize: 15, color: '#1E40AF', fontWeight: '600', flex: 1 },
  datePickerBtnPlaceholder: { fontSize: 15, color: '#93C5FD', flex: 1 },

  dashboardSection: { paddingBottom: 8 },
  dashboardBlock: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  dashboardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dashboardTitle: { fontSize: 16, fontWeight: '800', color: '#14532D' },
  dashboardCount: { fontSize: 13, fontWeight: '600', color: '#15803D' },
  dashboardTableHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#BBF7D0',
    marginBottom: 4,
  },
  dashboardColHeader: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' },
  dashboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  dashboardName: { fontSize: 14, fontWeight: '600', color: '#0F172A', flex: 1.4 },
  dashboardRowText: { fontSize: 13, color: '#374151', flex: 2 },
  dashboardDate: { fontSize: 13, color: '#6B7280', flex: 0.8, textAlign: 'right' },
  dashboardEmpty: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic', paddingVertical: 8 },
  confirmedPill: {
    backgroundColor: '#BBF7D0',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginHorizontal: 8,
  },
  confirmedPillText: { fontSize: 12, fontWeight: '700', color: '#15803D' },

  fillNeedsButton: {
    backgroundColor: '#007bff',
    borderRadius: 30,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fillNeedsButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
});

export default SingleItemView;
