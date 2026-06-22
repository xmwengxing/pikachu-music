/**
 * RootNavigator — 底部 3 Tab：搜索 / 播放 / 歌单
 */
import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from '../i18n/I18nProvider';
import { colors, fontSize } from '../theme';
import SearchScreen from '../screens/SearchScreen';
import PlayerScreen from '../screens/PlayerScreen';
import PlaylistScreen from '../screens/PlaylistScreen';

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{
      fontSize: 20,
      color: focused ? colors.accent : colors.textMuted,
    }}>
      {label}
    </Text>
  );
}

export default function RootNavigator() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarLabel: t('tabSearch'),
          tabBarIcon: ({ focused }) => <TabIcon label="🔍" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Player"
        component={PlayerScreen}
        options={{
          tabBarLabel: t('tabPlayer'),
          tabBarIcon: ({ focused }) => <TabIcon label="🎵" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Playlist"
        component={PlaylistScreen}
        options={{
          tabBarLabel: t('tabPlaylist'),
          tabBarIcon: ({ focused }) => <TabIcon label="📋" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}