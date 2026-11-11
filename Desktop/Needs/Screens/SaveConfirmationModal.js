// Screens/SaveConfirmationModal.js
// Alert.alert on web only produces a plain, unstyled browser alert() - and
// in practice was not reliably showing at all in this app's web dev setup
// (confirmed live: a real save error produced no visible popup whatsoever,
// only a console log). A real Modal component always renders, consistent
// with how the rest of the app already avoids Alert for anything on web
// that needs to reliably appear (see CreateNewUser's own error banner).
// Shared by UploadService.js, UploadRestaurant.js, UploadNonprofit.js.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IS_WEB } from '../webLayout';

export default function SaveConfirmationModal({ visible, title = 'Saved!', message, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={st.card}>
          <Ionicons name="checkmark-circle" size={IS_WEB ? 56 : 46} color="#10B981" style={{ marginBottom: 12 }} />
          <Text style={st.title}>{title}</Text>
          {!!message && <Text style={st.message}>{message}</Text>}
          <TouchableOpacity style={st.btn} onPress={onClose} activeOpacity={0.85}>
            <Text style={st.btnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: IS_WEB ? 32 : 24,
    alignItems: 'center', width: '100%', maxWidth: 380,
  },
  title: { fontSize: IS_WEB ? 22 : 18, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: IS_WEB ? 16 : 14, color: '#475569', textAlign: 'center', marginBottom: 20, lineHeight: IS_WEB ? 22 : 20 },
  btn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
