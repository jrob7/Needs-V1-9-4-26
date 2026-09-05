// Screens/UploadService.js
import React, { useState, useContext } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Image, Alert, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserContext } from '../server/CurrentUser';
import { authFetch } from '../server/api';

const SERVICE_CATEGORY_GROUPS = [
  { group: 'Home Services',         items: ['Plumber', 'Electrician', 'HVAC', 'Handyman', 'Cleaner', 'Landscaper', 'Painter', 'Carpentry', 'Moving'] },
  { group: 'Automotive',             items: ['Mechanic', 'Tire Shop', 'Auto Body', 'Towing'] },
  { group: 'Personal Care',          items: ['Barber', 'Hair Salon', 'Nail Salon', 'Massage'] },
  { group: 'Professional Services',  items: ['Attorney', 'CPA', 'Tax Preparer', 'Insurance Agent', 'Real Estate Agent'] },
  { group: 'Family & Education',     items: ['Tutor', 'Daycare', 'Music Lessons', 'Elder Care'] },
  { group: 'Pet Services',           items: ['Groomer', 'Boarding', 'Pet Sitting'] },
  { group: 'Community Support',      items: ['Shelters', 'Rehab', 'Food Assistance', 'Churches', 'Nonprofits'] },
  { group: 'Other',                  items: ['Other'] },
];

const AVAILABILITY = ['', 'Next Day', 'Within a Week', 'Flexible'];

const resolveImg = (raw) => (raw?.startsWith('http') ? raw : `http://localhost:3000/uploads/${raw}`);

export default function UploadService({ route, navigation, onSubmitSuccess, onBack, pendingAccount } = {}) {
  const { userId, setUserId, setAccountType, setBusinessType } = useContext(UserContext);
  const insets = useSafeAreaInsets();

  // Edit mode: pre-fill from an existing listing and PUT instead of POST.
  // Used both by the Account tab (editing your own listing) and signup
  // (route params) or direct props (rendered inline during business signup).
  const editMode = route?.params?.editMode || false;
  const existingDoc = route?.params?.existingDoc || null;

  // ── Basic Info ──────────────────────────────────────────────
  const [businessName, setBusinessName]   = useState(existingDoc?.businessName || '');
  const [providerName, setProviderName]   = useState(existingDoc?.providerName || ''); // "John's Plumbing" vs "John Smith"
  const [category, setCategory]           = useState(existingDoc?.category || '');
  const [tagline, setTagline]             = useState(existingDoc?.tagline || ''); // short pitch
  const [description, setDescription]    = useState(existingDoc?.description || '');
  const [serviceArea, setServiceArea]     = useState(existingDoc?.serviceArea || ''); // city/zip
  const [businessAddress, setBusinessAddress] = useState(existingDoc?.businessAddress || '');
  const [zipcode, setZipcode]             = useState(existingDoc?.zipcode || '');
  const [phone, setPhone]                 = useState(existingDoc?.phone || '');
  const [website, setWebsite]             = useState(existingDoc?.website || '');

  // ── Availability ────────────────────────────────────────────
  const [availability, setAvailability]   = useState(existingDoc?.availability || '');
  const [responseTime, setResponseTime]   = useState(existingDoc?.responseTime || ''); // "Usually responds in < 1 hr"

  // ── Portfolio Images (up to 4) ──────────────────────────────
  const [portfolioImages, setPortfolioImages] = useState(
    () => (existingDoc?.portfolioImageUrls || []).map(raw => ({ uri: resolveImg(raw), raw }))
  );

  // ── License / Certifications ────────────────────────────────
  const [licensed, setLicensed]           = useState(existingDoc?.licensed ?? null); // true | false | null
  const [licenseNumber, setLicenseNumber] = useState(existingDoc?.licenseNumber || '');
  const [insured, setInsured]             = useState(existingDoc?.insured ?? null); // true | false | null
  const [bonded, setBonded]               = useState(existingDoc?.bonded ?? null); // true | false | null
  const [certifications, setCertifications] = useState(existingDoc?.certifications || '');

  // ── Top 3 Services customers come to you for ─────────────────
  const existingServices = existingDoc?.topServices?.length
    ? [...existingDoc.topServices, { name: '' }, { name: '' }, { name: '' }].slice(0, Math.max(3, existingDoc.topServices.length))
    : [{ name: '' }, { name: '' }, { name: '' }];
  const [services, setServices] = useState(existingServices);

  const updateService = (idx, field, value) => {
    setServices(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  // ── Pick portfolio image ─────────────────────────────────────
  const pickPortfolioImage = async () => {
    if (portfolioImages.length >= 4) {
      Alert.alert('Max 4 photos', 'You can upload up to 4 portfolio images.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
      base64: true,
    });
    if (result.assets?.[0]) {
      setPortfolioImages(prev => [...prev, result.assets[0]]);
    }
  };

  const removePortfolioImage = (idx) => {
    setPortfolioImages(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!pendingAccount && !userId) { Alert.alert('Not signed in', 'Please log in first.'); return; }
    if (!businessName || !category || !serviceArea) {
      Alert.alert('Missing info', 'Please fill in business name, category, and service area.');
      return;
    }

    try {
      let effectiveUserId = userId;
      let createdToken = null;

      // Business accounts are only created right now, at the final submit —
      // not when the earlier account-info step was filled in. Create the
      // account and the listing together, back-to-back.
      if (pendingAccount) {
        const userRes = await fetch('http://localhost:3000/createUser', {
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

      // Upload portfolio images — keep unchanged existing ones (img.raw) as-is,
      // only upload newly-picked local images (img.base64).
      const portfolioUrls = await Promise.all(
        portfolioImages.map(async (img) => {
          if (img.raw) return img.raw;
          if (!img.base64) return null;
          const res = await fetch('http://localhost:3000/uploadImage', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: img.base64,
          });
          const json = await res.json();
          return json.imageUrl;
        })
      );

      const payload = {
        userId: effectiveUserId,
        type: 'service',
        businessName,
        providerName,
        category,
        tagline,
        description,
        serviceArea,
        businessAddress,
        zipcode,
        phone,
        website,
        availability,
        responseTime,
        licensed,
        licenseNumber,
        insured,
        bonded,
        certifications,
        topServices: services.filter(s => s.name),
        portfolioImageUrls: portfolioUrls.filter(Boolean),
      };

      const url    = editMode ? `http://localhost:3000/services/${existingDoc._id}` : 'http://localhost:3000/createService';
      const method = editMode ? 'PUT' : 'POST';
      const resp = await authFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error('Server error');
      // Server backfills the account's profile picture from the first
      // portfolio photo if one isn't already set — see setProfilePictureIfMissing.

      if (editMode) {
        Alert.alert('✅ Profile updated!', `${businessName} has been saved.`);
        if (onSubmitSuccess) onSubmitSuccess(effectiveUserId, createdToken);
        else navigation?.goBack();
        return;
      }

      Alert.alert('✅ Service uploaded!', `${businessName} is now live.`);
      if (onSubmitSuccess) { onSubmitSuccess(effectiveUserId, createdToken); return; }
      // Reset (create flow only)
      setBusinessName(''); setProviderName(''); setCategory(''); setTagline('');
      setDescription(''); setServiceArea(''); setBusinessAddress(''); setZipcode('');
      setPhone(''); setWebsite('');
      setAvailability('');
      setResponseTime(''); setPortfolioImages([]); setLicensed(null);
      setLicenseNumber(''); setInsured(null); setBonded(null); setCertifications('');
      setServices([{ name: '' }, { name: '' }, { name: '' }]);
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
          <Ionicons name="chevron-back" size={22} color="#0A8A4A" />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.header}>🔧 {editMode ? 'Edit Service' : 'Add a Service'}</Text>

      {/* ── Basic Info ── */}
      <SectionCard title="Business Info">
        <Field label="Business Name *" value={businessName} onChangeText={setBusinessName} placeholder="e.g. A1 Plumbing Co." />
        <Field label="Your Name" value={providerName} onChangeText={setProviderName} placeholder="e.g. John Smith" />
        <Field label="Tagline" value={tagline} onChangeText={setTagline} placeholder="e.g. Fast, reliable, and affordable" />
        <Field label="Service Area *" value={serviceArea} onChangeText={setServiceArea} placeholder="e.g. Long Beach, CA • 90802" />
        <Field label="Business Address" value={businessAddress} onChangeText={setBusinessAddress} placeholder="e.g. 123 Main St" />
        <Field label="Zipcode" value={zipcode} onChangeText={setZipcode} placeholder="90802" keyboardType="numeric" />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="(562) 555-0100" keyboardType="phone-pad" />
        <Field label="Website (optional)" value={website} onChangeText={setWebsite} placeholder="https://yourbusiness.com" />
      </SectionCard>

      {/* ── Category ── */}
      <SectionCard title="Category *">
        {SERVICE_CATEGORY_GROUPS.map(({ group, items }) => (
          <View key={group} style={styles.categoryGroup}>
            <Text style={styles.categoryGroupLabel}>{group}</Text>
            <View style={styles.chipWrap}>
              {items.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.chip, category === c && styles.chipActive]}
                >
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </SectionCard>

      {/* ── Description ── */}
      <SectionCard title="Description">
        <Field
          label="Tell customers about your service"
          value={description}
          onChangeText={setDescription}
          placeholder="Experience, specialties, tools used, service guarantee…"
          multiline
        />
      </SectionCard>

      {/* ── Top 3 Services customers come to you for ── */}
      <SectionCard title="Top 3 Most Requested Services">
        {services.map((svc, idx) => (
          <Field
            key={idx}
            label={idx === 0 ? 'Service name' : undefined}
            value={svc.name}
            onChangeText={v => updateService(idx, 'name', v)}
            placeholder={['e.g. Brake repair', 'Annual Physical', 'Tax preparation'][idx]}
          />
        ))}
      </SectionCard>

      {/* ── Availability ── */}
      <SectionCard title="Availability">
        <Text style={styles.label}>Earliest available</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          {AVAILABILITY.map(a => (
            <TouchableOpacity
              key={a}
              onPress={() => setAvailability(a)}
              style={[styles.chip, availability === a && styles.chipActive]}
            >
              <Text style={[styles.chipText, availability === a && styles.chipTextActive]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Field label="Response Time" value={responseTime} onChangeText={setResponseTime} placeholder="e.g. Usually responds in < 1 hr" />
      </SectionCard>

      {/* ── Licensed / Insured / Bonded? ── */}
      <SectionCard title="Licensing, Insurance, Bonded">
        <Text style={styles.label}>Are you licensed?</Text>
        <View style={styles.toggleRow}>
          {[{ val: true, label: '✅ Yes' }, { val: false, label: '❌ No' }].map(opt => (
            <TouchableOpacity
              key={String(opt.val)}
              style={[styles.toggleBtn, licensed === opt.val && styles.toggleBtnActive]}
              onPress={() => setLicensed(opt.val)}
            >
              <Text style={[styles.toggleBtnText, licensed === opt.val && styles.toggleBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {licensed && (
          <Field label="License Number" value={licenseNumber} onChangeText={setLicenseNumber} placeholder="e.g. CA-PLM-123456" />
        )}

        <Text style={styles.label}>Are you insured?</Text>
        <View style={styles.toggleRow}>
          {[{ val: true, label: '✅ Yes' }, { val: false, label: '❌ No' }].map(opt => (
            <TouchableOpacity
              key={String(opt.val)}
              style={[styles.toggleBtn, insured === opt.val && styles.toggleBtnActive]}
              onPress={() => setInsured(opt.val)}
            >
              <Text style={[styles.toggleBtnText, insured === opt.val && styles.toggleBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Are you bonded?</Text>
        <View style={styles.toggleRow}>
          {[{ val: true, label: '✅ Yes' }, { val: false, label: '❌ No' }].map(opt => (
            <TouchableOpacity
              key={String(opt.val)}
              style={[styles.toggleBtn, bonded === opt.val && styles.toggleBtnActive]}
              onPress={() => setBonded(opt.val)}
            >
              <Text style={[styles.toggleBtnText, bonded === opt.val && styles.toggleBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Certifications (optional)" value={certifications} onChangeText={setCertifications} placeholder="e.g. EPA certified, OSHA trained" />
      </SectionCard>

      {/* ── Portfolio Photos ── */}
      <SectionCard title={`Portfolio Photos (${portfolioImages.length}/4)`}>
        <View style={styles.portfolioGrid}>
          {portfolioImages.map((img, idx) => (
            <View key={idx} style={styles.portfolioThumbWrap}>
              <Image
                source={{ uri: img.uri }}
                style={[styles.portfolioThumb, idx === 0 && styles.portfolioThumbProfile]}
              />
              <TouchableOpacity style={styles.removeBtn} onPress={() => removePortfolioImage(idx)}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
              {idx === 0 && <Text style={styles.profilePicLabel}>Profile Picture</Text>}
            </View>
          ))}
          {portfolioImages.length < 4 && (
            <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPortfolioImage}>
              <Text style={styles.addPhotoBtnIcon}>+</Text>
              <Text style={styles.addPhotoBtnText}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </SectionCard>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.88}>
        <Text style={styles.submitText}>
          {editMode ? 'Save Changes' : onBack ? 'Confirm Account and Upload Service' : 'Upload Service'}
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
  backBtnText: { fontSize: 16, fontWeight: '600', color: '#0A8A4A', marginLeft: 2 },
  header: {
    fontSize: 26, fontWeight: '800', color: '#0A8A4A',
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
  textArea: { height: 110, textAlignVertical: 'top' },

  categoryGroup:      { marginBottom: 16 },
  categoryGroupLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 },
  chipWrap:           { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999,
    borderWidth: 1.5, borderColor: '#D1D5DB', marginRight: 8,
    backgroundColor: '#fff', marginBottom: 8,
  },
  chipActive: { backgroundColor: '#0A8A4A', borderColor: '#0A8A4A' },
  chipText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },

  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  toggleBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center',
    backgroundColor: '#fff',
  },
  toggleBtnActive: { backgroundColor: '#0A8A4A', borderColor: '#0A8A4A' },
  toggleBtnText: { fontWeight: '700', color: '#374151', fontSize: 14 },
  toggleBtnTextActive: { color: '#fff' },


  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  portfolioThumbWrap: { position: 'relative', width: 90, height: 90 },
  portfolioThumb: { width: 90, height: 90, borderRadius: 10 },
  portfolioThumbProfile: { borderWidth: 3, borderColor: '#2563EB' },
  profilePicLabel: {
    position: 'absolute', bottom: 2, left: 2, right: 2,
    backgroundColor: '#2563EB', borderRadius: 4,
    paddingVertical: 2, textAlign: 'center',
    color: '#fff', fontSize: 8, fontWeight: '700',
  },
  removeBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#EF4444', width: 22, height: 22,
    borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  addPhotoBtn: {
    width: 90, height: 90, borderRadius: 10,
    borderWidth: 2, borderColor: '#D1D5DB', borderStyle: 'dashed',
    backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center',
  },
  addPhotoBtnIcon: { fontSize: 24, color: '#9CA3AF', lineHeight: 28 },
  addPhotoBtnText: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },

  submitButton: {
    backgroundColor: '#0A8A4A', paddingVertical: 18,
    borderRadius: 14, alignItems: 'center',
    shadowColor: '#0A8A4A', shadowOpacity: 0.35,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 17 },
});