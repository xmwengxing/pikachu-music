// 13 平台元信息（12 个真实源 + 1 个聚合元）
// id       = 前端内部 source 标识
// platform = gomusic 后端 sources 参数值
// label    = 显示名
export type PlatformId =
  | 'migu' | 'netease' | 'qq' | 'kuwo' | 'kugou'
  | 'bilibili' | 'qianqian' | 'soda' | 'fivesing'
  | 'jamendo' | 'joox' | 'gomusic' | 'qq_wx';

export interface PlatformInfo {
  id: PlatformId;
  gomusicId: string;  // gomusic sources= 参数值
  label: string;
  primary?: boolean;
  multi?: boolean;    // 聚合源（多源并发）
  /** 是否仅用于扫码登录（不能作为普通搜索/播放源） */
  loginOnly?: boolean;
  /** 扫码成功后 cookie 实际写入的目标 source id（gomusic 后端约定） */
  cookieTarget?: PlatformId;
  needsCookie?: boolean;
  hidden?: boolean;
  color: string;
}

export const PLATFORMS: PlatformInfo[] = [
  // 主平台（6 个）：咪咕 / 网易云 / QQ / 酷狗 / 酷我（老 API）+ 聚合（gomusic）
  { id: 'migu',     gomusicId: 'migu',     label: '咪咕',     primary: true, color: '#ffb74d' },
  { id: 'netease',  gomusicId: 'netease',  label: '网易云',   primary: true, color: '#ff6b6b' },
  { id: 'qq',       gomusicId: 'qq',       label: 'QQ音乐',   primary: true, color: '#4dd0e1' },
  { id: 'kugou',    gomusicId: 'kugou',    label: '酷狗',     primary: true, color: '#FF6B27' },
  { id: 'kuwo',     gomusicId: '',         label: '酷我',     primary: true, color: '#ba68c8' },  // 走老 cenguigui API
  { id: 'gomusic',  gomusicId: '',         label: '聚合',     primary: true, multi: true, color: '#FFD93D' },
  // 高级平台
  { id: 'bilibili', gomusicId: 'bilibili', label: 'B站',       color: '#fb7299' },
  { id: 'qianqian', gomusicId: 'qianqian', label: '千千音乐',  color: '#ff8a65' },
  { id: 'soda',     gomusicId: 'soda',     label: '汽水音乐',  color: '#aed581', needsCookie: true },
  { id: 'fivesing', gomusicId: 'fivesing', label: '5sing',     color: '#ffd54f' },
  { id: 'jamendo',  gomusicId: 'jamendo',  label: 'Jamendo',   color: '#90caf9' },
  { id: 'joox',     gomusicId: 'joox',     label: 'JOOX',      color: '#ce93d8' },
  // 登录专用：QQ 音乐微信扫码（gomusic 后端约定扫码后 cookie 写入 'qq' 字段）
  { id: 'qq_wx',    gomusicId: 'qq_wx',    label: 'QQ音乐微信扫码', loginOnly: true, cookieTarget: 'qq', color: '#07C160' },
];

export const PLATFORM_BY_ID: Record<string, PlatformInfo> =
  PLATFORMS.reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as Record<string, PlatformInfo>);

export function platformColor(id: string): string {
  return PLATFORM_BY_ID[id]?.color ?? '#888';
}

export function sourceKey(trackSource: string): string {
  // 把前端 source id 翻译成 i18n key
  // 'qq' → 'sourceQQ', 'kugou' → 'sourceKugou'
  return 'source' + trackSource
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}
