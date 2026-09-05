// Screens/UploadTypeSelector.js
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const UPLOAD_TYPES = [
  {
    key: 'item',
    screen: 'UploadItems',
    emoji: '📦',
    label: 'Item',
    description: 'List a physical product, good, or object',
    color: '#1A73E8',
    bg: '#EBF2FF',
  },
  {
    key: 'restaurant',
    screen: 'UploadRestaurant',
    emoji: '🍽️',
    label: 'Restaurant',
    description: 'Add a food spot — tacos, burgers, sushi & more',
    color: '#E8450A',
    bg: '#FFF0EB',
  },
  {
    key: 'service',
    screen: 'UploadService',
    emoji: '🔧',
    label: 'Service',
    description: 'Offer a skill — plumbing, electrical, cleaning & more',
    color: '#0A8A4A',
    bg: '#EBFFF4',
  },
];

export default function UploadTypeSelector({ navigation }) {

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Back button ── */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={22} color="#1A73E8" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.container}>
        <Text style={styles.heading}>What are you uploading?</Text>
        <Text style={styles.subheading}>Choose a category to get started</Text>

        {UPLOAD_TYPES.map((type) => (
          <TouchableOpacity
            key={type.key}
            style={[styles.card, { backgroundColor: type.bg, borderColor: type.color }]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate(type.screen)}
          >
            <View style={[styles.iconCircle, { backgroundColor: type.color }]}>
              <Text style={styles.emoji}>{type.emoji}</Text>
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardLabel, { color: type.color }]}>{type.label}</Text>
              <Text style={styles.cardDesc}>{type.description}</Text>
            </View>
            <Text style={[styles.arrow, { color: type.color }]}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFD' },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backText: {
    fontSize: 16,
    color: '#1A73E8',
    fontWeight: '600',
    marginLeft: 2,
  },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 36,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  emoji: { fontSize: 24 },
  cardText: { flex: 1 },
  cardLabel: { fontSize: 18, fontWeight: '800', marginBottom: 3 },
  cardDesc: { fontSize: 13, color: '#374151', lineHeight: 18 },
  arrow: { fontSize: 30, fontWeight: '300', marginLeft: 8 },
});