import React from 'react';
import { Text, View } from 'react-native';

export default function SitemapScreen() {
  return (
    <View
      testID="sitemap-screen"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: '#1a1a2e',
      }}
    >
      <Text
        style={{
          color: '#ffffff',
          fontSize: 20,
          fontWeight: '600',
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        Sitemap is disabled in this build.
      </Text>
      <Text
        style={{
          color: '#d1d5db',
          fontSize: 15,
          lineHeight: 22,
          textAlign: 'center',
        }}
      >
        The default Expo Router sitemap route depends on browser location APIs.
        This placeholder prevents native and server-rendered builds from
        crashing when `/_sitemap` is loaded.
      </Text>
    </View>
  );
}
