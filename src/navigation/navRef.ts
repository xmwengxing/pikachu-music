/**
 * navRef — 用于在普通组件（非屏幕）里跳转 Tab
 * React Navigation 7 用 createNavigationContainerRef
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootTabParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootTabParamList>();

export function navigateToPlayer() {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Player' as never);
  }
}

export function navigateToSearch() {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Search' as never);
  }
}

export function navigateToPlaylist() {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Playlist' as never);
  }
}