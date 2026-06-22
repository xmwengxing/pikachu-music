import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { translations, type Lang, type I18nKey } from './translations';
import { useSettingsStore } from '../state/settingsStore';

type Dict = Record<string, string>;

const I18nContext = createContext<Dict>(translations.zh as unknown as Dict);

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSettingsStore((s) => s.language);
  const dict = useMemo<Dict>(
    () => (translations[lang] as unknown as Dict) ?? translations.zh,
    [lang],
  );
  return <I18nContext.Provider value={dict}>{children}</I18nContext.Provider>;
}

/** 获取翻译函数：t(key) => string */
export function useT(): (key: I18nKey) => string {
  const dict = useContext(I18nContext);
  return (key: I18nKey) => dict[key] ?? translations.zh[key] ?? key;
}

/** 兼容旧版 API：返回 { t, lang } */
export function useTranslation(): { t: (key: I18nKey) => string; lang: Lang } {
  const dict = useContext(I18nContext);
  const lang = useSettingsStore((s) => s.language);
  return {
    t: (key: I18nKey) => dict[key] ?? translations.zh[key] ?? key,
    lang,
  };
}