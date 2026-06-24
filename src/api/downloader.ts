// downloader 索引：Metro 在编译时会根据目标平台自动选 downloader.web.ts 或 downloader.native.ts。
// TypeScript 不识别 .web / .native 后缀，所以这里显式 re-export 给 tsc 用。
// tsc 用 web 变体做类型检查（API 形状与 native 一致），不影响 Metro 的运行时行为。
export * from './downloader.web';
