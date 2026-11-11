// Screens/UploadNonprofit.js
import React, { useState, useContext, createElement } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Image, Alert, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AuthStorage from '../server/authStorage';
import { UserContext } from '../server/CurrentUser';
import { authFetch } from '../server/api';

import { NODE_API } from '../config';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';
const resolveImg = (raw) => {
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  if (/^[0-9a-f]{24}$/i.test(raw)) return `${NODE_API}/images/${raw}`;
  return `${NODE_API}/uploads/${raw}`;
};

const ORG_TYPES = ['Church', 'Nonprofit', 'Food Bank', 'Shelter', 'Community Group', 'Government/Public Program', 'Other'];
const COST_OPTIONS = ['Free', 'Reduced Cost', 'Sliding Scale', 'Other'];

const Field = ({ label, value, onChangeText, placeholder, multiline, keyboardType }) => (
  <View style={styles.fieldWrap}>
    {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
    <TextInput
      style={[styles.input, multiline && styles.inputMulti]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      multiline={multiline}
      keyboardType={keyboardType || 'default'}
      autoCapitalize="sentences"
    />
  </View>
);

const Chips = ({ options, selected, onSelect }) => (
  <View style={styles.chips}>
    {options.map(opt => (
      <TouchableOpacity
        key={opt}
        style={[styles.chip, selected === opt && styles.chipActive]}
        onPress={() => onSelect(selected === opt ? '' : opt)}
      >
        <Text style={[styles.chipText, selected === opt && styles.chipTextActive]}>{opt}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const uploadImage = async (base64) => {
  const res = await fetch(`${NODE_API}/uploadImage`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: base64,
  });
  const data = await res.json();
  return data.imageUrl || data.url || null;
};

export default function UploadNonprofit({ route, navigation, onSubmitSuccess, onBack, pendingAccount } = {}) {
  const { userId, setUserId, setAccountType, setBusinessType } = useContext(UserContext);
  const insets = useSafeAreaInsets();

  const editMode = route?.params?.editMode || false;
  const existingDoc = route?.params?.existingDoc || null;

  const [orgName, setOrgName]           = useState(existingDoc?.orgName || '');
  const [orgType, setOrgType]           = useState(existingDoc?.orgType || '');
  const [description, setDescription]   = useState(existingDoc?.description || '');
  const [helpTypes, setHelpTypes]       = useState(
    existingDoc?.helpTypes?.length ? [...existingDoc.helpTypes, '', ''].slice(0, 3) : ['', '', '']
  );
  const [whoYouHelp, setWhoYouHelp]     = useState(existingDoc?.whoYouHelp || '');
  const [cost, setCost]                 = useState(existingDoc?.cost || '');
  const [requirements, setRequirements] = useState(existingDoc?.requirements || '');
  const [availability, setAvailability] = useState(existingDoc?.availability || '');
  const [serviceArea, setServiceArea]   = useState(existingDoc?.serviceArea || '');
  const [phone, setPhone]               = useState(existingDoc?.phone || '');
  const [email, setEmail]               = useState(existingDoc?.email || '');
  const [website, setWebsite]           = useState(existingDoc?.website || '');
  const [address, setAddress]           = useState(existingDoc?.address || '');
  const [languages, setLanguages]       = useState(existingDoc?.languages || '');
  const [logoImage, setLogoImage]       = useState(
    existingDoc?.logoUrl ? { uri: resolveImg(existingDoc.logoUrl), raw: existingDoc.logoUrl } : null
  );

  const updateHelp = (idx, val) => {
    const updated = [...helpTypes];
    updated[idx] = val;
    setHelpTypes(updated);
  };

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required', 'Camera roll access is needed.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, quality: 0.85, base64: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setLogoImage({ uri: asset.uri, base64: asset.base64 });
    }
  };

  const handleSubmit = async () => {
    if (!orgName || !orgType || !serviceArea) {
      Alert.alert('Missing info', 'Please fill in Organization Name, Type, and Service Area.');
      return;
    }
    try {
      let effectiveUserId = userId;
      let createdToken = null;

      if (pendingAccount) {
        const userRes = await fetch(`${NODE_API}/createUser`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: pendingAccount.email,
            password: pendingAccount.password,
            accountType: pendingAccount.accountType,
            businessType: pendingAccount.businessType,
          }),
        });
        if (!userRes.ok) {
          const err = await userRes.json().catch(() => null);
          Alert.alert('Account error', err?.error || 'Could not create account.');
          return;
        }
        const userData = await userRes.json();
        effectiveUserId = userData.userId || userData._id;
        if (userData.token) {
          createdToken = userData.token;
          await AuthStorage.setItem('authToken', createdToken);
          if (userData.refreshToken) await AuthStorage.setItem('refreshToken', userData.refreshToken);
        }
        setUserId(effectiveUserId);
        setAccountType(pendingAccount.accountType);
        setBusinessType(pendingAccount.businessType);
      }

      const logoUrl = logoImage?.base64
        ? await uploadImage(logoImage.base64)
        : (logoImage?.raw || null);

      const payload = {
        orgName, orgType, description,
        helpTypes: helpTypes.filter(Boolean),
        whoYouHelp, cost, requirements, availability, serviceArea,
        phone, email, website, address, languages,
        logoUrl,
        userId: effectiveUserId,
      };

      const url = editMode
        ? `${NODE_API}/nonprofits/${existingDoc._id}`
        : `${NODE_API}/createNonprofit`;
      const method = editMode ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        Alert.alert('Error', err?.error || 'Could not save profile.');
        return;
      }

      if (logoUrl && effectiveUserId) {
        await authFetch(`${NODE_API}/updateNeedCoins`, {
          method: 'POST',
          body: JSON.stringify({ profilePicture: logoUrl }),
        }).catch(() => {});
      }

      if (onSubmitSuccess) { onSubmitSuccess(effectiveUserId, createdToken); return; }
      Alert.alert('✅ Profile saved!', `${orgName} is now live.`);
      navigation?.goBack();
    } catch (e) {
      console.error('UploadNonprofit error:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
      {IS_WEB && <View style={{ height: WEB_HEADER_HEIGHT }} />}
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack || (() => navigation?.goBack())} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#7C3AED" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {editMode ? 'Edit Organization' : 'Add Organization Profile'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={styles.formInner}>

        {/* Logo */}
        <Text style={styles.sectionLabel}>Organization Logo</Text>
        <TouchableOpacity style={styles.logoPicker} onPress={pickLogo}>
          {logoImage ? (
            IS_WEB
              // A fixed-size <Image> with resizeMode="contain" always
              // letterboxes unless the box happens to match the photo's own
              // aspect ratio. A plain <img> left to its natural width:100%,
              // height:auto instead takes on the photo's real shape, same
              // as the live module page's own .logo-wrap - no gaps, ever.
              ? createElement('img', {
                  src: logoImage.uri,
                  style: { width: '100%', height: 'auto', display: 'block', borderRadius: 16, border: '2px solid #7C3AED' },
                })
              : <Image source={{ uri: logoImage.uri }} style={styles.logoPreview} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Ionicons name="image-outline" size={IS_WEB ? 56 : 36} color="#9CA3AF" />
              <Text style={styles.logoPlaceholderText}>Tap to upload logo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Organization Name */}
        <Field
          label="Organization Name *"
          value={orgName}
          onChangeText={setOrgName}
          placeholder="What's your organization called?"
        />

        {/* Organization Type */}
        <Text style={styles.fieldLabel}>Organization Type *</Text>
        <Chips options={ORG_TYPES} selected={orgType} onSelect={setOrgType} />

        {/* Short Description */}
        <Field
          label="Short Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Tell people briefly what your organization does."
          multiline
        />

        {/* Ways You Help */}
        <Text style={styles.fieldLabel}>Ways You Help</Text>
        <Text style={styles.fieldHint}>What are the top 3 ways your organization helps people?</Text>
        {['e.g. Food & meals', 'e.g. Temporary Shelter', 'e.g. Community Health Services'].map((placeholder, i) => (
          <TextInput
            key={i}
            style={styles.input}
            value={helpTypes[i]}
            onChangeText={v => updateHelp(i, v)}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            autoCapitalize="sentences"
          />
        ))}

        {/* Who You Help */}
        <Field
          label="Who You Help"
          value={whoYouHelp}
          onChangeText={setWhoYouHelp}
          placeholder="Who are your services intended for?"
          multiline
        />

        {/* Cost */}
        <Text style={styles.fieldLabel}>Cost</Text>
        <Chips options={COST_OPTIONS} selected={cost} onSelect={setCost} />

        {/* Requirements */}
        <Field
          label="Requirements"
          value={requirements}
          onChangeText={setRequirements}
          placeholder="Are there any requirements to receive help?"
          multiline
        />

        {/* Availability */}
        <Field
          label="Availability"
          value={availability}
          onChangeText={setAvailability}
          placeholder="When is this help available?"
        />

        {/* Service Area */}
        <Field
          label="Service Area *"
          value={serviceArea}
          onChangeText={setServiceArea}
          placeholder="Where do you provide help?"
        />

        {/* Contact Information */}
        <Text style={styles.sectionLabel}>Contact Information</Text>
        <Field value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />
        <Field value={email} onChangeText={setEmail} placeholder="Email address" keyboardType="email-address" />
        <Field value={website} onChangeText={setWebsite} placeholder="Website (optional)" />
        <Field value={address} onChangeText={setAddress} placeholder="Street address" />

        {/* Languages */}
        <Field
          label="Languages"
          value={languages}
          onChangeText={setLanguages}
          placeholder="What languages can you assist people in?"
        />

        {/* Submit */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitText}>
            {editMode ? 'Save Changes' : 'Confirm & Go Live'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { marginRight: 10, padding: 4 },
  headerTitle: { fontSize: IS_WEB ? 26 : 18, fontWeight: '800', color: '#111' },

  // contentContainerStyle centers its children when given alignItems, not
  // alignSelf (alignSelf on the container itself has nothing to align
  // against) - formInner below is the actual width-constrained box.
  body: { paddingHorizontal: IS_WEB ? 32 : 20, paddingTop: 20, ...(IS_WEB ? { alignItems: 'center' } : {}) },
  formInner: IS_WEB ? { width: '75%', maxWidth: 1100, minWidth: 600 } : { width: '100%' },

  sectionLabel: {
    fontSize: IS_WEB ? 17 : 13, fontWeight: '700', color: '#7C3AED',
    letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 20, marginBottom: 8,
  },
  fieldLabel: { fontSize: IS_WEB ? 20 : 14, fontWeight: '700', color: '#374151', marginTop: 18, marginBottom: 6 },
  fieldHint:  { fontSize: IS_WEB ? 16 : 12, color: '#6B7280', marginBottom: 8, marginTop: -4 },

  fieldWrap: { marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12,
    paddingHorizontal: IS_WEB ? 18 : 14, paddingVertical: IS_WEB ? 16 : 12,
    fontSize: IS_WEB ? 19 : 15, color: '#111', backgroundColor: '#FAFAFA',
    marginBottom: 4,
  },
  inputMulti: { minHeight: IS_WEB ? 100 : 80, textAlignVertical: 'top' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: IS_WEB ? 22 : 14, paddingVertical: IS_WEB ? 12 : 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  chipActive:     { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  chipText:       { fontSize: IS_WEB ? 18 : 13, color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  // On web, once a photo is picked it renders as a plain <img> (see the
  // JSX) sized by its own natural aspect ratio, same as the live module
  // page's .logo-wrap - logoPreview below is native-only now. The
  // placeholder (no photo yet) still needs a fixed box since there is no
  // image to derive a shape from.
  logoPicker: IS_WEB ? { width: '100%', marginBottom: 8 } : { alignSelf: 'center', marginBottom: 8 },
  logoPreview: { width: 130, height: 130, borderRadius: 24, borderWidth: 2, borderColor: '#7C3AED' },
  logoPlaceholder: IS_WEB
    ? {
        width: '100%', height: 260, borderRadius: 16,
        borderWidth: 2, borderColor: '#D1D5DB', borderStyle: 'dashed',
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB',
      }
    : {
        width: 130, height: 130, borderRadius: 24,
        borderWidth: 2, borderColor: '#D1D5DB', borderStyle: 'dashed',
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB',
      },
  logoPlaceholderText: { fontSize: IS_WEB ? 16 : 12, color: '#9CA3AF', marginTop: 6, textAlign: 'center' },

  submitBtn: {
    backgroundColor: '#7C3AED', borderRadius: 14,
    paddingVertical: IS_WEB ? 18 : 16, alignItems: 'center', marginTop: 30,
    ...(IS_WEB ? { maxWidth: 280, width: '100%', alignSelf: 'center' } : {}),
  },
  submitText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
