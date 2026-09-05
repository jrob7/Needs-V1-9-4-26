// Screens/UploadRestaurant.js
import React, { useState, useContext } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Image, Alert, TouchableOpacity, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserContext } from '../server/CurrentUser';
import { authFetch } from '../server/api';

const BASE_URL = 'http://localhost:3000';
const resolveImg = (raw) => (!raw ? null : raw.startsWith('http') ? raw : `${BASE_URL}/uploads/${raw}`);

const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'];
const CUISINES = ['Mexican', 'American', 'Italian', 'Japanese', 'Chinese', 'Thai', 'Indian', 'Mediterranean', 'Korean', 'Other'];
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const OFFER_BG_OPTIONS = [
  { key: 'orange',   color: '#C2710C', label: 'Orange'    },
  { key: 'blue',     color: '#1D4ED8', label: 'Blue'      },
  { key: 'offwhite', color: '#F5F0E8', label: 'Off-White' },
];

export default function UploadRestaurant({ route, navigation, onSubmitSuccess, onBack, pendingAccount } = {}) {
  const { userId, setUserId, setAccountType, setBusinessType } = useContext(UserContext);
  const insets = useSafeAreaInsets();

  const editMode    = route?.params?.editMode    || false;
  const existingDoc = route?.params?.existingDoc || null;

  // ── Basic Info ──────────────────────────────────────────────
  const [name, setName]             = useState(existingDoc?.name || '');
  const [tagline, setTagline]       = useState(existingDoc?.tagline || '');
  const [cuisine, setCuisine]       = useState(existingDoc?.cuisine || '');
  const [priceRange, setPriceRange] = useState(existingDoc?.priceRange || '');
  const [address, setAddress]       = useState(existingDoc?.address || '');
  const [zipcode, setZipcode]       = useState(existingDoc?.zipcode || '');
  const [phone, setPhone]           = useState(existingDoc?.phone || '');

  // ── Hours & Wait ────────────────────────────────────────────
  const [waitMin, setWaitMin]     = useState(existingDoc?.waitMin != null ? String(existingDoc.waitMin) : '');
  const [waitMax, setWaitMax]     = useState(existingDoc?.waitMax != null ? String(existingDoc.waitMax) : '');
  const [hoursOpen, setHoursOpen] = useState(existingDoc?.hoursOpen || '');

  // ── Top Dishes (up to 3) ────────────────────────────────────
  const blankDishes = [
    { name: '', description: '', likePercent: '', image: null },
    { name: '', description: '', likePercent: '', image: null },
    { name: '', description: '', likePercent: '', image: null },
  ];
  const [dishes, setDishes] = useState(
    () => existingDoc?.topDishes?.length
      ? [...existingDoc.topDishes.map(d => ({
          name: d.name || '', description: d.description || '',
          likePercent: d.likePercent != null ? String(d.likePercent) : '',
          image: d.imageUrl ? { uri: resolveImg(d.imageUrl), raw: d.imageUrl } : null,
        })), ...blankDishes].slice(0, Math.max(3, existingDoc.topDishes.length))
      : blankDishes
  );

  // ── Hero / Cover Photo ──────────────────────────────────────
  const [coverImage, setCoverImage] = useState(
    () => existingDoc?.coverImageUrl ? { uri: resolveImg(existingDoc.coverImageUrl), raw: existingDoc.coverImageUrl } : null
  );

  // ── Menu Image ──────────────────────────────────────────────
  const [menuImage, setMenuImage] = useState(
    () => existingDoc?.menuUrl ? { uri: resolveImg(existingDoc.menuUrl), raw: existingDoc.menuUrl } : null
  );

  // ── Special Offer ────────────────────────────────────────────
  const [offer, setOffer] = useState(() => {
    const o = existingDoc?.offer;
    return {
      enabled:       o?.enabled       ?? false,
      bgColor:       o?.bgColor       || 'orange',
      headline:      o?.headline      || '',
      description:   o?.description   || '',
      needCoins:     o?.needCoins     != null ? String(o.needCoins) : '',
      days:          o?.days          || [...DAYS_OF_WEEK],
      timeStart:     o?.timeStart     || '',
      timeEnd:       o?.timeEnd       || '',
      validityLabel: o?.validityLabel || '',
      image:         o?.imageUrl ? { uri: resolveImg(o.imageUrl), raw: o.imageUrl } : null,
    };
  });
  const updateOffer = (field, value) => setOffer(prev => ({ ...prev, [field]: value }));
  const toggleOfferDay = (day) => setOffer(prev => {
    const days = prev.days.includes(day)
      ? prev.days.filter(d => d !== day)
      : [...prev.days, day];
    return { ...prev, days };
  });

  // ── Good to Know tips ───────────────────────────────────────
  const [tips, setTips] = useState(
    existingDoc?.goodToKnow?.length
      ? [...existingDoc.goodToKnow, '', '', ''].slice(0, Math.max(3, existingDoc.goodToKnow.length))
      : ['', '', '']
  );

  // ── Image pickers ───────────────────────────────────────────
  const pickImage = async (aspect, onDone) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: !!aspect,
      aspect,
      quality: 0.85,
      base64: true,
    });
    if (result.assets?.[0]) onDone(result.assets[0]);
  };

  const pickCoverImage  = () => pickImage([16, 9], setCoverImage);
  const pickMenuImage   = () => pickImage(null,   setMenuImage);
  const pickOfferImage  = () => pickImage([16, 9], (asset) => updateOffer('image', asset));
  const pickDishImage   = (idx) => pickImage([4, 3], (asset) =>
    setDishes(prev => { const u = [...prev]; u[idx] = { ...u[idx], image: asset }; return u; })
  );

  const updateDish = (idx, field, value) =>
    setDishes(prev => { const u = [...prev]; u[idx] = { ...u[idx], [field]: value }; return u; });

  const updateTip = (idx, value) =>
    setTips(prev => { const t = [...prev]; t[idx] = value; return t; });

  // ── Upload helper ───────────────────────────────────────────
  const uploadImage = async (base64) => {
    const res  = await fetch(`${BASE_URL}/uploadImage`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: base64,
    });
    const json = await res.json();
    return json.imageUrl;
  };

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!pendingAccount && !userId) { Alert.alert('Not signed in', 'Please log in first.'); return; }
    if (!name || !cuisine || !priceRange || !address) {
      Alert.alert('Missing info', 'Please fill in name, cuisine, price range, and address.');
      return;
    }

    try {
      let effectiveUserId = userId;
      let createdToken = null;

      if (pendingAccount) {
        const userRes = await fetch(`${BASE_URL}/createUser`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: pendingAccount.email,
            password: pendingAccount.password,
            accountType: pendingAccount.accountType,
            businessType: pendingAccount.businessType,
            profilePicture: null, cashCredits: 0, helpingCredits: 0, TrustScore: 0,
          }),
        });
        if (!userRes.ok) {
          const err = await userRes.json().catch(() => null);
          throw new Error(err?.error || 'Failed to create account');
        }
        const userData = await userRes.json();
        effectiveUserId = (userData._id || '').toString();
        if (userData.token) {
          createdToken = userData.token;
          await AsyncStorage.setItem('authToken', createdToken);
        }
        setUserId(effectiveUserId);
        setAccountType(pendingAccount.accountType);
        setBusinessType(pendingAccount.businessType);
      }

      const coverUrl     = coverImage?.base64 ? await uploadImage(coverImage.base64) : (coverImage?.raw || null);
      const menuUrl      = menuImage?.base64  ? await uploadImage(menuImage.base64)  : (menuImage?.raw  || null);
      const offerImgUrl  = offer.image?.base64 ? await uploadImage(offer.image.base64) : (offer.image?.raw || null);

      const uploadedDishes = await Promise.all(
        dishes.map(async (dish) => ({
          name: dish.name,
          description: dish.description,
          likePercent: dish.likePercent ? Number(dish.likePercent) : null,
          imageUrl: dish.image?.base64 ? await uploadImage(dish.image.base64) : (dish.image?.raw || null),
        }))
      );

      const offerCoins = offer.needCoins ? Math.min(100, Math.max(1, Number(offer.needCoins))) : null;
      const payload = {
        userId: effectiveUserId,
        type: 'restaurant',
        name, tagline, cuisine, priceRange, address, zipcode,
        phone: phone.trim() || null,
        waitMin: waitMin ? Number(waitMin) : null,
        waitMax: waitMax ? Number(waitMax) : null,
        hoursOpen,
        coverImageUrl: coverUrl,
        menuUrl,
        topDishes: uploadedDishes.filter(d => d.name),
        goodToKnow: tips.filter(Boolean),
        offer: (offer.headline.trim() || offerImgUrl) ? {
          enabled:       offer.enabled,
          bgColor:       offer.bgColor,
          headline:      offer.headline.trim(),
          description:   offer.description.trim(),
          needCoins:     offerCoins,
          days:          offer.days,
          timeStart:     offer.timeStart.trim(),
          timeEnd:       offer.timeEnd.trim(),
          validityLabel: offer.validityLabel.trim(),
          imageUrl:      offerImgUrl,
        } : null,
      };

      const url    = editMode ? `${BASE_URL}/restaurants/${existingDoc._id}` : `${BASE_URL}/createRestaurant`;
      const method = editMode ? 'PUT' : 'POST';
      const resp   = await authFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error('Server error');

      if (editMode) {
        Alert.alert('✅ Profile updated!', `${name} has been saved.`);
        if (onSubmitSuccess) onSubmitSuccess(effectiveUserId, createdToken);
        else navigation?.goBack();
        return;
      }

      Alert.alert('✅ Restaurant uploaded!', `${name} is now live.`);
      if (onSubmitSuccess) { onSubmitSuccess(effectiveUserId, createdToken); return; }
      setName(''); setTagline(''); setCuisine(''); setPriceRange('');
      setAddress(''); setZipcode(''); setPhone('');
      setWaitMin(''); setWaitMax(''); setHoursOpen('');
      setCoverImage(null); setMenuImage(null);
      setDishes(blankDishes);
      setTips(['', '', '']);
    } catch (err) {
      console.error(err);
      Alert.alert('Upload failed', err.message || 'Something went wrong.');
    }
  };

  const handleBack = onBack || (navigation ? () => navigation.goBack() : null);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {!!handleBack && (
        <TouchableOpacity
          style={[styles.backBtn, { marginTop: insets.top }]}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color="#E8450A" />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.header}>🍽️ {editMode ? 'Edit Restaurant' : 'Add a Restaurant'}</Text>

      {/* ── Cover Photo ── */}
      <SectionCard title="Cover Photo">
        <TouchableOpacity style={styles.coverPicker} onPress={pickCoverImage} activeOpacity={0.85}>
          {coverImage ? (
            <View>
              <Image source={{ uri: coverImage.uri }} style={[styles.coverPreview, styles.profilePicOutline]} />
              <Text style={styles.profilePicLabel}>Profile Picture</Text>
            </View>
          ) : (
            <View style={styles.coverPlaceholder}>
              <Text style={styles.coverPlaceholderIcon}>📷</Text>
              <Text style={styles.coverPlaceholderText}>Tap to add cover photo</Text>
            </View>
          )}
        </TouchableOpacity>
      </SectionCard>

      {/* ── Basic Info ── */}
      <SectionCard title="Basic Info">
        <Field label="Restaurant Name *" value={name} onChangeText={setName} placeholder="e.g. Baja Coastal Grill" />
        <Field label="Tagline / Best For" value={tagline} onChangeText={setTagline} placeholder="e.g. Fish Tacos • Quick Lunch" />
        <Field label="Business Address *" value={address} onChangeText={setAddress} placeholder="123 Ocean Blvd, Long Beach, CA" />
        <Field label="Zipcode" value={zipcode} onChangeText={setZipcode} placeholder="90802" keyboardType="numeric" />
        <Field label="Phone Number" value={phone} onChangeText={setPhone} placeholder="(562) 555-0100" keyboardType="phone-pad" />
        <Field label="Hours" value={hoursOpen} onChangeText={setHoursOpen} placeholder="e.g. Mon–Sun 10am–10pm" />
      </SectionCard>

      {/* ── Menu Image ── */}
      <SectionCard title="Menu">
        <Text style={styles.menuHint}>Upload a photo of your menu so customers can view it in the app.</Text>
        <TouchableOpacity style={styles.menuPicker} onPress={pickMenuImage} activeOpacity={0.85}>
          {menuImage ? (
            <Image source={{ uri: menuImage.uri }} style={styles.menuPreview} resizeMode="contain" />
          ) : (
            <View style={styles.menuPlaceholder}>
              <Ionicons name="document-text-outline" size={36} color="#9CA3AF" />
              <Text style={styles.coverPlaceholderText}>Tap to upload menu photo</Text>
            </View>
          )}
        </TouchableOpacity>
        {menuImage && (
          <TouchableOpacity onPress={() => setMenuImage(null)} style={styles.removeBtn}>
            <Text style={styles.removeBtnTxt}>Remove menu photo</Text>
          </TouchableOpacity>
        )}
      </SectionCard>

      {/* ── Cuisine & Price ── */}
      <SectionCard title="Cuisine & Price">
        <Text style={styles.label}>Cuisine Type *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          {CUISINES.map(c => (
            <TouchableOpacity
              key={c} onPress={() => setCuisine(c)}
              style={[styles.chip, cuisine === c && styles.chipActive]}
            >
              <Text style={[styles.chipText, cuisine === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Price Range *</Text>
        <View style={styles.priceRow}>
          {PRICE_RANGES.map(p => (
            <TouchableOpacity
              key={p} onPress={() => setPriceRange(p)}
              style={[styles.priceChip, priceRange === p && styles.priceChipActive]}
            >
              <Text style={[styles.priceChipText, priceRange === p && styles.priceChipTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SectionCard>

      {/* ── Wait Time ── */}
      <SectionCard title="Wait Time">
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Field label="Min (minutes)" value={waitMin} onChangeText={setWaitMin} placeholder="5" keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Max (minutes)" value={waitMax} onChangeText={setWaitMax} placeholder="20" keyboardType="numeric" />
          </View>
        </View>
      </SectionCard>

      {/* ── Top 3 Dishes ── */}
      <SectionCard title="Top 3 Dishes">
        {dishes.map((dish, idx) => {
          const isProfilePic = !coverImage && idx === dishes.findIndex(d => d.image);
          return (
            <View key={idx} style={styles.dishCard}>
              <Text style={styles.dishNumber}>#{idx + 1}</Text>
              <TouchableOpacity onPress={() => pickDishImage(idx)} style={styles.dishImagePicker} activeOpacity={0.85}>
                {dish.image ? (
                  <View>
                    <Image source={{ uri: dish.image.uri }} style={[styles.dishImagePreview, isProfilePic && styles.profilePicOutline]} />
                    {isProfilePic && <Text style={styles.profilePicLabel}>Profile Picture</Text>}
                  </View>
                ) : (
                  <View style={styles.dishImagePlaceholder}>
                    <Text style={{ fontSize: 22 }}>🍴</Text>
                    <Text style={styles.dishImageText}>Add photo</Text>
                  </View>
                )}
              </TouchableOpacity>
              <Field label="Dish Name" value={dish.name} onChangeText={v => updateDish(idx, 'name', v)} placeholder="e.g. Baja Crispy Fish Tacos" />
              <Field label="Description" value={dish.description} onChangeText={v => updateDish(idx, 'description', v)} placeholder="e.g. Crispy cod, slaw, chipotle crema" />
              <Field label="👍 Like % (0–100)" value={dish.likePercent} onChangeText={v => updateDish(idx, 'likePercent', v)} placeholder="96" keyboardType="numeric" />
            </View>
          );
        })}
      </SectionCard>

      {/* ── Good to Know ── */}
      <SectionCard title="Good to Know (Tips)">
        {tips.map((tip, idx) => (
          <Field
            key={idx}
            label={`Tip ${idx + 1}`}
            value={tip}
            onChangeText={v => updateTip(idx, v)}
            placeholder={[
              'e.g. Best before 1pm for fastest service',
              'e.g. Fish tacos are the most consistent item',
              'e.g. Slower during dinner hours',
            ][idx]}
          />
        ))}
      </SectionCard>

      {/* ── Special Offer ── */}
      <SectionCard title="Special Offer">
        {/* Enable toggle */}
        <View style={styles.offerToggleRow}>
          <Text style={styles.offerToggleLabel}>
            {offer.enabled ? 'Offer Active' : 'Offer Inactive'}
          </Text>
          <Switch
            value={offer.enabled}
            onValueChange={v => updateOffer('enabled', v)}
            trackColor={{ false: '#D1D5DB', true: '#16A34A' }}
            thumbColor="#fff"
          />
        </View>

        {/* Background color */}
        <Text style={styles.label}>Banner Background Color</Text>
        <View style={styles.offerBgRow}>
          {OFFER_BG_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => updateOffer('bgColor', opt.key)}
              style={[styles.offerBgChip, { backgroundColor: opt.color },
                offer.bgColor === opt.key && styles.offerBgChipActive]}
            >
              <Text style={[styles.offerBgChipText,
                opt.key === 'offwhite' && { color: '#374151' }]}>
                {opt.label}
              </Text>
              {offer.bgColor === opt.key && (
                <Ionicons name="checkmark" size={14} color={opt.key === 'offwhite' ? '#374151' : '#fff'}
                  style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Offer image */}
        <Text style={styles.label}>Offer Image (right side of banner)</Text>
        <TouchableOpacity style={styles.menuPicker} onPress={pickOfferImage} activeOpacity={0.85}>
          {offer.image ? (
            <Image source={{ uri: offer.image.uri }} style={styles.menuPreview} resizeMode="cover" />
          ) : (
            <View style={styles.menuPlaceholder}>
              <Ionicons name="image-outline" size={36} color="#9CA3AF" />
              <Text style={styles.coverPlaceholderText}>Tap to add offer image</Text>
            </View>
          )}
        </TouchableOpacity>
        {offer.image && (
          <TouchableOpacity onPress={() => updateOffer('image', null)} style={styles.removeBtn}>
            <Text style={styles.removeBtnTxt}>Remove offer image</Text>
          </TouchableOpacity>
        )}

        {/* Offer text */}
        <View style={{ marginTop: 14 }}>
          <Field label="Headline (large text) e.g. $2 OFF FISH TACOS"
            value={offer.headline} onChangeText={v => updateOffer('headline', v)}
            placeholder="$2 OFF FISH TACOS" />
          <Field label="Description (small text)"
            value={offer.description} onChangeText={v => updateOffer('description', v)}
            placeholder="Get $2 off any Fish Taco order." />
        </View>

        {/* NeedCoins */}
        <Field label="NeedCoins Reward (1–100 max)"
          value={offer.needCoins} onChangeText={v => updateOffer('needCoins', v)}
          placeholder="50" keyboardType="numeric" />

        {/* Days of week */}
        <Text style={styles.label}>Days Available</Text>
        <View style={styles.offerDaysRow}>
          {DAYS_OF_WEEK.map(day => (
            <TouchableOpacity
              key={day}
              onPress={() => toggleOfferDay(day)}
              style={[styles.offerDayChip,
                offer.days.includes(day) && styles.offerDayChipActive]}
            >
              <Text style={[styles.offerDayText,
                offer.days.includes(day) && styles.offerDayTextActive]}>
                {day}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Time frame */}
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Field label="Start Time" value={offer.timeStart}
              onChangeText={v => updateOffer('timeStart', v)} placeholder="11AM" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="End Time" value={offer.timeEnd}
              onChangeText={v => updateOffer('timeEnd', v)} placeholder="2PM" />
          </View>
        </View>

        {/* Validity label */}
        <Field label="Validity Label" value={offer.validityLabel}
          onChangeText={v => updateOffer('validityLabel', v)}
          placeholder="e.g. Today only, Weekdays only" />
      </SectionCard>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.88}>
        <Text style={styles.submitText}>
          {editMode ? 'Save Changes' : onBack ? 'Confirm Account and Upload Restaurant' : 'Upload Restaurant'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Reusable sub-components ──────────────────────────────────────────────────

function SectionCard({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType || 'default'}
        multiline={!!multiline}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#F8FAFD' },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, alignSelf: 'flex-start' },
  backBtnText: { fontSize: 16, fontWeight: '600', color: '#E8450A', marginLeft: 2 },
  header: {
    fontSize: 26, fontWeight: '800', color: '#E8450A',
    textAlign: 'center', marginBottom: 20, marginTop: 10,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.07,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#111',
    marginBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#F1F3F5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111',
  },
  textArea: { height: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },

  // Cover photo
  coverPicker: { borderRadius: 12, overflow: 'hidden' },
  coverPreview: { width: '100%', height: 180, borderRadius: 12 },
  coverPlaceholder: {
    width: '100%', height: 150, backgroundColor: '#F1F3F5',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed',
  },
  coverPlaceholderIcon: { fontSize: 32, marginBottom: 6 },
  coverPlaceholderText: { color: '#9CA3AF', fontSize: 14, fontWeight: '500', marginTop: 8 },

  profilePicOutline: { borderWidth: 3, borderColor: '#2563EB' },
  profilePicLabel: {
    position: 'absolute', bottom: 8, left: 8,
    backgroundColor: '#2563EB', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    color: '#fff', fontSize: 11, fontWeight: '700',
  },

  // Menu image
  menuHint: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  menuPicker: { borderRadius: 12, overflow: 'hidden' },
  menuPreview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#F1F3F5' },
  menuPlaceholder: {
    width: '100%', height: 150, backgroundColor: '#F1F3F5',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed',
  },
  removeBtn: { alignSelf: 'flex-start', marginTop: 8 },
  removeBtnTxt: { fontSize: 13, color: '#DC2626', fontWeight: '600' },

  // Cuisine chips
  chip: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999,
    borderWidth: 1.5, borderColor: '#D1D5DB', marginRight: 8,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#E8450A', borderColor: '#E8450A' },
  chipText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },

  // Price range
  priceRow: { flexDirection: 'row', gap: 10 },
  priceChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center',
    backgroundColor: '#fff',
  },
  priceChipActive: { backgroundColor: '#E8450A', borderColor: '#E8450A' },
  priceChipText: { fontSize: 16, fontWeight: '700', color: '#374151' },
  priceChipTextActive: { color: '#fff' },

  // Dish card
  dishCard: {
    backgroundColor: '#FAFAFA', borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6',
  },
  dishNumber: { fontSize: 13, fontWeight: '800', color: '#E8450A', marginBottom: 10 },
  dishImagePicker: { marginBottom: 12 },
  dishImagePreview: { width: '100%', height: 120, borderRadius: 10 },
  dishImagePlaceholder: {
    width: '100%', height: 90, backgroundColor: '#F1F3F5',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#E5E7EB', borderStyle: 'dashed',
  },
  dishImageText: { color: '#9CA3AF', fontSize: 13, marginTop: 4 },

  // Offer section
  offerToggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 18,
  },
  offerToggleLabel: { fontSize: 15, fontWeight: '600', color: '#111' },
  offerBgRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  offerBgChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: 'transparent',
  },
  offerBgChipActive: { borderColor: '#111' },
  offerBgChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  offerDaysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  offerDayChip: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#fff',
  },
  offerDayChipActive: { backgroundColor: '#E8450A', borderColor: '#E8450A' },
  offerDayText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  offerDayTextActive: { color: '#fff' },

  // Submit
  submitButton: {
    backgroundColor: '#E8450A', paddingVertical: 18,
    borderRadius: 14, alignItems: 'center',
    shadowColor: '#E8450A', shadowOpacity: 0.35,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 17 },
});
