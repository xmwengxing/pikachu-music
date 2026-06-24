// @ts-nocheck — async bootstrap intentionally uses dynamic import
/**
 * 入口
 *
 * 关键：必须在 import App 之前把 global.CanvasKit 设上。
 * 原因：@shopify/react-native-skia 2.6.2 的 web 版在模块顶层执行
 *   `export const Skia = JsiSkApi(global.CanvasKit)`
 * 模块加载完成后 `Skia` 单例就固定了，运行时再 await LoadSkiaWeb 救不回来。
 * 所以这里先 await CanvasKitInit（设上 global.CanvasKit），再 dynamic import App。
 *
 * 流程：
 *   1. 同步 import expo / canvaskit-wasm
 *   2. async  await CanvasKitInit，set global.CanvasKit
 *   3. dynamic import App（此时 skia 模块的顶层求值拿到的是设好的 CanvasKit）
 *   4. registerRootComponent(App)
 */
import { registerRootComponent } from 'expo';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

async function bootstrap() {
  try {
    const CanvasKit = await CanvasKitInit({
      // 指向 public/canvaskit.wasm（Expo dev server / prod build 都从 / 静态服务）
      locateFile: () => '/canvaskit.wasm',
    });
    // canvaskit 暴露在 global 上，skia web 实现会从这里读
    (globalThis as any).CanvasKit = CanvasKit;
    console.info('[index] CanvasKit ready, version:', CanvasKit?.version?.() ?? 'unknown');
  } catch (e) {
    console.warn('[index] CanvasKit init failed', e);
  }

  const { default: App } = await import('./App');
  registerRootComponent(App);
}

bootstrap();
