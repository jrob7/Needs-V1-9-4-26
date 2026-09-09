// Screens/InfoRequestBubble.js
// Renders a "more details needed" interactive card inside a chat thread.
// The business sends this (type: 'infoRequest'); the requester answers the
// AI-generated multiple-choice questions, optionally attaches a photo/video,
// and submits — which sends a normal readable reply back to the business
// and marks this card as answered so it doesn't show the form again.
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import NeedsVideoPlayer from '../utils/NeedsVideoPlayer';

import { NODE_API } from '../config';
import { IS_WEB } from '../webLayout';
import { authFetch } from '../server/api';

const resolveImg = (uri) => {
  if (!uri) return null;
  return uri.startsWith('http') ? uri : `${NODE_API}/uploads/${uri}`;
};

export default function InfoRequestBubble({ message, isMine, recipientId, onAnswered }) {
  const data = message.data || {};
  const questions = data.questions || [];
  const answered = !!data.answered;
  const savedAnswers = data.answers || [];

  const [answers, setAnswers] = useState({});
  const [photo, setPhoto] = useState(null);
  const [video, setVideo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required', 'Camera roll access needed.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true,
    });
    if (!result.canceled && result.assets?.[0]) setPhoto(result.assets[0]);
  };

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required', 'Camera roll access needed.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) setVideo(result.assets[0]);
  };

  const allAnswered = questions.length > 0 && questions.every((_, i) => !!answers[i]);

  const handleSubmit = async () => {
    if (!allAnswered) { Alert.alert('Missing answers', 'Please answer all questions before submitting.'); return; }
    setSubmitting(true);
    try {
      let photoUrl = null;
      if (photo?.base64) {
        const r = await fetch(`${NODE_API}/uploadImage`, {
          method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: photo.base64,
        });
        const j = await r.json();
        photoUrl = j.imageUrl;
      }

      let videoId = null;
      if (video?.uri) {
        const form = new FormData();
        form.append('video', { uri: video.uri, name: video.fileName || 'video.mp4', type: 'video/mp4' });
        const r = await fetch(`${NODE_API}/uploadVideo`, { method: 'POST', body: form });
        const j = await r.json();
        videoId = j.videoId;
      }

      const answersList = questions.map((q, i) => ({ question: q.question, answer: answers[i] }));
      const text = `📋 More details\n\n` + answersList.map(a => `${a.question} → ${a.answer}`).join('\n');

      await authFetch(`${NODE_API}/sendMessage`, {
        method: 'POST',
        body: JSON.stringify({
          recipientId,
          text,
          type: 'infoAnswer',
          data: { answers: answersList, photoUrl, videoId },
          regardingTitle: data.title || null,
        }),
      });

      await authFetch(`${NODE_API}/messages/${message._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: { ...data, answered: true, answers: answersList } }),
      });

      onAnswered?.({ ...message, data: { ...data, answered: true, answers: answersList } });
    } catch (e) {
      Alert.alert('Error', "Couldn't submit your answers. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // The business sees a simple read-only confirmation of what they asked.
  if (isMine) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="help-circle" size={IS_WEB ? 21 : 16} color="#2563EB" />
          <Text style={styles.headerText}>You asked for more details</Text>
        </View>
        {questions.map((q, i) => (
          <Text key={i} style={styles.readonlyQuestion}>• {q.question}</Text>
        ))}
      </View>
    );
  }

  // Already answered — read-only summary.
  if (answered) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="checkmark-circle" size={IS_WEB ? 21 : 16} color="#10B981" />
          <Text style={[styles.headerText, { color: '#10B981' }]}>Submitted</Text>
        </View>
        {savedAnswers.map((a, i) => (
          <View key={i} style={styles.answeredRow}>
            <Text style={styles.answeredQuestion}>{a.question}</Text>
            <Text style={styles.answeredValue}>{a.answer}</Text>
          </View>
        ))}
      </View>
    );
  }

  // Interactive form for the requester.
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="help-circle" size={IS_WEB ? 21 : 16} color="#2563EB" />
        <Text style={styles.headerText}>{data.title || 'Needs a few more details.'}</Text>
      </View>

      {questions.map((q, qi) => (
        <View key={qi} style={styles.questionBlock}>
          <Text style={styles.questionText}>{q.question}</Text>
          {(q.options || []).map((opt) => (
            <TouchableOpacity
              key={opt}
              style={styles.radioRow}
              onPress={() => setAnswers(prev => ({ ...prev, [qi]: opt }))}
            >
              <View style={[styles.radioCircle, answers[qi] === opt && styles.radioCircleActive]}>
                {answers[qi] === opt && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.radioLabel}>{opt}</Text>
            </TouchableOpacity>
          ))}
          {qi < questions.length - 1 && <View style={styles.divider} />}
        </View>
      ))}

      <View style={styles.divider} />

      <Text style={styles.questionText}>Photo</Text>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={styles.mediaPreview} />
      ) : (
        <TouchableOpacity style={styles.uploadBtn} onPress={pickPhoto}>
          <Ionicons name="camera-outline" size={IS_WEB ? 21 : 16} color="#2563EB" />
          <Text style={styles.uploadBtnText}>Upload</Text>
        </TouchableOpacity>
      )}

      <View style={styles.divider} />

      <Text style={styles.questionText}>Video (Optional)</Text>
      {video ? (
        <NeedsVideoPlayer uri={video.uri} style={styles.mediaPreview} contentFit="cover" />
      ) : (
        <TouchableOpacity style={styles.uploadBtn} onPress={pickVideo}>
          <Ionicons name="videocam-outline" size={IS_WEB ? 21 : 16} color="#2563EB" />
          <Text style={styles.uploadBtnText}>Upload</Text>
        </TouchableOpacity>
      )}

      <View style={styles.divider} />

      <TouchableOpacity
        style={[styles.submitBtn, (!allAnswered || submitting) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!allAnswered || submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.submitBtnText}>Submit</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: IS_WEB ? 21 : 16, padding: IS_WEB ? 18 : 14,
    borderWidth: 1, borderColor: '#E2E8F0', maxWidth: '90%', marginBottom: IS_WEB ? 5 : 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 8 : 6, marginBottom: IS_WEB ? 13 : 10 },
  headerText: { fontSize: IS_WEB ? 18 : 14, fontWeight: '800', color: '#0F172A' },

  readonlyQuestion: { fontSize: IS_WEB ? 17 : 13, color: '#475569', marginBottom: IS_WEB ? 5 : 4 },

  questionBlock: { marginBottom: IS_WEB ? 5 : 4 },
  questionText: { fontSize: IS_WEB ? 18 : 14, fontWeight: '700', color: '#1E293B', marginBottom: IS_WEB ? 10 : 8 },

  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: IS_WEB ? 8 : 6, gap: IS_WEB ? 13 : 10 },
  radioCircle: {
    width: IS_WEB ? 23 : 18, height: IS_WEB ? 23 : 18, borderRadius: IS_WEB ? 12 : 9, borderWidth: 2, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleActive: { borderColor: '#2563EB' },
  radioDot: { width: IS_WEB ? 12 : 9, height: IS_WEB ? 12 : 9, borderRadius: IS_WEB ? 6 : 5, backgroundColor: '#2563EB' },
  radioLabel: { fontSize: IS_WEB ? 17 : 13, color: '#1E293B' },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: IS_WEB ? 16 : 12 },

  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: IS_WEB ? 8 : 6,
    height: IS_WEB ? 49 : 38, borderRadius: IS_WEB ? 13 : 10, backgroundColor: '#EFF6FF',
    borderWidth: 1, borderColor: '#BFDBFE', alignSelf: 'flex-start', paddingHorizontal: IS_WEB ? 21 : 16,
  },
  uploadBtnText: { fontSize: IS_WEB ? 17 : 13, fontWeight: '700', color: '#2563EB' },
  mediaPreview: { width: IS_WEB ? 182 : 140, height: IS_WEB ? 130 : 100, borderRadius: IS_WEB ? 13 : 10, backgroundColor: '#000' },

  submitBtn: {
    height: IS_WEB ? 57 : 44, borderRadius: IS_WEB ? 13 : 10, backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#93C5FD' },
  submitBtnText: { fontSize: IS_WEB ? 18 : 14, fontWeight: '800', color: '#fff' },

  answeredRow: { marginBottom: IS_WEB ? 10 : 8 },
  answeredQuestion: { fontSize: IS_WEB ? 16 : 12, color: '#94A3B8', marginBottom: IS_WEB ? 3 : 2 },
  answeredValue: { fontSize: IS_WEB ? 18 : 14, fontWeight: '600', color: '#0F172A' },
});
