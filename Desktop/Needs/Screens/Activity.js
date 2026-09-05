import React, { useEffect, useState, useContext } from 'react';
import { View, StyleSheet, Text, Dimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { UserContext } from '../server/CurrentUser';
import { authFetch } from '../server/api';
import ZoomableTimeline from './ZoomableTimeline';
import { IS_WEB } from '../webLayout';

const H = Dimensions.get('window').height;

const tryJson = async (url) => {
  try {
    console.log('📡 Fetching:', url);
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    console.log('✅ Response Data:', json);
    return json;
  } catch (e) {
    console.error('❌ tryJson error:', url, e);
    return null;
  }
};

export default function Activity() {
  const route = useRoute();
  const navigation = useNavigation();
  const { userId: currentUserId } = useContext(UserContext);
  // ✅ Determine correct flow type
const isNeedFlow =
route?.params?.isNeedFlow === true ||
(route?.params?.needItem && route?.params?.needItem?.type !== 'fundraiser');

  const [items, setItems] = useState([]);
  const [profilePicture, setProfilePicture] = useState(null);
  const [transparencyData, setTransparencyData] = useState({
    userDonation: 0,
    otherDonations: 0,
    totalRaised: 0,
    disbursed: 0,
  });

  // ✅ Fetch profile picture
  useEffect(() => {
    if (!currentUserId) return;
    fetch(`http://localhost:3000/getUserProfile?userId=${currentUserId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.profilePicture) {
          setProfilePicture(data.profilePicture);
        }
      })
      .catch((err) => console.error('Error fetching profile picture:', err));
  }, [currentUserId]);

  // ✅ Fetch transparency
  const fetchTransparency = async (fundraiserId) => {
    try {
      console.log('🔍 Fetching transparency data for fundraiserId:', fundraiserId);
      const res = await fetch(
        `http://localhost:3000/fundraiser-transparency?fundraiserId=${fundraiserId}&userId=${currentUserId}`
      );
      if (!res.ok) throw new Error('Failed to fetch transparency data');
      const data = await res.json();
      console.log('✅ Transparency data:', data);
      setTransparencyData(data);
    } catch (e) {
      console.error('❌ Transparency fetch error:', e);
    }
  };

  // 🔄 Fetch transactions
  useEffect(() => {
    if (!currentUserId) return;

    (async () => {
      try {
        console.log('🔍 Fetching transaction history for user:', currentUserId);
        const r = await authFetch('http://localhost:3000/transactions');
        if (!r.ok) return;
        const raw = await r.json();

        const enriched = await Promise.all(
          raw.map(async (tx) => {
            const [fromP, toP] = await Promise.all([
              tryJson(`http://localhost:3000/getUserProfile?userId=${tx.fromUserId}`),
              tryJson(`http://localhost:3000/getUserProfile?userId=${tx.toUserId}`),
            ]);

            let needTitle = tx.needTitle;
            if (!needTitle && tx.needId) {
              const byId = await tryJson(`http://localhost:3000/getNeedById?needId=${tx.needId}`);
              needTitle = byId?.searchText || byId?.title || byId?.description || 'Untitled';
            }

            return {
              ...tx,
              fromName: fromP?.name || 'Unknown',
              toName: toP?.name || 'Unknown',
              needTitle: needTitle || 'Untitled',
            };
          })
        );

        console.log('✅ Enriched transactions:', enriched);
        setItems(enriched);

        // Auto-select latest fundraiser if not set
        if (!route?.params?.needItem && enriched.length > 0) {
          const latestFundraiser = enriched
            .filter((tx) => tx.type === 'fundraiser')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

          if (latestFundraiser?.needId) {
            const need = await tryJson(
              `http://localhost:3000/getNeedById?needId=${latestFundraiser.needId}`
            );
            if (need) {
              console.log('🧩 Full need from getNeedById:', need);
              navigation.setParams({ needItem: need }); // ✅ includes .media
              fetchTransparency(need._id);
            }
          }
        }
      } catch (e) {
        console.log('❌ Load transactions error:', e);
      }
    })();
  }, [currentUserId]);

  // ✅ Refresh transparency when items or needItem change
  useEffect(() => {
    if (route?.params?.needItem?._id) {
      fetchTransparency(route.params.needItem._id);
    }
  }, [items, route?.params?.needItem?._id]);

  // ✅ Refresh transparency after contribution
  useEffect(() => {
    if (route?.params?.refresh && route?.params?.needItem?._id) {
      console.log("🔄 Refreshing transparency after contribution");
      fetchTransparency(route.params.needItem._id);
      navigation.setParams({ refresh: false });
    }
  }, [route?.params?.refresh]);

  return (
    <View style={styles.screen}>
      {route?.params?.needItem && currentUserId ? (
        <ZoomableTimeline
          fundraiserId={route.params.needItem._id}
          userId={currentUserId}
          isNeedFlow={isNeedFlow}              // ✅ NEW PROP
          needItem={route.params.needItem}     // ✅ pass item data too
          youLabel={`You: $${transparencyData.userDonation}`}
          otherDonorLabel={`Others: $${transparencyData.otherDonations}`}
          orgLabel={`Escrow: $${transparencyData.totalRaised}`}
          recipientLabel={`Disbursed: $${transparencyData.disbursed}`}
          youAmount={transparencyData.userDonation}
          otherAmount={transparencyData.otherDonations}
          downAmount={transparencyData.disbursed}
          youImage={profilePicture}
          fundraiserImage={route.params.needItem.media?.uri}
          transactions={items}
        />
      ) : (
        <Text style={{ padding: 20 }}>Loading fundraiser...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: IS_WEB ? '#F8F8F8' : '#fff' },
});