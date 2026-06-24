use std::fs::File;
use std::io::{Read, Write};

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// 持有 sidecar 子进程的句柄，应用关闭时由 on_window_event 杀掉。
struct SidecarState {
    child: tokio::sync::Mutex<Option<CommandChild>>,
}

/// 启动 go-music-api sidecar，把 stdout/stderr 转发为前端事件。
/// 所有平台：桌面用 x86_64 二进制，Android 用 ARM 二进制（在 binaries/ 目录都备齐了）。
#[tauri::command]
async fn start_sidecar(app: AppHandle) -> Result<(), String> {
    // externalBin = ["binaries/go-music-api"]  →  Rust API 用文件名（不带前缀，不带三元后缀）
    let cmd = app
        .shell()
        .sidecar("go-music-api")
        .map_err(|e| format!("sidecar lookup failed: {e}"))?
        .args(["--port", "8080"]);

    let (mut rx, child) = cmd.spawn().map_err(|e| format!("sidecar spawn failed: {e}"))?;

    // 保存 child 句柄
    *app.state::<SidecarState>().child.lock().await = Some(child);

    // 把 stdout/stderr/退出事件转发给前端（用于调试/健康检查）
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).into_owned();
                    let _ = app.emit("sidecar://stdout", line);
                }
                CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).into_owned();
                    let _ = app.emit("sidecar://stderr", line);
                }
                CommandEvent::Terminated(payload) => {
                    let _ = app.emit("sidecar://exit", payload);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// 主动 kill sidecar（前端可选调用；窗口关闭事件会自动触发）
#[tauri::command]
async fn stop_sidecar(app: AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<SidecarState>() {
        if let Some(child) = state.child.lock().await.take() {
            child.kill().map_err(|e| format!("kill failed: {e}"))?;
        }
    }
    Ok(())
}

/// Phase B：从远端 URL 拉音频流写到用户选的目标路径。
/// tauri-plugin-dialog 已经把目标路径给前端了，前端 invoke 这个 command 把活儿交给 Rust 干。
/// 8 KB 缓冲流式写，音频文件通常 < 50 MB，几秒搞定。
/// 返回写入字节数，前端拿来显示"已保存 N MB"之类的提示。
#[tauri::command]
async fn download_track_to_path(url: String, dest_path: String) -> Result<u64, String> {
    // 同步 HTTP 客户端（ureq）—— 简单稳定，足以应付几十 MB 的音频流。
    // 后面要支持 resume / 进度回调再换 reqwest。
    let response = ureq::get(&url)
        .call()
        .map_err(|e| format!("fetch failed: {e}"))?;

    let mut file = File::create(&dest_path).map_err(|e| format!("create file failed: {e}"))?;

    let mut reader = response.into_reader();
    let mut buf = [0u8; 8192];
    let mut total: u64 = 0;
    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("read failed: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("write failed: {e}"))?;
        total += n as u64;
    }
    file.flush().map_err(|e| format!("flush failed: {e}"))?;

    Ok(total)
}

/// 入口
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // 文件保存 dialog：替代 web 端硬降级 stub，让"💾 保存"按钮在桌面壳里有真行为
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState {
            child: tokio::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_sidecar,
            stop_sidecar,
            download_track_to_path
        ])
        .setup(|app| {
            // 应用一启动就拉起 sidecar（桌面 x86_64 / Android ARM64 二进制都打包了）
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                if let Err(e) = start_sidecar(handle).await {
                    eprintln!("[pikachu-music] failed to start sidecar: {e}");
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // 窗口关闭时杀掉 sidecar，避免 8080 端口残留
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                tauri::async_runtime::block_on(async move {
                    let _ = stop_sidecar(app).await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
