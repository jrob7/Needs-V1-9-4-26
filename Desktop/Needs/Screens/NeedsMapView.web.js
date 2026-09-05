// Screens/NeedsMapView.web.js
// Web-only Leaflet map — Metro resolves this instead of NeedsMapView.js on web.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// ── Inject Leaflet CSS from CDN (Metro doesn't process .css imports) ──────────
function useLeafletCSS() {
  useEffect(() => {
    const id = 'leaflet-css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }, []);
}

// ── Custom pin icons ───────────────────────────────────────────────────────────
function makePin(color, label) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        display:flex; flex-direction:column; align-items:center; cursor:pointer;
      ">
        <div style="
          width:38px; height:38px; border-radius:50%;
          background:${color}; border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,0.35);
          display:flex; align-items:center; justify-content:center;
          font-size:11px; font-weight:800; color:#fff;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        ">${label}</div>
        <div style="
          width:0; height:0;
          border-left:6px solid transparent;
          border-right:6px solid transparent;
          border-top:8px solid ${color};
          margin-top:-1px;
        "></div>
      </div>`,
    iconSize: [38, 52],
    iconAnchor: [19, 52],
    popupAnchor: [0, -54],
  });
}

const NEED_ICON = makePin('#2563EB', '!');
const FR_ICON   = makePin('#F97316', '$');

const USER_ICON = L.divIcon({
  className: '',
  html: `<div style="
    width:18px; height:18px; border-radius:50%;
    background:#2563EB; border:3px solid #fff;
    box-shadow:0 0 0 4px rgba(37,99,235,0.25);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// ── Re-centers the map when userLatLng changes ────────────────────────────────
function RecenterOnUser({ userLatLng }) {
  const map = useMap();
  useEffect(() => {
    if (userLatLng) map.flyTo(userLatLng, Math.max(map.getZoom(), 13), { duration: 1.2 });
  }, [userLatLng]);
  return null;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function NeedsMapView({ region, filteredNeeds, filteredFr, openNeed, openFundraiser, getBestMedia }) {
  useLeafletCSS();

  const [userLatLng, setUserLatLng] = useState(null);
  const [locating, setLocating]     = useState(false);
  const [denied, setDenied]         = useState(false);

  // Default center: use region prop if available, otherwise San Francisco
  const defaultCenter = region
    ? [region.latitude, region.longitude]
    : [37.7749, -122.4194];

  const requestLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLatLng([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
        setDenied(false);
      },
      () => {
        setLocating(false);
        setDenied(true);
      },
      { timeout: 10000 },
    );
  };

  // Ask on first mount
  useEffect(() => { requestLocation(); }, []);

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      <MapContainer
        center={userLatLng || defaultCenter}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {userLatLng && (
          <Marker position={userLatLng} icon={USER_ICON}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        {(filteredNeeds || []).map((n) => {
          const coords = n?.location?.coordinates;
          if (!coords || coords.length !== 2) return null;
          const pos = [coords[1], coords[0]]; // [lng, lat] → [lat, lng]
          return (
            <Marker key={n._id} position={pos} icon={NEED_ICON}>
              <Popup>
                <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minWidth: 160 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>
                    {n.searchText || n.title || 'Need'}
                  </div>
                  {n.bidprice && (
                    <div style={{ fontSize: 12, color: '#2563EB', fontWeight: 700, marginBottom: 6 }}>
                      Budget: ${n.bidprice}
                    </div>
                  )}
                  <button
                    onClick={() => openNeed(n)}
                    style={{
                      width: '100%', padding: '7px 0', borderRadius: 8,
                      background: '#2563EB', color: '#fff', border: 'none',
                      fontWeight: 800, fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    View Need
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {(filteredFr || []).map((f) => {
          const coords = f?.location?.coordinates;
          if (!coords || coords.length !== 2) return null;
          const pos = [coords[1], coords[0]];
          return (
            <Marker key={f._id} position={pos} icon={FR_ICON}>
              <Popup>
                <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minWidth: 160 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>
                    {f.title || 'Fundraiser'}
                  </div>
                  {f.targetAmount != null && (
                    <div style={{ fontSize: 12, color: '#F97316', fontWeight: 700, marginBottom: 6 }}>
                      Goal: ${f.targetAmount}
                    </div>
                  )}
                  <button
                    onClick={() => openFundraiser(f)}
                    style={{
                      width: '100%', padding: '7px 0', borderRadius: 8,
                      background: '#F97316', color: '#fff', border: 'none',
                      fontWeight: 800, fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    View Fundraiser
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        <RecenterOnUser userLatLng={userLatLng} />
      </MapContainer>

      {/* Locate-me button */}
      <TouchableOpacity
        onPress={requestLocation}
        style={{
          position: 'absolute', bottom: 24, right: 16, zIndex: 1000,
          width: 46, height: 46, borderRadius: 23,
          backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#BFDBFE',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
        }}
        disabled={locating}
      >
        {locating
          ? <ActivityIndicator size="small" color="#2563EB" />
          : <Text style={{ fontSize: 20 }}>{denied ? '📍' : '🎯'}</Text>}
      </TouchableOpacity>
    </View>
  );
}
