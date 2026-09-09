import React from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';

export default function NeedsVideoPlayer({ uri, style, contentFit = 'cover', nativeControls = true }) {
  const player = useVideoPlayer(uri || null, () => {});
  return <VideoView player={player} style={style} nativeControls={nativeControls} contentFit={contentFit} />;
}
