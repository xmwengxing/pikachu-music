import type { Track } from '../api/types';

// 把多源结果交错排列
export function getInterleavedSearchList(tracks: Track[]): Track[] {
  const grouped: Record<string, Track[]> = {
    migu: [], netease: [], qq: [], kuwo: [],
    bilibili: [], qianqian: [], soda: [], fivesing: [], jamendo: [], joox: [],
    gomusic: [],
  };
  tracks.forEach(t => {
    if (grouped[t.source]) grouped[t.source].push(t);
  });
  Object.keys(grouped).forEach(k => {
    grouped[k].sort((a, b) => (a.displayIndex || 0) - (b.displayIndex || 0));
  });
  const order = ['migu','netease','qq','kuwo','bilibili','qianqian','soda','fivesing','jamendo','joox','gomusic'];
  const idx: Record<string, number> = {};
  order.forEach(o => idx[o] = 0);
  const out: Track[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const s of order) {
      const arr = grouped[s];
      const i = idx[s];
      if (arr && i < arr.length) {
        out.push(arr[i]);
        idx[s]++;
        added = true;
      }
    }
  }
  return out;
}
