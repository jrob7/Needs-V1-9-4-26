// Screens/AnswerQuestionModal.js
// Business-facing modal for answering a module_question notification —
// a question asked through the public module page's chat widget that the
// AI could not answer from the business's own profile info. The answer
// gets emailed back to the original asker.
import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NODE_API } from '../config';
import { IS_WEB } from '../webLayout';
import { authFetch } from '../server/api';

export default function AnswerQuestionModal({ notification, onClose, onSent }) {
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!answer.trim()) { Alert.alert('Add an answer', 'Please type a response first.'); return; }
    setSending(true);
    try {
      const resp = await authFetch(`${NODE_API}/answerModuleQuestion`, {
        method: 'POST',
        body: JSON.stringify({ notificationId: notification._id, answer: answer.trim() }),
      });
      if (!resp.ok) throw new Error('Server error');
      Alert.alert('✅ Sent', 'Your answer has been emailed to the customer.');
      onSent?.();
    } catch {
      Alert.alert('Error', "Couldn't send your answer. Please try again.");
    } finally { setSending(false); }
  };

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={!IS_WEB}>
        <View style={IS_WEB ? { maxWidth: 560, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' } : { flex: 1, backgroundColor: '#fff' }}>

          <View style={st.header}>
            <TouchableOpacity onPress={onClose} style={st.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={IS_WEB ? 28 : 22} color="#0F172A" />
            </TouchableOpacity>
            <Text style={st.headerTitle}>Answer Question</Text>
            <View style={{ width: IS_WEB ? 40 : 30 }} />
          </View>

          <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
            <View style={st.questionBox}>
              <Text style={st.questionLabel}>Question</Text>
              <Text style={st.questionTxt}>{notification?.question || notification?.body}</Text>
            </View>

            <Text style={st.label}>Your Answer</Text>
            <TextInput
              style={st.answerInput}
              placeholder="Type your answer…"
              placeholderTextColor="#94A3B8"
              value={answer}
              onChangeText={setAnswer}
              multiline
              autoFocus
            />
            <Text style={st.helper}>This will be emailed directly to the customer who asked.</Text>
          </ScrollView>

          <View style={st.footer}>
            <TouchableOpacity style={[st.sendBtn, sending && { opacity: 0.6 }]} onPress={handleSend} disabled={sending}>
              <Text style={st.sendBtnTxt}>{sending ? 'Sending…' : 'Send Answer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: IS_WEB ? '#F0F2F5' : '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: IS_WEB ? 14 : 54, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: IS_WEB ? 20 : 16, fontWeight: '800', color: '#0F172A' },

  body: { padding: 16, paddingBottom: 32 },
  questionBox: { backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 12, padding: 14, marginBottom: 20 },
  questionLabel: { fontSize: 11, fontWeight: '800', color: '#7C3AED', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 },
  questionTxt: { fontSize: 15, color: '#1E1B4B', lineHeight: 21 },

  label: { fontSize: IS_WEB ? 14 : 12, fontWeight: '800', color: '#334155', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  answerInput: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12,
    fontSize: 15, color: '#0F172A', minHeight: 120, textAlignVertical: 'top',
  },
  helper: { fontSize: 12, color: '#94A3B8', marginTop: 8 },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  sendBtn: { backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sendBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
