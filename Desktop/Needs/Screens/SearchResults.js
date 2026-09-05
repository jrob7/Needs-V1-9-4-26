// SearchResults.js
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import Card from '/Users/joshhurst/Desktop/Needs/Screens/Card.js'; // adjust path if needed

import { NODE_API as API_BASE_URL } from '../config';

const SearchResults = () => {
  const route = useRoute();
  const navigation = useNavigation();

  // 🔹 Now support preloaded searchResults
  const {
    searchText,
    urgency,
    bidprice,
    userId: initialUserId,
    searchResults: preloaded,
  } = route.params;

  const [userId, setUserId] = useState(initialUserId || null);
  const [results, setResults] = useState([]);

  useEffect(() => {
    // 🔹 If browsing all items or matched items were preloaded, skip API search
    if (preloaded && Array.isArray(preloaded) && preloaded.length > 0) {
      console.log("📌 Using preloaded results (skip API search)");
      setResults(preloaded);
      return;
    }

    // 🔹 Otherwise, perform normal search
    performSearch();
  }, [searchText, urgency, bidprice, userId]);

  const performSearch = async () => {
    try {
      console.log('Performing search with:', { searchText, urgency, bidprice });

      const requestData = {
        searchText: searchText || 'General Inquiry',
        urgency: urgency || 'No Urgency',
        bidprice: bidprice || 'N/A',
      };

      const response = await axios.get(`${API_BASE_URL}/searchResults`, { params: requestData });

      if (response.status === 200) {
        console.log('📦 Hydrated Results:', response.data);
        setResults(response.data);
      } else {
        throw new Error('Search request failed');
      }
    } catch (error) {
      console.error('❌ Search error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {results.length > 0 ? (
          results.map((item, idx) => {
            const media = item.media?.uri
              ? { uri: item.media.uri, type: item.media.type || 'image' }
              : item.images?.[0]
              ? { uri: item.images[0], type: 'image' }
              : null;

            return (
              <Card
                key={item._id || idx}
                badgeLabel={'Available'}
                badgeColor={'#2ECC71'}
                title={item.title || item.searchText || 'Untitled'}
                subtitle={item.urgency ? `When: ${item.urgency}` : ''}
                infoLine={item.bidprice ? `Offer: $${item.bidprice}` : ''}
                media={media}
                compact
                onPress={() => navigation.navigate('SingleItemView', { item, fromNeedInquiry: false })}
                isActive={false}
              />
            );
          })
        ) : (
          <Text style={styles.noResultsText}>No matching results found.</Text>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0', padding: 10 },
  scrollViewContent: { alignItems: 'center' },
  noResultsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'gray',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default SearchResults;