// Screens/SearchChatbot.js
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Button, TouchableOpacity } from 'react-native';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';

const FLASK_URL = 'http://localhost:5001/search';      // your Flask app.py
const NODE_API_BASE = 'http://localhost:3000';         // your Node API base

export default function SearchChatbot() {
  const navigation = useNavigation();

  // chat state
  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState([]);

  // need-search state (unchanged behavior)
  const [searchParams, setSearchParams] = useState({ searchText: '', urgency: '', bidprice: '' });

  // fundraiser flow state
  const [mode, setMode] = useState(null); // null | 'fundraiser'
  const [fundraiserStep, setFundraiserStep] = useState(0); // 0: ask desc+amount, 1: ask media, 2: done
  const [fundraiser, setFundraiser] = useState({
    description: '',
    targetAmount: null, // number
    mediaLinks: [],     // array of strings (URLs or notes)
  });

  // Helper: push AI message to chat
  const pushAI = (text) =>
    setConversation((prev) => [...prev, { ai: text }]);

  // Helper: push user message to chat
  const pushUser = (text) =>
    setConversation((prev) => [...prev, { user: text }]);

  // Simple amount parser: pulls first $### or number
  const parseAmount = (s) => {
    if (!s) return null;
    const m = s.match(/\$?\s*([0-9][0-9,\.]*)/);
    if (!m) return null;
    const num = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(num) ? Math.round(num) : null;
    // (round to int for simplicity; adjust if you want decimals)
  };

  // Try to extract URLs from text (very simple heuristic)
  const parseUrls = (s) => {
    if (!s) return [];
    const urlRegex = /(https?:\/\/[^\s)]+)|(file:\/\/[^\s)]+)/gi;
    const found = s.match(urlRegex);
    return found ? found : [];
  };

  const handleFundraiserFlow = async (userText) => {
    // Step-based Q&A
    if (fundraiserStep === 0) {
      // Expect a description; also attempt to parse amount if present
      const amount = parseAmount(userText);
      setFundraiser((f) => ({
        ...f,
        description: userText.trim(),
        targetAmount: amount ?? f.targetAmount,
      }));

      if (amount == null) {
        pushAI(
          "Thanks! I didn't catch a dollar amount. About how much are you trying to raise? (e.g., $2500)"
        );
        setFundraiserStep(0.5); // mini step for amount only
        return;
      }

      // we got some amount in the same message — go to media step
      pushAI(
        "Great! Do you have any media or links you'd like to include? (paste URLs or say 'skip')"
      );
      setFundraiserStep(1);
      return;
    }

    if (fundraiserStep === 0.5) {
      // Expect just an amount
      const amount = parseAmount(userText);
      if (amount == null) {
        pushAI("I still didn't catch a number. Please reply with an amount like '$1,000'.");
        return;
      }
      setFundraiser((f) => ({ ...f, targetAmount: amount }));
      pushAI("Perfect—now please paste any media links (images/videos) you'd like to include, or say 'skip'.");
      setFundraiserStep(1);
      return;
    }

    if (fundraiserStep === 1) {
      // Expect media links or skip
      const links = /skip/i.test(userText) ? [] : parseUrls(userText);
      setFundraiser((f) => ({ ...f, mediaLinks: links }));

      // Show summary
      setFundraiserStep(2);
      pushAI("Thanks! Here's a quick summary of your fundraiser:");
      pushAI(
        `• Description: ${fundraiser.description || '(none yet)'}\n` +
        `• Target Amount: $${fundraiser.targetAmount ?? '(not set)'}\n` +
        `• Media: ${links.length ? links.join(', ') : '(none)'}`
      );

      // OPTIONAL: Save fundraiser to your Node API (uncomment & implement on server)
      /*
      try {
        const resp = await axios.post(`${NODE_API_BASE}/createFundraiser`, {
          description: fundraiser.description,
          targetAmount: fundraiser.targetAmount,
          mediaLinks: links,
        });
        pushAI("✅ Fundraiser saved! You can view or edit it in your profile.");
      } catch (e) {
        pushAI("⚠️ I couldn't save this to the server just yet, but your details are captured here.");
      }
      */

      pushAI("If you'd like to change anything, just tell me. Otherwise, you're all set! 🎉");
      // Keep mode 'fundraiser' so user can continue to refine. Set to null to end the flow.
      return;
    }
  };

  const sendQuery = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Always echo user message in chat
    pushUser(trimmed);
    setInput('');

    // If we're in the middle of the fundraiser flow, handle locally (no AI call)
    if (mode === 'fundraiser') {
      await handleFundraiserFlow(trimmed);
      return;
    }

    try {
      // Ask Flask to classify + (for need) extract params
      const aiResponse = await axios.post(FLASK_URL, { query: trimmed });
      const data = aiResponse.data || {};

      // Branch on type set by app.py
      if (data.type === 'fundraiser') {
        // Kick off fundraiser Q&A
        setMode('fundraiser');
        setFundraiserStep(0);
        setFundraiser({ description: '', targetAmount: null, mediaLinks: [] });

        pushAI("It looks like you want to start a fundraiser! 🎉");
        pushAI("1️⃣ Tell me what you’re raising funds for and (optionally) how much you want to raise.");
        pushAI("2️⃣ Then I’ll ask for any media or links to include.");
        return;
      }

      if (data.type === 'need') {
        // Keep your original behavior for need extraction
        const summary = data.summary;
        const params = data.searchParams || {};

        // add AI response to chat
        setConversation((prev) => [...prev, { ai: summary }]);

        // validate & navigate the same way you already do
        if (!params.searchText || !params.urgency || !params.bidprice) {
          pushAI('Can you provide more details?');
          return;
        }

        setSearchParams(params);

        // (Optionally) also store the structured need on your Node API:
        // await axios.post(`${NODE_API_BASE}/createNeedRequest`, params).catch(() => {});

        // go to results
        navigation.navigate('SearchResults', params);
        return;
      }

      // Fallback (unexpected shape)
      pushAI("Hmm, I couldn't classify that. Try rephrasing what you need or if you're starting a fundraiser, say 'I want to start a fundraiser'.");
    } catch (error) {
      console.error('🚨 Error in sendQuery:', error);
      pushAI('Something went wrong. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 80 }}>
        {conversation.map((msg, idx) => (
          <View key={idx} style={{ marginBottom: 10 }}>
            {msg.user ? <Text style={styles.user}>You: {msg.user}</Text> : null}
            {msg.ai ? <Text style={styles.ai}>AI: {msg.ai}</Text> : null}
          </View>
        ))}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={
            mode === 'fundraiser'
              ? (fundraiserStep === 0
                  ? 'Describe your fundraiser (include $ if you can)...'
                  : fundraiserStep === 0.5
                    ? 'Type your target amount (e.g., $1,000)...'
                    : fundraiserStep === 1
                      ? 'Paste media links or type "skip"...'
                      : 'Add more details or say "done"...')
              : 'Describe what you need...'
          }
          style={styles.input}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendQuery}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f7' },
  scroll: { flex: 1, padding: 16 },
  user: { fontSize: 15, color: '#111' },
  ai: { fontSize: 15, color: '#0a4', marginTop: 4 },
  composer: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  sendBtn: {
    marginLeft: 8,
    backgroundColor: '#007bff',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700' },
});