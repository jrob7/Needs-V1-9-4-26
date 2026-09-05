// Screens/MatchResults.js
// ─────────────────────────────────────────────────────────────────────────────
// Shows top 1–3 matched restaurants OR services.
// Left: scrollable card list. Tap a card → right-side detail modal slides up.
// Layout and feel matches the mockup (Oak & Ember style).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useContext } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, Modal, Animated, Dimensions, SafeAreaView,
  Linking, Platform, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UserContext } from '../server/CurrentUser';
import OfferCodeModal from './OfferCodeModal';
import VisitCodeModal from './VisitCodeModal';

// Opens the native Maps app (Apple Maps on iOS, Google Maps on Android).
// Falls back to google.com if the scheme isn't supported.
const openDirections = (address) => {
  if (!address) return;
  const encoded = encodeURIComponent(address);
  const nativeUrl = Platform.OS === 'ios'
    ? `maps://app?daddr=${encoded}`
    : `geo:0,0?q=${encoded}`;
  Linking.canOpenURL(nativeUrl).then(supported => {
    Linking.openURL(supported ? nativeUrl : `https://maps.google.com/?q=${encoded}`);
  }).catch(() => {
    Linking.openURL(`https://maps.google.com/?q=${encoded}`);
  });
};
import { useAuthModal } from './AuthModalContext';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  food:     { accent: '#D97706', bg: '#FFF8EE',  badge: '#16A34A', star: '#F59E0B' },
  service:  { accent: '#2563EB', bg: '#EFF6FF',  badge: '#16A34A', star: '#F59E0B' },
  nonprofit:{ accent: '#7C3AED', bg: '#F5F3FF',  badge: '#059669', star: '#7C3AED' },
};

const OFFER_COLORS = {
  orange:   { bg: '#C2710C', text: '#fff',     lightBg: '#FEF3C7' },
  blue:     { bg: '#1D4ED8', text: '#fff',     lightBg: '#EFF6FF' },
  offwhite: { bg: '#F5F0E8', text: '#1F2937',  lightBg: '#F5F0E8' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
import { NODE_API } from '../config';
import { webContainer, IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

const placeholder = (type) =>
  type === 'food'
    ? 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80'
    : 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80';

// Converts stored filename (img_xxx.jpg) to full URL
const resolveImage = (url, type) => {
  if (!url) return placeholder(type);
  if (url.startsWith('http')) return url;
  return `${NODE_API}/uploads/${url}`;
};

const formatRate = (doc) => {
  if (!doc.rateMin && !doc.rateMax) return null;
  const min = doc.rateMin ? `$${doc.rateMin}` : '';
  const max = doc.rateMax ? `$${doc.rateMax}` : '';
  const type = doc.rateType ? `/${doc.rateType}` : '';
  if (min && max) return `${min}–${max}${type}`;
  return `${min || max}${type}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT CARD (list view)
// ─────────────────────────────────────────────────────────────────────────────
function RestaurantCard({ doc, colors, onPress }) {
  const topDish = doc.topDishes?.[0];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.92}>
      {/* Cover image */}
      <Image
        source={{ uri: resolveImage(doc.coverImageUrl, 'food') }}
        style={styles.cardCover}
        resizeMode="contain"
      />

      {/* Available badge */}
      <View style={[styles.availBadge, { backgroundColor: colors.badge }]}>
        <Text style={styles.availText}>Available</Text>
      </View>

      {/* Favourite button */}
      <TouchableOpacity style={styles.favBtn}>
        <Ionicons name="heart-outline" size={18} color="#fff" />
      </TouchableOpacity>

      {/* Top dish thumbnail */}
      {topDish?.imageUrl && (
        <Image
          source={{ uri: topDish.imageUrl }}
          style={styles.dishThumb}
          resizeMode="cover"
        />
      )}

      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{doc.name}</Text>
        <Text style={[styles.cardTagline, { color: colors.accent }]}>{doc.tagline}</Text>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <Ionicons name="star" size={13} color={colors.star} />
          <Text style={styles.metaText}> 4.8 · </Text>
          {doc.priceRange && <Text style={styles.metaText}>{doc.priceRange} · </Text>}
          {doc.cuisine   && <Text style={styles.metaText}>{doc.cuisine}</Text>}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {(doc.waitMin || doc.waitMax) && (
            <View style={styles.statBox}>
              <Ionicons name="time-outline" size={16} color="#6B7280" />
              <Text style={styles.statVal}>
                {doc.waitMin}–{doc.waitMax} min
              </Text>
              <Text style={[styles.statSub, { color: colors.accent }]}>wait time</Text>
            </View>
          )}
        </View>

        {/* Top pick */}
        {topDish && (
          <View style={styles.topPickRow}>
            <Text style={[styles.topPickLabel, { color: colors.badge }]}>Top pick</Text>
            <Text style={styles.topPickName}>{topDish.name}</Text>
            <Text style={styles.topPickDesc} numberOfLines={2}>{topDish.description}</Text>
          </View>
        )}

        {/* AI match note */}
        <View style={[styles.aiNote, { backgroundColor: colors.bg }]}>
          <Ionicons name="sparkles" size={13} color={colors.accent} />
          <Text style={[styles.aiNoteText, { color: colors.accent }]}>
            Matched for your request
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE CARD (list view)
// ─────────────────────────────────────────────────────────────────────────────
function ServiceCard({ doc, colors, onPress }) {
  const cover = resolveImage(doc.portfolioImageUrls?.[0], 'service');
  const rate  = formatRate(doc);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.92}>
      <Image source={{ uri: cover }} style={styles.cardCover} resizeMode="contain" />

      <View style={[styles.availBadge, { backgroundColor: colors.badge }]}>
        <Text style={styles.availText}>Available</Text>
      </View>

      <TouchableOpacity style={styles.favBtn}>
        <Ionicons name="heart-outline" size={18} color="#fff" />
      </TouchableOpacity>

      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{doc.businessName}</Text>
        {doc.providerName ? (
          <Text style={[styles.cardTagline, { color: colors.accent }]}>{doc.providerName}</Text>
        ) : null}

        <View style={styles.metaRow}>
          <Ionicons name="star" size={13} color={colors.star} />
          <Text style={styles.metaText}> 4.8 · </Text>
          <Text style={styles.metaText}>{doc.category}</Text>
          {doc.serviceArea ? <Text style={styles.metaText}> · {doc.serviceArea}</Text> : null}
        </View>

        {rate && (
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Ionicons name="cash-outline" size={16} color="#6B7280" />
              <Text style={styles.statVal}>{rate}</Text>
              <Text style={styles.statSub}>rate</Text>
            </View>
            {doc.availability && (
              <View style={styles.statBox}>
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text style={styles.statVal}>{doc.availability}</Text>
                <Text style={styles.statSub}>availability</Text>
              </View>
            )}
          </View>
        )}

        {/* Top service */}
        {doc.topServices?.[0] && (
          <View style={styles.topPickRow}>
            <Text style={[styles.topPickLabel, { color: colors.badge }]}>Top Services</Text>
            <Text style={styles.topPickName}>{doc.topServices[0].name}</Text>
            {doc.topServices[0].price && (
              <Text style={styles.topPickDesc}>Est. ${doc.topServices[0].price}</Text>
            )}
          </View>
        )}

        <View style={[styles.aiNote, { backgroundColor: colors.bg }]}>
          <Ionicons name="sparkles" size={13} color={colors.accent} />
          <Text style={[styles.aiNoteText, { color: colors.accent }]}>
            Matched for your request
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NONPROFIT CARD (list view)
// ─────────────────────────────────────────────────────────────────────────────
function NonprofitCard({ doc, colors, onPress }) {
  const logoUri = doc.logoUrl
    ? (doc.logoUrl.startsWith('http') ? doc.logoUrl : `${NODE_API}/uploads/${doc.logoUrl}`)
    : null;
  const helpTypes = (doc.helpTypes || []).filter(Boolean);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.92}>
      {logoUri
        ? <Image source={{ uri: logoUri }} style={styles.cardCoverTall} resizeMode="cover" />
        : <View style={[styles.cardCoverTall, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="people-outline" size={60} color={colors.accent} />
          </View>
      }

      <View style={[styles.availBadge, { backgroundColor: colors.badge }]}>
        <Text style={styles.availText}>Free Resource</Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{doc.orgName}</Text>
        {doc.orgType && (
          <Text style={[styles.cardTagline, { color: colors.accent }]}>{doc.orgType}</Text>
        )}

        {helpTypes.length > 0 && (
          <View style={styles.metaRow}>
            <Ionicons name="heart-outline" size={13} color={colors.accent} />
            <Text style={styles.metaText}> {helpTypes.slice(0, 2).join(' · ')}</Text>
          </View>
        )}

        {doc.cost && (
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Ionicons name="cash-outline" size={16} color="#6B7280" />
              <Text style={styles.statVal}>{doc.cost}</Text>
              <Text style={styles.statSub}>cost</Text>
            </View>
            {doc.serviceArea && (
              <View style={styles.statBox}>
                <Ionicons name="location-outline" size={16} color="#6B7280" />
                <Text style={styles.statVal} numberOfLines={1}>{doc.serviceArea}</Text>
                <Text style={styles.statSub}>area</Text>
              </View>
            )}
          </View>
        )}

        {doc.description ? (
          <View style={styles.topPickRow}>
            <Text style={[styles.topPickLabel, { color: colors.badge }]}>About</Text>
            <Text style={styles.topPickDesc} numberOfLines={2}>{doc.description}</Text>
          </View>
        ) : null}

        <View style={[styles.aiNote, { backgroundColor: colors.bg }]}>
          <Ionicons name="sparkles" size={13} color={colors.accent} />
          <Text style={[styles.aiNoteText, { color: colors.accent }]}>Matched for your request</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NONPROFIT DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
function NonprofitDetail({ doc, colors, onClose, query }) {
  const { userId, userProfile } = useContext(UserContext);
  const { show: showAuth } = useAuthModal();
  const [notified, setNotified] = useState(false);

  const logoUri = doc.logoUrl
    ? (doc.logoUrl.startsWith('http') ? doc.logoUrl : `${NODE_API}/uploads/${doc.logoUrl}`)
    : null;
  const helpTypes = (doc.helpTypes || []).filter(Boolean);

  const notifyNonprofit = async () => {
    if (!userId) { showAuth?.(); return; }
    if (!doc.userId) { Alert.alert('Unavailable', "This organization can't be notified right now."); return; }
    try {
      const fromName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || 'Someone';
      const resp = await fetch(`${NODE_API}/createNotification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: doc.userId,
          type: 'lead',
          title: '🤝 New help request',
          body: `${fromName} is looking for help${query ? `: "${query}"` : '.'}`,
          needText: query || '',
          fromUserId: userId,
          fromName,
        }),
      });
      if (!resp.ok) throw new Error('Server error');
      setNotified(true);
      Alert.alert('✅ Request Sent', `${doc.orgName} has been notified and will reach out to you.`);
    } catch (e) {
      Alert.alert('Error', "Couldn't notify this organization. Please try again.");
    }
  };

  const contact = (icon, label, value, action) => !value ? null : (
    <TouchableOpacity style={styles.tipRow} onPress={action}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <Text style={[styles.tipText, action && { color: colors.accent, textDecorationLine: 'underline' }]}>
        {label ? `${label}: ` : ''}{value}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
      {/* Hero — full width, same as restaurant/service */}
      <View style={styles.detailHeroWrap}>
        {logoUri
          ? <Image source={{ uri: logoUri }} style={styles.detailHero} resizeMode="cover" />
          : <View style={[styles.detailHero, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="people-outline" size={80} color={colors.accent} />
            </View>
        }
        <TouchableOpacity style={styles.detailBackBtn} onPress={onClose}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.detailBody}>
        {doc.orgType && (
          <View style={[styles.inlineBadge, { backgroundColor: colors.accent }]}>
            <Text style={styles.availText}>{doc.orgType}</Text>
          </View>
        )}

        <Text style={styles.detailName}>{doc.orgName}</Text>

        {doc.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.aboutText}>{doc.description}</Text>
          </View>
        ) : null}

        {helpTypes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ways We Help</Text>
            {helpTypes.map((h, i) => (
              <View key={i} style={styles.tipRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.badge} />
                <Text style={styles.tipText}>{h}</Text>
              </View>
            ))}
          </View>
        )}

        {doc.whoYouHelp ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Who We Help</Text>
            <Text style={styles.aboutText}>{doc.whoYouHelp}</Text>
          </View>
        ) : null}

        <View style={styles.statsGrid}>
          {doc.cost && (
            <View style={styles.statGridBox}>
              <Text style={styles.statGridVal}>{doc.cost}</Text>
              <Text style={styles.statGridLbl}>Cost</Text>
            </View>
          )}
          {doc.availability && (
            <View style={styles.statGridBox}>
              <Text style={styles.statGridVal} numberOfLines={2}>{doc.availability}</Text>
              <Text style={styles.statGridLbl}>Availability</Text>
            </View>
          )}
          {doc.serviceArea && (
            <View style={styles.statGridBox}>
              <Text style={styles.statGridVal} numberOfLines={2}>{doc.serviceArea}</Text>
              <Text style={styles.statGridLbl}>Service Area</Text>
            </View>
          )}
        </View>

        {doc.requirements ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Requirements</Text>
            <Text style={styles.aboutText}>{doc.requirements}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          {contact('call-outline',     null,    doc.phone,   () => Linking.openURL(`tel:${doc.phone}`))}
          {contact('mail-outline',     null,    doc.email,   () => Linking.openURL(`mailto:${doc.email}`))}
          {contact('globe-outline',    null,    doc.website, () => Linking.openURL(doc.website?.startsWith('http') ? doc.website : `https://${doc.website}`))}
          {contact('location-outline', null,    doc.address, () => openDirections(doc.address))}
          {doc.languages ? contact('language-outline', 'Languages', doc.languages, null) : null}
        </View>

        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.ctaPrimary, { flex: 1, backgroundColor: notified ? '#9CA3AF' : colors.accent }]}
            onPress={notifyNonprofit}
            disabled={notified}
          >
            <Text style={styles.ctaPrimaryText}>
              {notified ? '✅ Request Sent' : `Notify ${doc.orgName}`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 30 }} />
      </View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
export function RestaurantDetail({ doc, colors, onClose }) {
  const [menuVisible, setMenuVisible]       = useState(false);
  const [offerModalVisible, setOfferModal]  = useState(false);
  const [visitModalVisible, setVisitModal]  = useState(false);

  return (
    <>
    <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={styles.detailHeroWrap}>
        <Image
          source={{ uri: resolveImage(doc.coverImageUrl, 'food') }}
          style={styles.detailHero}
          resizeMode="cover"
        />
        <TouchableOpacity style={styles.detailBackBtn} onPress={onClose}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.detailFavBtn}>
          <Ionicons name="heart-outline" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.detailShareBtn}>
          <Ionicons name="share-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.detailBody}>
        <View style={[styles.inlineBadge, { backgroundColor: colors.badge }]}>
          <Text style={styles.availText}>Available</Text>
        </View>

        <Text style={styles.detailName}>{doc.name}</Text>

        {/* Tags */}
        {doc.tagline && (
          <View style={styles.tagRow}>
            {doc.tagline.split('•').map((t, i) => (
              <Text key={i} style={[styles.tag, { color: colors.accent }]}>
                {t.trim()}{i < doc.tagline.split('•').length - 1 ? ' • ' : ''}
              </Text>
            ))}
          </View>
        )}

        {/* Rating row */}
        <View style={styles.metaRow}>
          <Ionicons name="star" size={14} color={colors.star} />
          <Text style={styles.metaText}> 4.8 (856) · </Text>
          {doc.priceRange && <Text style={styles.metaText}>{doc.priceRange} · </Text>}
          {doc.cuisine   && <Text style={styles.metaText}>{doc.cuisine}</Text>}
        </View>

        {/* Top Dishes */}
        {doc.topDishes?.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top {Math.min(doc.topDishes.length, 3)} Dishes</Text>
              {doc.menuUrl
                ? <TouchableOpacity onPress={() => setMenuVisible(true)}>
                    <Text style={[styles.seeAll, { color: colors.accent }]}>See full menu ›</Text>
                  </TouchableOpacity>
                : <Text style={[styles.seeAll, { color: '#CBD5E1' }]}>See full menu ›</Text>
              }
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              {doc.topDishes.slice(0, 3).map((dish, i) => (
                <View key={i} style={styles.dishCard}>
                  <View style={[styles.dishRankBadge, { backgroundColor: colors.accent }]}>
                    <Text style={styles.dishRankText}>{i + 1}</Text>
                  </View>
                  <Image
                    source={{ uri: resolveImage(dish.imageUrl, 'food') }}
                    style={styles.dishImg}
                    resizeMode="cover"
                  />
                  <Text style={styles.dishName} numberOfLines={1}>{dish.name}</Text>
                  <Text style={styles.dishDesc} numberOfLines={2}>{dish.description}</Text>
                  {dish.likePercent != null && (
                    <View style={styles.dishLikeRow}>
                      <Ionicons name="thumbs-up" size={11} color={colors.badge} />
                      <Text style={[styles.dishLike, { color: colors.badge }]}> {dish.likePercent}%</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Wait / Busy / Speed stats */}
        {(doc.waitMin || doc.waitMax) && (
          <View style={styles.statsGrid}>
            <View style={styles.statGridBox}>
              <Text style={styles.statGridVal}>{doc.waitMin} min</Text>
              <Text style={styles.statGridLbl}>Current wait</Text>
              <Text style={[styles.statGridSub, { color: colors.accent }]}>Busy right now</Text>
            </View>
            <View style={styles.statGridBox}>
              <Text style={styles.statGridVal}>High</Text>
              <Text style={styles.statGridLbl}>Busy level</Text>
              <View style={styles.busyBar}>
                {[1,2,3,4,5].map(n => (
                  <View key={n} style={[styles.busySegment,
                    { backgroundColor: n <= 3 ? colors.accent : '#E5E7EB' }]} />
                ))}
              </View>
            </View>
            <View style={styles.statGridBox}>
              <Text style={styles.statGridVal}>Moderate</Text>
              <Text style={styles.statGridLbl}>Service speed</Text>
              <View style={styles.busyBar}>
                {[1,2,3,4,5].map(n => (
                  <View key={n} style={[styles.busySegment,
                    { backgroundColor: n <= 2 ? '#F59E0B' : '#E5E7EB' }]} />
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Good to know */}
        {doc.goodToKnow?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Good to know</Text>
            {doc.goodToKnow.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.badge} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Special Offer */}
        {doc.offer?.enabled && (doc.offer.headline || doc.offer.imageUrl) && (() => {
          const oc = OFFER_COLORS[doc.offer.bgColor] || OFFER_COLORS.orange;
          return (
            <View style={styles.section}>
              {/* Section divider */}
              <View style={styles.offerDividerRow}>
                <View style={styles.offerDividerLine} />
                <Text style={styles.offerDividerLabel}>OFFER</Text>
                <View style={styles.offerDividerLine} />
              </View>

              {/* Banner */}
              <View style={[styles.offerBanner, { backgroundColor: oc.bg }]}>
                <View style={styles.offerLeft}>
                  <Text style={styles.offerHeadline}>{doc.offer.headline}</Text>
                  {!!doc.offer.description && (
                    <Text style={styles.offerDesc}>{doc.offer.description}</Text>
                  )}
                </View>
                {!!doc.offer.imageUrl && (
                  <Image
                    source={{ uri: resolveImage(doc.offer.imageUrl, 'food') }}
                    style={styles.offerImg}
                    resizeMode="cover"
                  />
                )}
              </View>

              {/* Details row — unchanged */}
              <View style={styles.offerDetailsRow}>
                {!!(doc.offer.timeStart && doc.offer.timeEnd) && (
                  <View style={styles.offerDetailItem}>
                    <Ionicons name="time-outline" size={13} color="#6B7280" />
                    <Text style={styles.offerDetailText}> {doc.offer.timeStart} – {doc.offer.timeEnd}</Text>
                  </View>
                )}
                {!!doc.offer.validityLabel && (
                  <View style={styles.offerDetailItem}>
                    <Ionicons name="calendar-outline" size={13} color="#6B7280" />
                    <Text style={styles.offerDetailText}> {doc.offer.validityLabel}</Text>
                  </View>
                )}
                {!!doc.offer.needCoins && (
                  <View style={styles.offerDetailItem}>
                    <Ionicons name="star" size={13} color="#F59E0B" />
                    <Text style={styles.offerDetailText}> {doc.offer.needCoins} NeedCoins</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.redeemBtn, { backgroundColor: oc.bg }]}
                  onPress={() => setOfferModal(true)}
                >
                  <Text style={[styles.redeemBtnText, { color: oc.text }]}>Redeem</Text>
                </TouchableOpacity>
              </View>

              {/* Info row — unchanged */}
              <View style={styles.offerInfoRow}>
                <View style={[styles.offerShieldWrap, { backgroundColor: oc.lightBg }]}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={oc.bg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerInfoText}>Redeem with NeedCoins when you pay at the restaurant.</Text>
                  <Text style={styles.offerInfoSub}>Limited time offers • New offers added often</Text>
                </View>
                <Text style={[styles.offerHowIt, { color: oc.bg }]}>How it works ›</Text>
              </View>
            </View>
          );
        })()}

        {/* Divider between offer info and visit rewards */}
        <View style={styles.sectionDivider} />

        {/* Visit Rewards */}
        <View style={styles.visitCard}>
          <Image source={require('../assets/NeedCoin.png')} style={styles.visitCoinImg} resizeMode="contain" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.visitTitle}>Visit Rewards</Text>
            <Text style={styles.visitDesc}>Check in at the restaurant and earn NeedCoins for your visit.</Text>
          </View>
          <View style={styles.visitBtnCol}>
            <TouchableOpacity style={styles.visitBtn} onPress={() => setVisitModal(true)}>
              <Text style={styles.visitBtnText}>Get Visit{'\n'}Reward</Text>
            </TouchableOpacity>
            <Text style={styles.visitEarn}>Earn 10 NeedCoins</Text>
          </View>
        </View>

        {/* CTA buttons — GET DIRECTIONS first, CALL RESTAURANT second */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.ctaPrimary, { backgroundColor: colors.accent }]}
            onPress={() => openDirections(doc.address)}
          >
            <Text style={styles.ctaPrimaryText}>GET DIRECTIONS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ctaPrimary, { backgroundColor: '#1D4ED8' }]}
            onPress={() => doc.phone && Linking.openURL(`tel:${doc.phone}`)}
          >
            <Text style={styles.ctaPrimaryText}>CALL RESTAURANT</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 30 }} />
      </View>
    </ScrollView>

    {/* Full-screen menu image modal */}
    <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
      <View style={styles.menuFullOverlay}>
        <TouchableOpacity style={styles.menuFullClose} onPress={() => setMenuVisible(false)}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          maximumZoomScale={3}
          minimumZoomScale={1}
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={{ uri: doc.menuUrl }}
            style={styles.menuFullImg}
            resizeMode="contain"
          />
        </ScrollView>
      </View>
    </Modal>

    <OfferCodeModal
      visible={offerModalVisible}
      onClose={() => setOfferModal(false)}
      restaurant={doc}
    />
    <VisitCodeModal
      visible={visitModalVisible}
      onClose={() => setVisitModal(false)}
      restaurant={doc}
    />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ServiceDetail({ doc, colors, onClose, query }) {
  const cover = resolveImage(doc.portfolioImageUrls?.[0], 'service');
  const { userId, userProfile } = useContext(UserContext);
  const { show: showAuth } = useAuthModal();
  const [notified, setNotified] = useState(false);

  const notifyBusiness = async () => {
    if (!userId) { showAuth?.(); return; }
    if (!doc.userId) { Alert.alert('Unavailable', "This provider can't be notified right now."); return; }
    try {
      const fromName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || 'Someone';
      const resp = await fetch(`${NODE_API}/createNotification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: doc.userId,
          type: 'lead',
          title: '📋 New service request',
          body: `${fromName} needs help with: "${query}"`,
          needText: query,
          fromUserId: userId,
          fromName,
        }),
      });
      if (!resp.ok) throw new Error('Server error');
      setNotified(true);
      Alert.alert('✅ Notified', `${doc.businessName} has been notified about your request.`);
    } catch (e) {
      Alert.alert('Error', "Couldn't notify this provider. Please try again.");
    }
  };

  return (
    <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.detailHeroWrap}>
        <Image source={{ uri: cover }} style={styles.detailHero} resizeMode="cover" />
        <TouchableOpacity style={styles.detailBackBtn} onPress={onClose}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.detailBody}>
        <View style={[styles.availBadge, {
          position: 'relative', top: 0, left: 0, width: '30%',
          alignItems: 'center', paddingVertical: 8,
          backgroundColor: colors.badge, marginBottom: 10,
        }]}>
          <Text style={styles.availText}>Available</Text>
        </View>

        <Text style={styles.detailName}>{doc.businessName}</Text>
        {doc.providerName && (
          <Text style={[styles.cardTagline, { color: colors.accent, marginBottom: 6 }]}>
            {doc.providerName}
          </Text>
        )}

        <View style={styles.metaRow}>
          <Ionicons name="star" size={14} color={colors.star} />
          <Text style={styles.metaText}> 4.8 · {doc.category}</Text>
          {doc.serviceArea && <Text style={styles.metaText}> · {doc.serviceArea}</Text>}
        </View>

        {doc.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.aboutText}>{doc.description}</Text>
          </View>
        ) : null}

        {/* Top services */}
        {doc.topServices?.filter(s => s.name).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Services</Text>
            {doc.topServices.filter(s => s.name).map((s, i) => (
              <View key={i} style={styles.serviceRow}>
                <Text style={styles.serviceRowName}>{s.name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsGrid}>
          {doc.availability && (
            <View style={styles.statGridBox}>
              <Text style={styles.statGridVal}>{doc.availability}</Text>
              <Text style={styles.statGridLbl}>Availability</Text>
            </View>
          )}
          {doc.responseTime && (
            <View style={styles.statGridBox}>
              <Text style={styles.statGridVal} numberOfLines={2}>{doc.responseTime}</Text>
              <Text style={styles.statGridLbl}>Response</Text>
            </View>
          )}
        </View>

        {/* Portfolio */}
        {doc.portfolioImageUrls?.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Portfolio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              {doc.portfolioImageUrls.map((url, i) => (
                <Image key={i} source={{ uri: resolveImage(url, 'service') }} style={styles.portfolioImg} resizeMode="cover" />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Licensed */}
        {doc.licensed != null && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Credentials</Text>
            <View style={styles.tipRow}>
              <Ionicons
                name={doc.licensed ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={doc.licensed ? colors.badge : '#EF4444'}
              />
              <Text style={styles.tipText}>
                {doc.licensed ? `Licensed${doc.licenseNumber ? ` · ${doc.licenseNumber}` : ''}` : 'Not licensed'}
              </Text>
            </View>
            {doc.certifications ? (
              <View style={styles.tipRow}>
                <Ionicons name="ribbon-outline" size={16} color={colors.accent} />
                <Text style={styles.tipText}>{doc.certifications}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* CTA */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.ctaPrimary, { flex: 1, backgroundColor: notified ? '#9CA3AF' : colors.accent }]}
            onPress={notifyBusiness}
            disabled={notified}
          >
            <Text style={styles.ctaPrimaryText}>{notified ? '✅ Notified' : `Notify ${doc.businessName}`}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 30 }} />
      </View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function MatchResults() {
  const navigation = useNavigation();
  const route      = useRoute();

  const { matches = [], type = 'food', query = '' } = route.params || {};
  const colors = C[type] || C.food;
  const isFood     = type === 'food';
  const isNonprofit = type === 'nonprofit';

  const [selected, setSelected] = useState(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  const openDetail = (doc) => {
    setSelected(doc);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  };

  const closeDetail = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_H,
      duration: 280,
      useNativeDriver: true,
    }).start(() => setSelected(null));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[{ flex: 1 }, webContainer]}>
      {/* Header */}
      <View style={[styles.header, IS_WEB && { paddingTop: WEB_HEADER_HEIGHT + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={22} color="#111" />
        </TouchableOpacity>
        <View style={styles.headerSearch}>
          <Ionicons name="search" size={15} color="#9CA3AF" style={{ marginRight: 6 }} />
          <Text style={styles.headerQuery} numberOfLines={1}>{query}</Text>
        </View>
        <TouchableOpacity style={styles.headerFilter}>
          <Ionicons name="options-outline" size={20} color="#111" />
        </TouchableOpacity>
      </View>

      {/* Results count */}
      <Text style={styles.resultsLabel}>
        {matches.length} {isNonprofit ? 'resource' : isFood ? 'restaurant' : 'service'}{matches.length !== 1 ? 's' : ''} matched
      </Text>

      {/* Card list */}
      {matches.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name={isNonprofit ? 'people-outline' : isFood ? 'restaurant-outline' : 'construct-outline'} size={52} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptyBody}>
            {isNonprofit
              ? 'No community resources found. Try dialing 211 for local support.'
              : `Be the first to upload a ${isFood ? 'restaurant' : 'service'} in your area!`}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {matches.map((doc, i) => (
            isNonprofit
              ? <NonprofitCard key={i} doc={doc} colors={colors} onPress={() => openDetail(doc)} />
              : isFood
                ? <RestaurantCard key={i} doc={doc} colors={colors} onPress={() => openDetail(doc)} />
                : <ServiceCard    key={i} doc={doc} colors={colors} onPress={() => openDetail(doc)} />
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {/* Sliding detail modal */}
      {selected && (
        <Modal transparent animationType="none" visible={!!selected} onRequestClose={closeDetail}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalDismiss} onPress={closeDetail} activeOpacity={1} />
            <Animated.View style={[styles.modalSheet, { transform: [{ translateY: slideAnim }] }]}>
              {isNonprofit
                ? <NonprofitDetail  doc={selected} colors={colors} onClose={closeDetail} query={query} />
                : isFood
                  ? <RestaurantDetail doc={selected} colors={colors} onClose={closeDetail} />
                  : <ServiceDetail    doc={selected} colors={colors} onClose={closeDetail} query={query} />
              }
            </Animated.View>
          </View>
        </Modal>
      )}
      </View>{/* end webContainer */}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: IS_WEB ? 18 : 14, paddingVertical: IS_WEB ? 13 : 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerBack: { padding: IS_WEB ? 5 : 4, marginRight: IS_WEB ? 10 : 8 },
  headerSearch: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3F4F6', borderRadius: IS_WEB ? 13 : 10,
    paddingHorizontal: IS_WEB ? 13 : 10, paddingVertical: IS_WEB ? 10 : 8,
  },
  headerQuery: { fontSize: IS_WEB ? 18 : 14, color: '#374151', flex: 1 },
  headerFilter: { padding: IS_WEB ? 5 : 4, marginLeft: IS_WEB ? 10 : 8 },
  resultsLabel: {
    fontSize: IS_WEB ? 17 : 13, color: '#6B7280', fontWeight: '500',
    paddingHorizontal: IS_WEB ? 21 : 16, paddingVertical: IS_WEB ? 13 : 10,
  },

  // List
  list: { paddingHorizontal: IS_WEB ? 18 : 14 },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: IS_WEB ? 23 : 18,
    marginBottom: IS_WEB ? 26 : 20,
    shadowColor: '#000', shadowOpacity: 0.08,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 4, overflow: 'hidden',
  },
  cardCover: { width: '100%', aspectRatio: 1.11, backgroundColor: '#111' },
  cardCoverTall: { width: '100%', aspectRatio: 0.72, backgroundColor: '#fff' },
  availBadge: {
    position: 'absolute', top: IS_WEB ? 18 : 14, left: IS_WEB ? 18 : 14,
    paddingHorizontal: IS_WEB ? 13 : 10, paddingVertical: IS_WEB ? 5 : 4,
    borderRadius: 20,
  },
  inlineBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: IS_WEB ? 13 : 10, paddingVertical: IS_WEB ? 5 : 4,
    borderRadius: 20, marginBottom: IS_WEB ? 13 : 10,
  },
  availText: { color: '#fff', fontSize: IS_WEB ? 16 : 12, fontWeight: '700' },
  favBtn: {
    position: 'absolute', top: IS_WEB ? 16 : 12, right: IS_WEB ? 16 : 12,
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: IS_WEB ? 9 : 7,
  },
  dishThumb: {
    position: 'absolute', top: IS_WEB ? 16 : 12, right: IS_WEB ? 16 : 12,
    width: IS_WEB ? 73 : 56, height: IS_WEB ? 73 : 56, borderRadius: IS_WEB ? 37 : 28,
    borderWidth: 2, borderColor: '#fff',
  },
  cardBody: { padding: IS_WEB ? 18 : 14 },
  cardName: { fontSize: IS_WEB ? 26 : 20, fontWeight: '800', color: '#111', marginBottom: IS_WEB ? 3 : 2 },
  cardTagline: { fontSize: IS_WEB ? 17 : 13, fontWeight: '600', marginBottom: IS_WEB ? 8 : 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: IS_WEB ? 13 : 10, flexWrap: 'wrap' },
  metaText: { fontSize: IS_WEB ? 17 : 13, color: '#6B7280' },
  statsRow: { flexDirection: 'row', gap: IS_WEB ? 10 : 8, marginBottom: IS_WEB ? 13 : 10 },
  statBox: {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: IS_WEB ? 13 : 10,
    padding: IS_WEB ? 13 : 10, alignItems: 'center',
  },
  statVal: { fontSize: IS_WEB ? 17 : 13, fontWeight: '700', color: '#111', marginTop: IS_WEB ? 3 : 2 },
  statSub: { fontSize: IS_WEB ? 14 : 11, marginTop: 1 },
  topPickRow: {
    backgroundColor: '#F9FAFB', borderRadius: IS_WEB ? 13 : 10,
    padding: IS_WEB ? 13 : 10, marginBottom: IS_WEB ? 13 : 10,
  },
  topPickLabel: { fontSize: IS_WEB ? 14 : 11, fontWeight: '700', marginBottom: IS_WEB ? 3 : 2 },
  topPickName:  { fontSize: IS_WEB ? 20 : 15, fontWeight: '700', color: '#111', marginBottom: IS_WEB ? 3 : 2 },
  topPickDesc:  { fontSize: IS_WEB ? 17 : 13, color: '#6B7280' },
  aiNote: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: IS_WEB ? 10 : 8, padding: IS_WEB ? 10 : 8, gap: IS_WEB ? 7 : 5,
  },
  aiNoteText: { fontSize: IS_WEB ? 16 : 12, fontWeight: '600' },

  // Detail modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    height: SCREEN_H * 0.92,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
    maxWidth: IS_WEB ? 960 : undefined,
    width: '100%',
    alignSelf: 'center',
  },
  detailScroll: { flex: 1 },
  detailHeroWrap: { width: '100%', height: IS_WEB ? 494 : 380, position: 'relative' },
  detailHero: { width: '100%', height: IS_WEB ? 494 : 380 },
  detailBackBtn: {
    position: 'absolute', top: IS_WEB ? 18 : 14, left: IS_WEB ? 18 : 14,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: IS_WEB ? 9 : 7,
  },
  detailFavBtn: {
    position: 'absolute', top: IS_WEB ? 18 : 14, right: IS_WEB ? 70 : 54,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: IS_WEB ? 9 : 7,
  },
  detailShareBtn: {
    position: 'absolute', top: IS_WEB ? 18 : 14, right: IS_WEB ? 18 : 14,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: IS_WEB ? 9 : 7,
  },
  detailBody: { padding: IS_WEB ? 23 : 18 },
  detailName: { fontSize: IS_WEB ? 34 : 26, fontWeight: '900', color: '#111', marginBottom: IS_WEB ? 5 : 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: IS_WEB ? 10 : 8 },
  tag: { fontSize: IS_WEB ? 17 : 13, fontWeight: '700' },

  // Section
  section: { marginTop: IS_WEB ? 23 : 18 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: IS_WEB ? 21 : 16, fontWeight: '800', color: '#111' },
  seeAll: { fontSize: IS_WEB ? 17 : 13, fontWeight: '600' },
  aboutText: { fontSize: IS_WEB ? 18 : 14, color: '#374151', lineHeight: IS_WEB ? 27 : 21, marginTop: IS_WEB ? 10 : 8 },

  // Dish card
  dishCard: { width: IS_WEB ? 182 : 140, marginRight: IS_WEB ? 16 : 12 },
  dishRankBadge: {
    position: 'absolute', top: IS_WEB ? 8 : 6, left: IS_WEB ? 8 : 6, zIndex: 1,
    width: IS_WEB ? 29 : 22, height: IS_WEB ? 29 : 22, borderRadius: IS_WEB ? 15 : 11,
    alignItems: 'center', justifyContent: 'center',
  },
  dishRankText: { color: '#fff', fontSize: IS_WEB ? 14 : 11, fontWeight: '800' },
  dishImg: { width: IS_WEB ? 182 : 140, height: IS_WEB ? 130 : 100, borderRadius: IS_WEB ? 16 : 12, marginBottom: IS_WEB ? 8 : 6 },
  dishName: { fontSize: IS_WEB ? 17 : 13, fontWeight: '700', color: '#111' },
  dishDesc: { fontSize: IS_WEB ? 14 : 11, color: '#6B7280', marginTop: IS_WEB ? 3 : 2 },
  dishLikeRow: { flexDirection: 'row', alignItems: 'center', marginTop: IS_WEB ? 5 : 4 },
  dishLike: { fontSize: IS_WEB ? 14 : 11, fontWeight: '700' },

  // Stats grid
  statsGrid: {
    flexDirection: 'row', gap: IS_WEB ? 10 : 8, marginTop: IS_WEB ? 21 : 16,
    backgroundColor: '#F9FAFB', borderRadius: IS_WEB ? 18 : 14, padding: IS_WEB ? 16 : 12,
  },
  statGridBox: { flex: 1, alignItems: 'center' },
  statGridVal: { fontSize: IS_WEB ? 18 : 14, fontWeight: '800', color: '#111', textAlign: 'center' },
  statGridLbl: { fontSize: IS_WEB ? 13 : 10, color: '#9CA3AF', marginTop: IS_WEB ? 3 : 2 },
  statGridSub: { fontSize: IS_WEB ? 13 : 10, fontWeight: '600', marginTop: 1 },
  busyBar: { flexDirection: 'row', gap: IS_WEB ? 4 : 3, marginTop: IS_WEB ? 5 : 4 },
  busySegment: { width: IS_WEB ? 18 : 14, height: IS_WEB ? 5 : 4, borderRadius: 2 },

  // Good to know / tips
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 10 : 8, marginTop: IS_WEB ? 10 : 8 },
  tipText: { fontSize: IS_WEB ? 17 : 13, color: '#374151', flex: 1 },

  // Service rows
  serviceRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: IS_WEB ? 13 : 10,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  serviceRowName:  { fontSize: IS_WEB ? 18 : 14, color: '#111', fontWeight: '600' },

  // Portfolio
  portfolioImg: { width: IS_WEB ? 156 : 120, height: IS_WEB ? 117 : 90, borderRadius: IS_WEB ? 13 : 10, marginRight: IS_WEB ? 13 : 10 },

  // CTAs
  ctaRow: { flexDirection: 'row', gap: IS_WEB ? 13 : 10, marginTop: IS_WEB ? 31 : 24 },
  ctaSecondary: {
    flex: 1, paddingVertical: IS_WEB ? 21 : 16, borderRadius: IS_WEB ? 16 : 12,
    borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center',
  },
  ctaSecondaryText: { fontSize: IS_WEB ? 17 : 13, fontWeight: '800', color: '#111' },
  ctaPrimary: {
    flex: 1, paddingVertical: IS_WEB ? 21 : 16, borderRadius: IS_WEB ? 16 : 12, alignItems: 'center',
  },
  ctaPrimaryText: { fontSize: IS_WEB ? 17 : 13, fontWeight: '800', color: '#fff' },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: IS_WEB ? 23 : 18, fontWeight: '800', color: '#374151', marginTop: IS_WEB ? 21 : 16 },
  emptyBody:  { fontSize: IS_WEB ? 18 : 14, color: '#9CA3AF', textAlign: 'center', marginTop: IS_WEB ? 10 : 8 },

  menuFullOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.93)',
    justifyContent: 'center',
  },
  menuFullClose: {
    position: 'absolute', top: 54, right: 18, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  menuFullImg: {
    width: '100%', height: 600,
  },

  offerDividerRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: IS_WEB ? 18 : 14,
  },
  offerDividerLine: {
    flex: 1, height: 1, backgroundColor: '#E5E7EB',
  },
  offerDividerLabel: {
    fontSize: IS_WEB ? 14 : 11, fontWeight: '800', letterSpacing: 2,
    color: '#000', marginHorizontal: IS_WEB ? 16 : 12,
  },
  offerBanner: {
    borderRadius: IS_WEB ? 18 : 14, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', minHeight: IS_WEB ? 169 : 130,
  },
  offerLeft: {
    flex: 1, padding: IS_WEB ? 23 : 18, justifyContent: 'center',
  },
  offerHeadline: {
    fontSize: IS_WEB ? 34 : 26, fontWeight: '900', lineHeight: IS_WEB ? 42 : 32, marginBottom: IS_WEB ? 8 : 6, color: '#000',
  },
  offerDesc: {
    fontSize: IS_WEB ? 21 : 16, fontWeight: '500', lineHeight: IS_WEB ? 29 : 22, color: '#000',
  },
  offerImg: {
    width: IS_WEB ? 169 : 130, height: IS_WEB ? 169 : 130,
  },
  offerDetailsRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: IS_WEB ? 13 : 10, paddingVertical: IS_WEB ? 16 : 12,
  },
  offerDetailItem: {
    flexDirection: 'row', alignItems: 'center',
  },
  offerDetailText: {
    fontSize: IS_WEB ? 17 : 13, color: '#374151', fontWeight: '500',
  },
  redeemBtn: {
    marginLeft: 'auto', paddingVertical: IS_WEB ? 10 : 8, paddingHorizontal: IS_WEB ? 23 : 18,
    borderRadius: IS_WEB ? 26 : 20,
  },
  redeemBtnText: {
    fontSize: IS_WEB ? 17 : 13, fontWeight: '700',
  },
  offerInfoRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: IS_WEB ? 16 : 12, paddingTop: IS_WEB ? 16 : 12,
  },
  offerShieldWrap: {
    width: IS_WEB ? 52 : 40, height: IS_WEB ? 52 : 40, borderRadius: IS_WEB ? 26 : 20,
    alignItems: 'center', justifyContent: 'center',
  },
  offerInfoText: {
    fontSize: IS_WEB ? 17 : 13, fontWeight: '600', color: '#111',
  },
  offerInfoSub: {
    fontSize: IS_WEB ? 14 : 11, color: '#9CA3AF', marginTop: IS_WEB ? 3 : 2,
  },
  offerHowIt: {
    fontSize: IS_WEB ? 17 : 13, fontWeight: '700',
  },

  sectionDivider: {
    height: 1, backgroundColor: '#F3F4F6', marginBottom: IS_WEB ? 21 : 16,
  },
  visitCard: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#DCFCE7', borderRadius: IS_WEB ? 21 : 16,
    padding: IS_WEB ? 21 : 16, marginBottom: IS_WEB ? 21 : 16,
  },
  visitCoinImg: { width: IS_WEB ? 104 : 80, height: IS_WEB ? 104 : 80, marginLeft: IS_WEB ? -21 : -16 },
  visitTitle:   { fontSize: IS_WEB ? 21 : 16, fontWeight: '900', color: '#14532D', marginBottom: IS_WEB ? 4 : 3 },
  visitDesc:    { fontSize: IS_WEB ? 16 : 12, color: '#166534', lineHeight: IS_WEB ? 22 : 17 },
  visitBtnCol:  { alignItems: 'center', gap: 4, marginLeft: IS_WEB ? 16 : 12, marginRight: IS_WEB ? -21 : -16 },
  visitBtn: {
    backgroundColor: '#15803D', borderRadius: IS_WEB ? 16 : 12,
    paddingVertical: IS_WEB ? 13 : 10, paddingHorizontal: IS_WEB ? 18 : 14, alignItems: 'center',
  },
  visitBtnText: { color: '#fff', fontSize: IS_WEB ? 17 : 13, fontWeight: '800', textAlign: 'center', lineHeight: IS_WEB ? 22 : 17 },
  visitEarn:    { fontSize: IS_WEB ? 13 : 10, fontWeight: '600', color: '#15803D' },
});