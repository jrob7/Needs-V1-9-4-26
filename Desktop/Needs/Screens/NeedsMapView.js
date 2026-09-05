// Native-only map view — Metro picks this file on iOS/Android
import React from 'react';
import { View, Text, Image } from 'react-native';
import MapViewCluster from 'react-native-map-clustering';
import { Marker } from 'react-native-maps';

export default function NeedsMapView({ region, filteredNeeds, filteredFr, openNeed, openFundraiser, getBestMedia }) {
  return (
    <MapViewCluster
      style={{ flex: 1 }}
      initialRegion={region}
      clusterColor="#007bff"
      clusterTextColor="#fff"
      spiralEnabled
      animationEnabled
      showsUserLocation
      zoomEnabled
      zoomTapEnabled
    >
      {filteredNeeds.map((n) => {
        const coords = n?.location?.coordinates;
        const media = getBestMedia(n);
        if (!coords || coords.length !== 2) return null;
        return (
          <Marker key={n._id} coordinate={{ latitude: coords[1], longitude: coords[0] }}
            onPress={() => openNeed(n)}>
            <View style={styles.pinContainer}>
              <View style={[styles.pinBubble, { borderColor: '#007bff' }]}>
                {media?.uri
                  ? <Image source={{ uri: media.uri }} style={styles.pinImage} />
                  : <Text style={styles.pinLabel}>Need</Text>}
              </View>
              <View style={[styles.pinTail, { borderTopColor: '#007bff' }]} />
              <Text style={styles.pinTitle}>Need</Text>
            </View>
          </Marker>
        );
      })}

      {filteredFr.map((f) => {
        const coords = f?.location?.coordinates;
        const media = getBestMedia(f);
        if (!coords || coords.length !== 2) return null;
        return (
          <Marker key={f._id} coordinate={{ latitude: coords[1], longitude: coords[0] }}
            onPress={() => openFundraiser(f)}>
            <View style={styles.pinContainer}>
              <View style={[styles.pinBubble, { borderColor: '#FF9500' }]}>
                {media?.uri
                  ? <Image source={{ uri: media.uri }} style={styles.pinImage} />
                  : <Text style={styles.pinLabel}>Fundraiser</Text>}
              </View>
              <View style={[styles.pinTail, { borderTopColor: '#FF9500' }]} />
              <Text style={styles.pinTitle}>Fundraiser</Text>
            </View>
          </Marker>
        );
      })}
    </MapViewCluster>
  );
}

const styles = {
  pinContainer: { alignItems: 'center' },
  pinBubble: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, backgroundColor: '#fff',
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  pinImage: { width: 44, height: 44 },
  pinLabel: { fontSize: 8, fontWeight: '700', color: '#333' },
  pinTail: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  pinTitle: { fontSize: 9, fontWeight: '600', color: '#333', marginTop: 1 },
};
