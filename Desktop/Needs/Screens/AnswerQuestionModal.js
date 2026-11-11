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
  const [messages, setMessages] = useState(
    notification?.messages?.length ? notification.messages : [{ from: 'guest', text: notification?.question || notification?.body }]
  );

  const handleSend = async () => {
    const text = answer.trim();
    if (!text) { Alert.alert('Add a reply', 'Please type a response first.'); return; }
    setSending(true);
    try {
      const resp = await authFetch(`${NODE_API}/answerModuleQuestion`, {
        method: 'POST',
        body: JSON.stringify({ notificationId: notification._id, answer: text }),
      });
      if (!resp.ok) throw new Error('Server error');
      setMessages(prev => [...prev, { from: 'org', text }]);
      setAnswer('');
      onSent?.();
    } catch {
      Alert.alert('Error', "Couldn't send your reply. Please try again.");
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
            <Text style={st.headerTitle}>Question</Text>
            <View style={{ width: IS_WEB ? 40 : 30 }} />
          </View>

          <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
            {messages.map((m, i) => (
              <View key={i} style={[st.bubble, m.from === 'org' ? st.bubbleOrg : st.bubbleGuest]}>
                <Text style={m.from === 'org' ? st.bubbleOrgTxt : st.bubbleGuestTxt}>{m.text}</Text>
              </View>
            ))}

            <Text style={st.label}>Your Reply</Text>
            <TextInput
              style={st.answerInput}
              placeholder="Type your reply…"
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
              <Text style={st.sendBtnTxt}>{sending ? 'Sending…' : 'Send Reply'}</Text>
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
  bubble: { maxWidth: '85%', borderRadius: 14, padding: 12, marginBottom: 10 },
  bubbleGuest: { backgroundColor: '#EFF6FF', alignSelf: 'flex-end' },
  bubbleOrg: { backgroundColor: '#F1F5F9', alignSelf: 'flex-start' },
  bubbleGuestTxt: { fontSize: 15, color: '#1E3A8A', lineHeight: 21 },
  bubbleOrgTxt: { fontSize: 15, color: '#334155', lineHeight: 21 },

  label: { fontSize: IS_WEB ? 14 : 12, fontWeight: '800', color: '#334155', marginBottom: 8, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  answerInput: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12,
    fontSize: 15, color: '#0F172A', minHeight: 120, textAlignVertical: 'top',
  },
  helper: { fontSize: 12, color: '#94A3B8', marginTop: 8 },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  sendBtn: { backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sendBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
