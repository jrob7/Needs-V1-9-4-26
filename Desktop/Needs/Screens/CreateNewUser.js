import React, { useState, useContext } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert, TouchableOpacity, Modal, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { UserContext } from '../server/CurrentUser';
import UploadService from './UploadService';
import UploadRestaurant from './UploadRestaurant';
import UploadNonprofit from './UploadNonprofit';

import { NODE_API } from '../config';

function CreateNewUser({ onLoginSuccess, onCancel }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const { setUserId, setAccountType, setBusinessType } = useContext(UserContext);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    try {
      const response = await fetch(`${NODE_API}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const err = await response.json();
        Alert.alert('Error', err?.error || 'Failed to log in');
        return;
      }
      const data = await response.json();
      // server returns: { message, token, userId, email, firstName, lastName, accountType, businessType }
      const id = data.userId || data?.user?._id;
      if (!id) {
        Alert.alert('Error', 'Login succeeded but user id missing.');
        return;
      }
      if (data.token) await AsyncStorage.setItem('authToken', data.token);
      setUserId(id);
      setAccountType(data.accountType || 'individual');
      setBusinessType(data.businessType || null);
      onLoginSuccess?.(id);
    } catch (e) {
      console.error('Error logging in:', e);
      Alert.alert('Error', 'Failed to log in');
    }
  };

  return (
    <View style={styles.screen}>
      {/* ── Decorative wave background ── */}
      <Svg style={styles.waveBack} viewBox="0 0 100 30" preserveAspectRatio="none">
        <Path d="M0,12 C25,28 75,5 100,18 L100,30 L0,30 Z" fill="#DCE9FB" />
      </Svg>
      <Svg style={styles.waveFront} viewBox="0 0 100 22" preserveAspectRatio="none">
        <Path d="M0,16 C30,2 70,26 100,14 L100,22 L0,22 Z" fill="#C7DCF6" />
      </Svg>

      <View style={styles.card}>
        <Image
          source={require('../assets/NeedsLogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue to your account</Text>

        <View style={styles.inputWrap}>
          <Ionicons name="mail-outline" size={18} color="#2563EB" style={styles.inputIcon} />
          <TextInput
            style={styles.signInInput}
            placeholder="Email address"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={18} color="#2563EB" style={styles.inputIcon} />
          <TextInput
            style={[styles.signInInput, { flex: 1 }]}
            placeholder="Password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.forgotWrap}
          onPress={() => Alert.alert('Forgot password', 'Password reset isn’t available yet — contact support.')}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signInButton} onPress={handleLogin}>
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity style={styles.createAccountButton} onPress={() => setIsCreatingAccount(true)}>
          <Ionicons name="person-add-outline" size={18} color="#2563EB" style={{ marginRight: 8 }} />
          <Text style={styles.createAccountButtonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onCancel} style={styles.cancelWrap}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {isCreatingAccount && (
        <Modal animationType="slide" transparent={false} visible={isCreatingAccount} onRequestClose={() => setIsCreatingAccount(false)}>
          <CreateAccountModal
            onClose={() => setIsCreatingAccount(false)}
            onLoginSuccess={onLoginSuccess}
          />
        </Modal>
      )}
    </View>
  );
}

function CreateAccountModal({ onClose, onLoginSuccess }) {
  const { setUserId, setAccountType, setBusinessType } = useContext(UserContext);

  // 'type' -> 'bizType' (business only) -> 'form' -> 'business' (business only)
  const [step, setStep] = useState('type');
  const [accountTypeChoice, setAccountTypeChoice] = useState(null); // 'individual' | 'business'
  const [bizTypeChoice, setBizTypeChoice] = useState(null); // 'service' | 'restaurant' | 'nonprofit'

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [zipcode, setZipcode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profilePicUri, setProfilePicUri]         = useState(null);
  const [profilePicUrl, setProfilePicUrl]         = useState(null);
  const [profilePicUploading, setProfilePicUploading] = useState(false);

  const isBusiness = accountTypeChoice === 'business';

  const pickProfilePic = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setProfilePicUri(asset.uri);
    setProfilePicUploading(true);
    try {
      const b64 = asset.base64 || await (async () => {
        const r = await fetch(asset.uri);
        const blob = await r.blob();
        return new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result.split(',')[1]);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
      })();
      const up = await fetch(`${NODE_API}/uploadImage`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: `data:image/jpeg;base64,${b64}`,
      });
      const upData = await up.json();
      if (upData?.url) setProfilePicUrl(upData.url);
    } catch {
      // Upload failed — still show local preview, URL stays null
    } finally {
      setProfilePicUploading(false);
    }
  };

  // Step 1 for both individual and business: validate credentials, advance
  const handleCredentialsNext = () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Email and password are required');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (isBusiness) {
      setStep('business');
    } else {
      setStep('individualDetails');
    }
  };

  // Step 2 for individual: validate personal details and create the account
  const handleSubmit = async () => {
    if (!firstName || !lastName || !phoneNumber || !streetAddress || !zipcode) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    const newUser = {
      firstName, lastName, email, password,
      phoneNumber, streetAddress, zipcode,
      accountType: 'individual', businessType: null,
      profilePicture: profilePicUrl || null, cashCredits: 0, helpingCredits: 0, TrustScore: 0,
    };
    try {
      const response = await fetch(`${NODE_API}/createUser`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || 'Failed to create user');
      }
      const data = await response.json();
      if (data.token) await AsyncStorage.setItem('authToken', data.token);
      const newId = data._id?.toString?.() || data.userId;
      if (newId) {
        setUserId(newId);
        setAccountType('individual');
        setBusinessType(null);
      }
      Alert.alert('Success', 'Account created successfully!');
      onLoginSuccess?.(newId);
      onClose();
    } catch (e) {
      console.error('Error creating user:', e);
      Alert.alert('Error', e?.message || 'Failed to create account');
    }
  };

  const finishBusinessSignup = async (createdUserId, token) => {
    if (token) await AsyncStorage.setItem('authToken', token);
    Alert.alert('🎉 All set!', 'Your business profile is live.');
    onLoginSuccess?.(createdUserId);
    onClose();
  };

  // Held in memory only — nothing is created until the business form below
  // is actually submitted. Computed unconditionally so the business form
  // (rendered further down) can stay mounted across step changes.
  const pendingAccount = bizTypeChoice
    ? { email, password, accountType: 'business', businessType: bizTypeChoice }
    : null;

  return (
    <>
      {/* Mounted once a business type is chosen, then kept mounted (just
          hidden) while the user is on the email/password step — that's what
          lets business-info fields survive going back and forth instead of
          resetting every time this step is left and re-entered. */}
      {bizTypeChoice && (
        <View style={{ flex: 1, display: step === 'business' ? 'flex' : 'none' }}>
          {bizTypeChoice === 'restaurant' ? (
            <UploadRestaurant onSubmitSuccess={finishBusinessSignup} onBack={() => setStep('form')} pendingAccount={pendingAccount} />
          ) : bizTypeChoice === 'nonprofit' ? (
            <UploadNonprofit onSubmitSuccess={finishBusinessSignup} onBack={() => setStep('form')} pendingAccount={pendingAccount} />
          ) : (
            <UploadService onSubmitSuccess={finishBusinessSignup} onBack={() => setStep('form')} pendingAccount={pendingAccount} />
          )}
        </View>
      )}

      {(step === 'type' || step === 'bizType' || step === 'form' || step === 'individualDetails') && (
        <View style={styles.screen}>
          <Svg style={styles.waveBack} viewBox="0 0 100 30" preserveAspectRatio="none">
            <Path d="M0,12 C25,28 75,5 100,18 L100,30 L0,30 Z" fill="#DCE9FB" />
          </Svg>
          <Svg style={styles.waveFront} viewBox="0 0 100 22" preserveAspectRatio="none">
            <Path d="M0,16 C30,2 70,26 100,14 L100,22 L0,22 Z" fill="#C7DCF6" />
          </Svg>

          <View style={styles.card}>

            {/* ── Type step ── */}
            {step === 'type' && (<>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Are you signing up as...</Text>

              <TouchableOpacity style={styles.choiceBtn} onPress={() => { setAccountTypeChoice('individual'); setStep('form'); }}>
                <Ionicons name="person-outline" size={22} color="#2563EB" style={styles.choiceBtnIcon} />
                <Text style={styles.choiceBtnText}>Individual User</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.choiceBtn} onPress={() => { setAccountTypeChoice('business'); setStep('bizType'); }}>
                <Ionicons name="business-outline" size={22} color="#2563EB" style={styles.choiceBtnIcon} />
                <Text style={styles.choiceBtnText}>Business / Service Provider</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.choiceBtn} onPress={() => { setAccountTypeChoice('business'); setBizTypeChoice('nonprofit'); setStep('form'); }}>
                <Ionicons name="people-outline" size={22} color="#2563EB" style={styles.choiceBtnIcon} />
                <Text style={styles.choiceBtnText}>Nonprofit / Community Resource</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={styles.cancelWrap}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>)}

            {/* ── BizType step ── */}
            {step === 'bizType' && (<>
              <Text style={styles.title}>What kind of business?</Text>
              <Text style={styles.subtitle}>Select the type that best describes you</Text>

              <TouchableOpacity style={styles.choiceBtn} onPress={() => { setBizTypeChoice('service'); setStep('form'); }}>
                <Ionicons name="construct-outline" size={22} color="#2563EB" style={styles.choiceBtnIcon} />
                <Text style={styles.choiceBtnText}>Service Provider</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.choiceBtn} onPress={() => { setBizTypeChoice('restaurant'); setStep('form'); }}>
                <Ionicons name="restaurant-outline" size={22} color="#2563EB" style={styles.choiceBtnIcon} />
                <Text style={styles.choiceBtnText}>Restaurant</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setStep('type')} style={styles.cancelWrap}>
                <Text style={styles.cancelText}>← Back</Text>
              </TouchableOpacity>
            </>)}

            {/* ── Form step: credentials (both individual and business) ── */}
            {step === 'form' && (<>
              <Text style={styles.title}>Your Account Info</Text>
              <Text style={styles.subtitle}>Enter your login credentials to continue</Text>

              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={18} color="#2563EB" style={styles.inputIcon} />
                <TextInput
                  style={styles.signInInput}
                  placeholder="Email"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color="#2563EB" style={styles.inputIcon} />
                <TextInput
                  style={[styles.signInInput, { flex: 1 }]}
                  placeholder="Password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  textContentType="none"
                  autoComplete="off"
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color="#2563EB" style={styles.inputIcon} />
                <TextInput
                  style={[styles.signInInput, { flex: 1 }]}
                  placeholder="Confirm Password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showConfirmPassword}
                  textContentType="none"
                  autoComplete="off"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.signInButton, { marginTop: 6 }]} onPress={handleCredentialsNext}>
                <Text style={styles.signInButtonText}>Next to Continue</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={styles.cancelWrap}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>)}

            {/* ── Individual details step ── */}
            {step === 'individualDetails' && (<>
              <Text style={styles.title}>Your Details</Text>
              <Text style={styles.subtitle}>Fill in your personal information</Text>

              {/* Profile picture picker */}
              <TouchableOpacity style={styles.avatarWrap} onPress={pickProfilePic} activeOpacity={0.8}>
                {profilePicUri ? (
                  <Image source={{ uri: profilePicUri }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person-outline" size={38} color="#93C5FD" />
                  </View>
                )}
                <View style={styles.avatarCameraBadge}>
                  {profilePicUploading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="camera" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>

              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color="#2563EB" style={styles.inputIcon} />
                <TextInput style={styles.signInInput} placeholder="First Name" placeholderTextColor="#9CA3AF" value={firstName} onChangeText={setFirstName} />
              </View>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color="#2563EB" style={styles.inputIcon} />
                <TextInput style={styles.signInInput} placeholder="Last Name" placeholderTextColor="#9CA3AF" value={lastName} onChangeText={setLastName} />
              </View>
              <View style={styles.inputWrap}>
                <Ionicons name="call-outline" size={18} color="#2563EB" style={styles.inputIcon} />
                <TextInput style={styles.signInInput} placeholder="Phone Number" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" value={phoneNumber} onChangeText={setPhoneNumber} />
              </View>
              <View style={styles.inputWrap}>
                <Ionicons name="home-outline" size={18} color="#2563EB" style={styles.inputIcon} />
                <TextInput style={styles.signInInput} placeholder="Street Address" placeholderTextColor="#9CA3AF" value={streetAddress} onChangeText={setStreetAddress} />
              </View>
              <View style={styles.inputWrap}>
                <Ionicons name="location-outline" size={18} color="#2563EB" style={styles.inputIcon} />
                <TextInput style={styles.signInInput} placeholder="Zipcode" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={zipcode} onChangeText={setZipcode} />
              </View>

              <TouchableOpacity style={[styles.signInButton, { marginTop: 6 }]} onPress={handleSubmit}>
                <Text style={styles.signInButtonText}>Create Account</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('form')} style={styles.cancelWrap}>
                <Text style={styles.cancelText}>← Back</Text>
              </TouchableOpacity>
            </>)}

          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // ── Sign In screen ──────────────────────────────────────────
  screen: { flex: 1, backgroundColor: '#F4F8FD', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  waveBack: { position: 'absolute', bottom: 0, left: 0, width: '100%', height: 160 },
  waveFront: { position: 'absolute', bottom: 0, left: 0, width: '100%', height: 120 },

  card: {
    width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 24,
    paddingVertical: 32, paddingHorizontal: 26, alignItems: 'center',
    shadowColor: '#1E3A8A', shadowOpacity: 0.12, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  logo: { width: 130, height: 65, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginTop: 6, marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748B', marginBottom: 26, textAlign: 'center' },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 14, height: 52, marginBottom: 14, backgroundColor: '#F8FAFC',
  },
  inputIcon: { marginRight: 10 },
  signInInput: { flex: 1, fontSize: 15, color: '#0F172A', height: '100%' },

  forgotWrap: { alignSelf: 'flex-end', marginBottom: 18 },
  forgotText: { fontSize: 13, color: '#2563EB', fontWeight: '600' },

  signInButton: {
    width: '100%', height: 52, backgroundColor: '#2563EB',
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#2563EB', shadowOpacity: 0.3, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  signInButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { fontSize: 12, color: '#94A3B8', marginHorizontal: 10 },

  createAccountButton: {
    flexDirection: 'row', width: '100%', height: 52, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#2563EB', justifyContent: 'center', alignItems: 'center',
  },
  createAccountButtonText: { color: '#2563EB', fontSize: 15, fontWeight: '700' },

  cancelWrap: { marginTop: 18 },
  cancelText: { fontSize: 14, color: '#64748B', fontWeight: '600' },

  avatarWrap: { marginBottom: 22, alignSelf: 'center', position: 'relative' },
  avatarImg: { width: 90, height: 90, borderRadius: 45, borderWidth: 2.5, borderColor: '#2563EB' },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#EFF6FF', borderWidth: 2.5, borderColor: '#BFDBFE',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarCameraBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  // ── Create Account modal (multi-step) ───────────────────────
  input: { width: '90%', height: 50, borderWidth: 1, borderColor: '#007bff', borderRadius: 5, paddingHorizontal: 10, marginBottom: 20, fontSize: 16 },
  loginButton: { width: '30%', height: 50, backgroundColor: '#007bff', justifyContent: 'center', alignItems: 'center', borderRadius: 5, marginTop: 10 },
  loginButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  cancelButtonContainer: { marginTop: 10, width: '90%' },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff' },
  modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  stepPrompt: { fontSize: 16, color: '#374151', marginBottom: 24 },
  choiceBtn: {
    width: '90%', paddingVertical: 18, paddingHorizontal: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#2563EB', flexDirection: 'row',
    alignItems: 'center', marginBottom: 14,
  },
  choiceBtnIcon: { marginRight: 12 },
  choiceBtnText: { fontSize: 17, fontWeight: '700', color: '#2563EB', flexShrink: 1 },
});

export default CreateNewUser;