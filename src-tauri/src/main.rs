// 防止 Windows 调试时弹出控制台
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pikachu_music_lib::run()
}