// UploadItems.js
import React, { useState, useContext } from 'react';
import {
  View, Text, TextInput, Button, StyleSheet, ScrollView,
  Image, Alert, TouchableOpacity,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { UserContext } from '../server/CurrentUser';
import { authFetch } from '../server/api';

const UploadItems = () => {
  const { userId } = useContext(UserContext); // <-- userId from context

  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('');
  const [bidprice, setBidprice] = useState('');
  const [images, setImages] = useState([]);
  const [title, setTitle] = useState('');
  

  const GOOGLE_VISION_API_KEY = 'AIzaSyDcozWA1GD5WpZUONt7V7lscHn80PddUps';
  const GOOGLE_VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`;

  const analyzeImageWithVisionAPI = async (base64Image) => {
    try {
      const response = await fetch(GOOGLE_VISION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [
                { type: 'WEB_DETECTION', maxResults: 1 },
             // { type: 'TEXT_DETECTION', maxResults: 1 },
                { type: 'LOGO_DETECTION', maxResults: 1 },
              ],
            },
          ],
        }),
      });

      const data = await response.json();
      if (!data.responses || !data.responses[0]) {
        throw new Error('Vision API returned no valid response.');
      }

      const resp = data.responses[0];
      const bestGuess    = resp.webDetection?.bestGuessLabels?.[0]?.label || '';
      const webEntities  = resp.webDetection?.webEntities?.map(e => e.description).filter(Boolean) || [];
      const textAnn      = resp.textAnnotations?.[0]?.description || '';
      const logos        = resp.logoAnnotations?.map(l => l.description).filter(Boolean) || [];

      return [bestGuess, ...webEntities, ...logos, textAnn].filter(Boolean).join(', ');
    } catch (error) {
      console.error('Vision API error:', error);
      return '';
    }
  };

  const handleImagePick = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission to access the camera roll is required!');
        return;
      }
  
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
        base64: true,
      });
  
      if (pickerResult.assets && pickerResult.assets[0]?.base64) {
        const selectedImage = pickerResult.assets[0];
        setImages(prev => [...prev, selectedImage]);
  
        // ✅ Step 1: Google Vision → Extract labels
        const labels = await analyzeImageWithVisionAPI(selectedImage.base64);
        console.log("🔍 Vision Labels:", labels);
  
        if (!labels) return;
  
        // ✅ Step 2: Send labels → Flask → Mistral (LLM)
        const enhanceRes = await fetch("http://localhost:5001/enhanceImageDescription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labels }),
        });
  
        const enhanceData = await enhanceRes.json();
        console.log("🧠 LLM Enhance Response:", enhanceData);
  
        // ✅ Step 3: Auto-fill fields
        if (enhanceData.title) setTitle(enhanceData.title);
        if (enhanceData.description) setDescription(enhanceData.description);
  
        Alert.alert("AI Completed", "Title & description auto-generated!");
      } else {
        Alert.alert('Error', 'No base64 data found in the selected image.');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'An unexpected error occurred while picking the image.');
    }
  };

  const handleSubmit = async () => {
    try {
      if (!userId) {
        Alert.alert('Not signed in', 'Please log in before uploading an item.');
        return;
      }
      if (!description || !urgency || !bidprice || images.length === 0) {
        Alert.alert('Missing info', 'Please fill in all fields and select at least one image.');
        return;
      }

      // Upload images -> get URLs/IDs back
      const imageUploadPromises = images.map(async (image) => {
        if (!image.base64) throw new Error('No base64 data available');
        const response = await fetch('http://localhost:3000/uploadImage', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: image.base64,
        });
        if (!response.ok) throw new Error('Failed to upload image');
        const { imageUrl } = await response.json();
        return imageUrl; // string (ID or URL depending on your backend)
      });

      const imageUrls = await Promise.all(imageUploadPromises);

      // Create the Need/Item (now includes userId)
      const resp = await authFetch('http://localhost:3000/createNeedInquiry', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          urgency,
          bidprice: Number(bidprice),
          images: imageUrls,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create item');
      }

      Alert.alert('Success', 'Item uploaded successfully!');
      setDescription('');
      setUrgency('');
      setBidprice('');
      setImages([]);
    } catch (error) {
      console.error('Error uploading item:', error);
      Alert.alert('Upload failed', error.message || 'Failed to upload item');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
  {/* NEEDS LOGO SEPARATOR */}
<View style={styles.logoCard}>
  <Image
    source={require('/Users/joshhurst/Desktop/Needs/assets/NeedsLogo.png')}
    style={styles.logo}
    resizeMode="contain"
  />
</View>
      <Text style={styles.header}>Upload an Item</Text>
  
      <View style={styles.card}>
        <TouchableOpacity style={styles.imageButton} onPress={handleImagePick}>
          <Text style={styles.imageButtonText}>Pick Images</Text>
        </TouchableOpacity>
  
        <View style={styles.imagePreviewRow}>
          {images.map((img, index) => (
            <Image key={index} source={{ uri: img.uri }} style={styles.imagePreview} />
          ))}
        </View>
      </View>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Item Title"
          value={title}
          onChangeText={setTitle}
        />
  
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Full Description (details, condition, features)"
          value={description}
          onChangeText={setDescription}
          multiline
        />
  
        <TextInput
          style={styles.input}
          placeholder="Urgency (e.g. Today, Tomorrow)"
          value={urgency}
          onChangeText={setUrgency}
        />
  
        <TextInput
          style={styles.input}
          placeholder="Bid Price"
          keyboardType="numeric"
          value={bidprice}
          onChangeText={setBidprice}
        />
  
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>Submit</Text>
        </TouchableOpacity>
      </View>
  
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 22,
    backgroundColor: "#F8FAFD",
  },

  header: {
    fontSize: 26,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 20,
    color: "#1A73E8",
  },

  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 14,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  imageButton: {
    backgroundColor: "#1A73E8",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  imageButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },

  imagePreviewRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
    marginRight: 8,
    marginBottom: 8,
  },

  input: {
    backgroundColor: "#F1F3F5",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#111",
    marginBottom: 14,
  },

  textArea: {
    height: 110,
    textAlignVertical: "top",
  },

  submitButton: {
    backgroundColor: "#1A73E8",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
  },
  submitButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  
  
  logo: {
    width: 170,
    height: 48,
  
    // subtle elevation pop
    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  logoCard: {
    backgroundColor: "#ffffff",
    paddingVertical: 1,
    paddingHorizontal: 1,
    borderRadius: 15,
  
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  
    marginVertical: 15,
  
    // Soft neumorphic shadow
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  
  logo: {
    width: 150,  // increased from ~160
    height: 50,  // increased height for proportional scale
  }
});

export default UploadItems;