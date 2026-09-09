import React, { useState, useEffect, useContext } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing } from 'react-native';
import { UserContext } from '../server/CurrentUser';
import NeedsVideoPlayer from '../utils/NeedsVideoPlayer';
import { useNavigation } from '@react-navigation/native';

const CurrentProfileView = () => {
   const navigation = useNavigation(); // Get navigation object
  const { userId: globalUserId } = useContext(UserContext);
  const [profilePicture, setProfilePicture] = useState(null);
  const [introMedia, setIntroMedia] = useState(null);
  const [name, setName] = useState('');
  const [trustScore, setTrustScore] = useState(4.3);
  const [filledNeeds, setFilledNeeds] = useState(0);
  const [banners, setBanners] = useState([
    '1. Working On finding Resources for LA fire Victims and looking for volunteers!',
    '2. Looking for a collaborator!',
    '3. Need help with an idea!',
  ]); // Default banners
  

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!globalUserId) return;

      try {
        const response = await fetch(`http://localhost:3000/getUserProfile?userId=${globalUserId}`);
        const result = await response.json();

        if (result.name) setName(result.name);
        if (result.trustScore) setTrustScore(result.trustScore);
        if (result.profilePicture) setProfilePicture(result.profilePicture);
        if (result.introMedia) setIntroMedia(result.introMedia);
        if (result.filledNeeds !== undefined) setFilledNeeds(result.filledNeeds);
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    };

    fetchUserProfile();
  }, [globalUserId]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Profile Section */}
      <View style={styles.profileSection}>
        <View style={styles.profileLeft}>
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.profilePicture} />
          ) : (
            <View style={[styles.profilePicture, styles.profilePlaceholder]}>
              <Text style={styles.placeholderText}>Add Image</Text>
            </View>
          )}
          <Text style={styles.name}>{name || 'No Name'}</Text>
        </View>
        <View style={styles.profileRight}>
          <Text style={styles.trustScore}>Trust Score: {trustScore}/5</Text>
          <Text style={styles.filledNeeds}>Filled Needs: {filledNeeds}</Text>
          <TouchableOpacity style={styles.Message}>
            <Text style={styles.messageText}>Message</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Focus Section */}
      <View style={styles.focusSection}>
        <Text style={styles.sectionTitle}>Top Focus:</Text>
        {banners.map((banner, index) => (
          <MarqueeText key={index} text={banner} style={styles[`banner${index + 1}`]} />
        ))}
      </View>

      {/* About Section */}
      <View style={styles.aboutSection}>
        <Text style={styles.sectionTitle}>About:</Text>
        {introMedia && (
          <NeedsVideoPlayer uri={introMedia} style={styles.media} contentFit="contain" />
        )}
        <Text style={styles.aboutText}>This is a sample user profile description.</Text>
      </View>
    </ScrollView>
  );
};

const MarqueeText = ({ text, style }) => {
  const [shouldScroll, setShouldScroll] = useState(false);
  const [textWidth, setTextWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const animation = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (shouldScroll) {
      Animated.loop(
        Animated.timing(animation, {
          toValue: 1,
          duration: 5000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [shouldScroll, animation]);

  const translateX = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -textWidth + containerWidth],
  });

  return (
    <View
      style={[styles.banner, style]}
      onLayout={(e) => {
        const { width } = e.nativeEvent.layout;
        setContainerWidth(width);
      }}
    >
      <Animated.Text
        onLayout={(e) => {
          const { width } = e.nativeEvent.layout;
          setTextWidth(width);
          setShouldScroll(width > containerWidth);
        }}
        style={[
          styles.bannerText,
          shouldScroll && { transform: [{ translateX }] },
        ]}
      >
        {text}
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 10,
  },
  profileSection: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileLeft: {
    alignItems: 'center',
  },
  profileRight: {
    flex: 1,
    marginLeft: 20,
  },
  profilePicture: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 10,
  },
  profilePlaceholder: {
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  placeholderText: {
    color: '#666',
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  trustScore: {
    fontSize: 16,
    color: '#555',
    marginBottom: 5,
  },
  filledNeeds: {
    fontSize: 16,
    color: '#007bff',
    marginBottom: 10,
  },
  Message: {
    backgroundColor: '#007bff',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    borderColor: '#007bff',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    
  },
  focusSection: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
    marginBottom: 20,
  },
  banner: { 

    padding: 10, // Padding for text inside
    borderRadius: 5, // Rounded corners
    borderWidth: 1, // Optional border
    marginBottom: 10, // Space between banners
    overflow: 'hidden', // Ensures text stays inside the rounded corners
    shadowColor: '#000', // Shadow color
    shadowOffset: { width: 0, height: 2 }, // Slight offset to make the shadow appear below
    shadowOpacity: 0.2, // Transparency of shadow
    shadowRadius: 1, // Blurriness of shadow
    elevation: 3, // Adds shadow for Android devices
  },
  
  bannerText: {
    fontSize: 16,
    color: '#007bff',
    fontWeight: 'bold',
  },
  aboutSection: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  media: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginBottom: 10,
  },
  aboutText: {
    fontSize: 16,
    color: '#333',
  },
});

export default CurrentProfileView;