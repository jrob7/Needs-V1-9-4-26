// Screens/ZoomableTimeline.js
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  TouchableOpacity,
  FlatList,
  Image as RNImage,
} from 'react-native';
import Svg, {
  Circle,
  Text as SvgText,
  Line,
  Defs,
  ClipPath,
  Image as SvgImage,
  Rect,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

const { height: H, width: W } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmtUSD = (n = 0) =>
  `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function pointAlong({ x1, y1, x2, y2 }, t) {
  return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
}
function angleDeg({ x1, y1, x2, y2 }) {
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}
function placeNearEnd(rail, nodeRadius, visualLen, gap = 8) {
  const dx = rail.x2 - rail.x1;
  const dy = rail.y2 - rail.y1;
  const L = Math.max(1, Math.hypot(dx, dy));
  const pullback = nodeRadius + gap + visualLen / 2;
  const t = Math.max(0.02, 1 - pullback / L);
  const { x, y } = pointAlong(rail, t);
  const deg = angleDeg(rail);
  return { x, y, deg };
}

// ---------------------------------------------------------------------------
// Golden Slider (fundraiser mode)
// ---------------------------------------------------------------------------
function GoldenSlider({
  amount = 0,
  rail,
  nodeRadius,
  pillW = 65,
  pillH = 25,
  arrowSize = 47,
  gap = 0.1,
}) {
  const visualLen = pillW + gap + arrowSize;
  const { x, y, deg } = placeNearEnd(rail, nodeRadius, visualLen);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - (pillW + gap + arrowSize) / 2,
        top: y - pillH / 2,
        width: pillW + gap + arrowSize,
        height: pillH,
        transform: [{ rotate: `${deg}deg` }],
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: pillW,
          height: pillH,
          borderRadius: pillH / 2,
          backgroundColor: '#FFFFFF',
          borderWidth: 2,
          borderColor: '#374151',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontWeight: 'bold', color: '#1A56DB' }}>
          {fmtUSD(amount)}
        </Text>
      </View>

      <Text
        style={{
          position: 'absolute',
          left: pillW + gap,
          top: pillH / 2 - arrowSize / 2 + 4,
          fontSize: arrowSize,
          lineHeight: arrowSize,
          color: '#2979FF',
        }}
      >
        →
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function ZoomableTimeline({
  fundraiserId,
  userId,
  youAmount = 0,
  otherAmount = 0,
  downAmount = 0,
  youImage,
  fundraiserImage: propFundraiserImage,
  transactions = [],
  isNeedFlow = false,
  needItem = null,
}) {
  const [fundraiserImage, setFundraiserImage] = useState(propFundraiserImage || null);
  const [mode, setMode] = useState('diagram');
  const [box, setBox] = useState({ w: W, h: H });
  const [showEscrowModal, setShowEscrowModal] = useState(true);

  // escrow logo
  const escrowLogo = RNImage.resolveAssetSource(
    require('/Users/joshhurst/Desktop/Needs/assets/NeedsLogo.png')
  ).uri;

  // fetch all transactions (legacy, kept for reference)

  const [allTransactions, setAllTransactions] = useState([]);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const [fundRes, needRes] = await Promise.all([
          fetch('http://localhost:3000/fundraiser-transactions'),
          fetch('http://localhost:3000/need-transactions')
        ]);
  
        const fundData = await fundRes.json();
        const needData = await needRes.json();
  
        // Combine and sort by date descending
        const combined = [...fundData, ...needData].sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
  
        setAllTransactions(combined);
      } catch (e) {
        console.error('❌ Error fetching transactions:', e);
      }
    };
  
    // Initial load + refresh every 10 seconds
    fetchTransactions();
    const interval = setInterval(fetchTransactions, 10000);
    return () => clearInterval(interval);
  }, []);





  // fetch fundraiser image
  useEffect(() => {
    if (!fundraiserId || fundraiserImage) return;
    const fetchFundraiser = async () => {
      try {
        const resp = await fetch(
          `http://localhost:3000/fundraiserById?fundraiserId=${fundraiserId}`
        );
        const fundraiser = await resp.json();
        setFundraiserImage(fundraiser?.media?.uri || null);
      } catch (e) {
        console.error('❌ Error fetching fundraiser image:', e);
      }
    };
    fetchFundraiser();
  }, [fundraiserId, fundraiserImage]);

  const safeFundraiserImage =
    fundraiserImage && !String(fundraiserImage).toLowerCase().endsWith('.mov')
      ? fundraiserImage
      : null;

  // Layout constants
  const PAD = 24;
  const rTop = 33;
  const rMid = 40;
  const rEnd = 34;
  const w = box.w;
  const h = box.h;

  const youX = PAD + rTop;
  const otherX = w - PAD - rTop;
  const topY = PAD + rTop + 6;
  const orgX = w / 2;
  const orgY = h * 0.56;
  const endX = orgX;
  const endY = h - PAD - rEnd;

  const railLeft = { x1: youX + rTop + 6, y1: topY + rTop + 6, x2: orgX, y2: orgY - rMid - 8 };
  const railRight = { x1: otherX - rTop - 6, y1: topY + rTop + 6, x2: orgX, y2: orgY - rMid - 8 };
  const railDown = { x1: orgX, y1: orgY + rMid + 10, x2: endX, y2: endY - rEnd - 10 };

  // Need flow
  const needItemImage = needItem?.media?.uri || null;
  const needAmount = needItem?.bidprice || 0;
  const requesterName =
    needItem?.requesterName ||
    needItem?.createdByName ||
    needItem?.firstName ||
    'Requester';

  // -------------------------------------------------------------------------
  // Stylized FlatList data & rendering (NEW)
  // -------------------------------------------------------------------------
  const mergedTx = useMemo(() => {
    const normalized = (Array.isArray(allTransactions) ? allTransactions : []).map((t) => {
      const kind = (t.type === 'fundraiser') ? 'fundraiser' : 'need';
      const createdAt = t.createdAt ? new Date(t.createdAt) : null;
      return {
        ...t,
        __kind: kind,
        __createdAtTs: createdAt ? createdAt.getTime() : 0,
        fromName: t.fromName || 'Unknown',
        toName: t.toName || 'Unknown',
        needTitle: t.needTitle || 'Untitled',
      };
    });
    normalized.sort((a, b) => b.__createdAtTs - a.__createdAtTs);
    return normalized;
  }, [allTransactions]);

  const renderTxCard = ({ item }) => {
    const isFundraiser = item.__kind === 'fundraiser';
    const leftBarColor = isFundraiser ? '#4D7CFE' : '#22C55E'; // blue for fundraisers, green for needs
    const badgeEmoji = isFundraiser ? '🎗️' : '🤝';
    const badgeLabel = isFundraiser ? 'Fundraiser' : 'Need Request';
    const rightAmount = fmtUSD(item.amount || 0);
    const when = item.__createdAtTs
      ? new Date(item.__createdAtTs).toLocaleString()
      : '';

    return (
      <View style={styles.cardShadowWrap}>
        <View style={styles.txCardNew}>
          <View style={[styles.cardAccent, { backgroundColor: leftBarColor }]} />
          <View style={{ flex: 1 }}>
            <View style={styles.cardHeaderRow}>
              <Text numberOfLines={1} style={styles.cardNames}>
                {item.fromName} <Text style={styles.arrowMid}>→</Text> {item.toName}
              </Text>
              <Text style={styles.cardAmount}>{rightAmount}</Text>
            </View>

            <View style={styles.cardSubRow}>
              <Text style={styles.badge}>
                <Text style={styles.badgeEmoji}>{badgeEmoji}</Text>{' '}
                <Text style={styles.badgeText}>{badgeLabel}:</Text>{' '}
                <Text style={styles.badgeTitle}>{item.needTitle}</Text>
              </Text>
            </View>

            <View style={styles.cardMetaRow}>
              <Text style={styles.metaText}>{when}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const listEmpty = (
    <View style={{ padding: 24, alignItems: 'center' }}>
      <Text style={{ color: '#6B7280' }}>No transactions yet.</Text>
    </View>
  );

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------
  return (
    <View
      style={styles.host}
      onLayout={(e) => {
        const { width, height: hh } = e.nativeEvent.layout;
        setBox({ w: width, h: hh });
      }}
    >
      {isNeedFlow ? (
        <>
          <Text style={styles.needTitle}>Fulfilled Need Transaction</Text>

          {/* ---------- Need Flow Toggle ---------- */}
          {mode === 'diagram' ? (
            <Svg width="100%" height="80%">
              {(() => {
                const cy = h * 0.37;
                const PAD = 12;
                const rNode = 33;
                const leftX = PAD + rNode;
                const amountX = w * 0.33;
                const itemX = w * 0.66;
                const rightX = w - PAD - rNode;

                return (
                  <>
                    <Line x1={leftX} y1={cy} x2={rightX} y2={cy} stroke="#000" strokeWidth={6} strokeLinecap="round" />
                    <Line x1={leftX} y1={cy} x2={rightX} y2={cy} stroke="white" strokeWidth={4} strokeLinecap="round" />
                    <SvgText x={(leftX + amountX + 20) / 2} y={cy + 17.5} fontSize="50" fill="#2E6CF6" textAnchor="middle">
                      {'←'}
                    </SvgText>
                    <SvgText x={(itemX + rightX - 16) / 2} y={cy + 17.5} fontSize="50" fill="#2E6CF6" textAnchor="middle">
                      {'→'}
                    </SvgText>

                    {youImage ? (
                      <>
                        <Defs>
                          <ClipPath id="receiverClip">
                            <Circle cx={leftX} cy={cy} r={rNode} />
                          </ClipPath>
                        </Defs>
                        <Circle cx={leftX} cy={cy} r={rNode + 2} stroke="#2E6CF6" strokeWidth={3} fill="#fff" />
                        <SvgImage
                          href={{ uri: youImage }}
                          x={leftX - rNode}
                          y={cy - rNode}
                          width={rNode * 2}
                          height={rNode * 2}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath="url(#receiverClip)"
                        />
                      </>
                    ) : (
                      <>
                        <Circle cx={leftX} cy={cy} r={rNode} fill="#1E90FF" />
                        <SvgText x={leftX} y={cy + 5} fontSize="14" fontWeight="700" fill="#fff" textAnchor="middle">
                          Receiver
                        </SvgText>
                      </>
                    )}

                    <Rect
                      x={amountX - 22}
                      y={cy - 16}
                      width={53}
                      height={32}
                      rx={16}
                      ry={16}
                      stroke="#2E6CF6"
                      strokeWidth={2}
                      fill="#fff"
                    />
                    <SvgText x={amountX + 2} y={cy + 6} fontSize="14" fontWeight="700" fill="#1A56DB" textAnchor="middle">
                      {fmtUSD(needAmount)}
                    </SvgText>

                    <Defs>
                      <ClipPath id="itemClip">
                        <Circle cx={itemX - 9} cy={cy} r={rNode} />
                      </ClipPath>
                    </Defs>
                    <Circle cx={itemX - 9} cy={cy} r={rNode + 2} stroke="#2E6CF6" strokeWidth={3} fill="#fff" />
                    {needItemImage ? (
                      <SvgImage
                        href={{ uri: needItemImage }}
                        x={itemX - rNode}
                        y={cy - rNode}
                        width={rNode * 2}
                        height={rNode * 2}
                        preserveAspectRatio="xMidYMid slice"
                        clipPath="url(#itemClip)"
                      />
                    ) : (
                      <SvgText x={itemX} y={cy + 5} fontSize="12" fontWeight="700" fill="#2E6CF6" textAnchor="middle">
                        Item
                      </SvgText>
                    )}

                    <Circle cx={rightX} cy={cy} r={rNode + 2} stroke="#2E6CF6" strokeWidth={3} fill="#fff" />
                    <SvgText x={rightX} y={cy + 5} fontSize="13" fontWeight="700" fill="#2E6CF6" textAnchor="middle">
                      {requesterName}
                    </SvgText>
                  </>
                );
              })()}
            </Svg>
          ) : (
            <FlatList
              data={mergedTx}
              keyExtractor={(item) => item._id}
              renderItem={renderTxCard}
              contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
              ListEmptyComponent={listEmpty}
            />
          )}

          <View style={styles.fabContainer}>
            <TouchableOpacity style={styles.fab} onPress={() => setMode('diagram')}>
              <Ionicons name="git-network-outline" size={22} color={mode === 'diagram' ? '#000' : '#666'} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.fab} onPress={() => setMode('list')}>
              <Ionicons name="list-outline" size={22} color={mode === 'list' ? '#000' : '#666'} />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        // ---------------- FUNDRAISER VIEW ----------------
        <>
          {mode === 'diagram' ? (
            <>
              <Svg width="100%" height="100%">
                <Line {...railLeft} stroke="black" strokeWidth={5} strokeLinecap="round" />
                <Line {...railLeft} stroke="#2E4EDB" strokeWidth={4} strokeLinecap="round" />
                <Line {...railRight} stroke="#374151" strokeWidth={5} strokeLinecap="round" />
                <Line {...railRight} stroke="#E5EAF2" strokeWidth={3} strokeLinecap="round" />
                <Line {...railDown} stroke="#000" strokeWidth={5} strokeLinecap="round" />
                <Line {...railDown} stroke="#FFF" strokeWidth={4} strokeLinecap="round" />

                {/* You node */}
                {youImage ? (
                  <>
                    <Defs>
                      <ClipPath id="youClip">
                        <Circle cx={youX} cy={topY} r={rTop} />
                      </ClipPath>
                    </Defs>
                    <Circle cx={youX} cy={topY} r={rTop} stroke="#000" strokeWidth={3} fill="white" />
                    <SvgImage
                      href={{ uri: youImage }}
                      x={youX - rTop}
                      y={topY - rTop}
                      width={rTop * 2}
                      height={rTop * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath="url(#youClip)"
                    />
                  </>
                ) : (
                  <Circle cx={youX} cy={topY} r={rTop} fill="#1E90FF" />
                )}

                {/* Others node */}
                <Circle cx={otherX} cy={topY} r={rTop} fill="#FFF" stroke="#2E6CF6" strokeWidth={3} />
                <SvgText x={otherX} y={topY + 5} fontSize="11" fontWeight="700" fill="#2E6CF6" textAnchor="middle">
                  Others
                </SvgText>

                {/* Escrow node */}
                <Defs>
                  <ClipPath id="escrowClip">
                    <Circle cx={orgX} cy={orgY} r={rMid - 2} />
                  </ClipPath>
                </Defs>
                <Circle cx={orgX} cy={orgY} r={rMid} stroke="#2979FF" strokeWidth={2} fill="white" />
                <SvgImage
                  href={{ uri: escrowLogo }}
                  x={orgX - (rMid - 2)}
                  y={orgY - (rMid - 2)}
                  width={(rMid - 2) * 2}
                  height={(rMid - 2) * 2}
                  preserveAspectRatio="xMidYMid meet"
                  clipPath="url(#escrowClip)"
                  onPress={() => setShowEscrowModal(true)}
                />

                {/* Recipient node */}
{/* Recipient node (with debug logs) */}
{(() => {
  console.log("🟢 [RecipientNode] Rendering recipient node...");
  console.log("📌 safeFundraiserImage =", safeFundraiserImage);
  console.log("📌 fundraiserImage (raw) =", fundraiserImage);

  if (safeFundraiserImage) {
    console.log("✅ Using recipient image:", safeFundraiserImage);

    return (
      <>
        <Defs>
          <ClipPath id="receiverClip">
            <Circle cx={endX} cy={endY} r={rEnd} />
          </ClipPath>
        </Defs>

        <Circle
          cx={endX}
          cy={endY}
          r={rEnd}
          stroke="#3A3A3C"
          strokeWidth={3}
          fill="white"
        />

        <SvgImage
          href={{ uri: safeFundraiserImage }}
          x={endX - rEnd}
          y={endY - rEnd}
          width={rEnd * 2}
          height={rEnd * 2}
          preserveAspectRatio="xMidYMid slice"
          clipPath="url(#receiverClip)"
          onLoad={() => console.log("🖼️ Recipient image loaded successfully")}
          onError={(err) => console.log("❌ ERROR loading recipient image:", err)}
        />
      </>
    );
  }

  console.log("⚠️ No image available — rendering green fallback node");
  return <Circle cx={endX} cy={endY} r={rEnd} fill="#50C878" />;
})()}
              </Svg>

              <GoldenSlider amount={youAmount} rail={railLeft} nodeRadius={rMid} />
              <GoldenSlider amount={otherAmount} rail={railRight} nodeRadius={rMid} />
              <GoldenSlider amount={downAmount} rail={railDown} nodeRadius={rEnd} />

              {showEscrowModal && (
                <View style={styles.commentBox}>
                  <View style={styles.commentArrow} />
                  <Text style={styles.commentTitle}>Escrow Summary</Text>
                  <Text style={{ fontWeight:'600' }}>Contributions: </Text> 
                  <Text> {fmtUSD(youAmount + otherAmount)}</Text>
                  <Text style={{ fontWeight:'600' }}>Total Disbursed: </Text> 
                  <Text> {fmtUSD(downAmount)}</Text>
                  <Text style={{ fontWeight:'600' }}>Needcoin Earned: </Text> 
                  <Text>  3x </Text>
                  <Text
                    style={styles.commentClose}
                    onPress={() => setShowEscrowModal(false)}
                  >
                    ✕ Close
                  </Text>
                </View>
              )}
            </>
          ) : (
            <FlatList
              data={mergedTx}
              keyExtractor={(item) => item._id}
              renderItem={renderTxCard}
              contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
              ListEmptyComponent={listEmpty}
            />
          )}

          <View style={styles.fabContainer}>
            <TouchableOpacity style={styles.fab} onPress={() => setMode('diagram')}>
              <Ionicons name="git-network-outline" size={22} color={mode === 'diagram' ? '#000' : '#666'} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.fab} onPress={() => setMode('list')}>
              <Ionicons name="list-outline" size={22} color={mode === 'list' ? '#000' : '#666'} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: '#FFF', borderColor: '#000', borderWidth: 2 },
  needTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 18, marginBottom: 8 },

  // --- Legacy txCard kept (not used by new list, retained to keep file intact) ---
  txCard: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  // --- Stylized list card (NEW) ---
  cardShadowWrap: {
    marginBottom: 14,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
    backgroundColor: 'transparent',
  },
  txCardNew: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    flexDirection: 'row',
  },
  cardAccent: {
    width: 6,
    marginRight: 12,
    borderRadius: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardNames: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  arrowMid: {
    color: '#64748B',
    fontWeight: '700',
  },
  cardAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1D4ED8',
    marginLeft: 10,
  },
  cardSubRow: {
    marginTop: 8,
    marginBottom: 4,
  },
  badge: {
    flexWrap: 'wrap',
  },
  badgeEmoji: {
    fontSize: 16,
  },
  badgeText: {
    fontSize: 15,
    color: '#059669',
    fontWeight: '700',
  },
  badgeTitle: {
    fontSize: 15,
    color: '#047857',
    fontWeight: '600',
  },
  cardMetaRow: {
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#9CA3AF',
  },

  // --- FABs & Modal styles kept exactly as-is ---
  fabContainer: {
    position: 'absolute',
    right: 16,
    bottom: 40,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  fab: {
    backgroundColor: '#EEE',
    padding: 12,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#000',
  },
  commentBox: {
    position: 'absolute',
    bottom: 220,
    left: 5,
    right: 250,
    minHeight: 10,
    minWidth: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1.5,
    borderColor: '#2E6CF6',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  commentArrow: {
    position: 'absolute',
    top: '50%',
    right: -20,
    transform: [{ translateY: -1 }],
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 25,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#2E6CF6',
  },
  commentTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4, color: '#1A56DB' },
  commentClose: {
    marginTop: 6,
    textAlign: 'right',
    color: '#2979FF',
    fontWeight: '800',
    fontSize: 13,
  },
});