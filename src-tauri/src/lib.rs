//! NanoStat - 硬件监控应用
//! 
//! 类似游戏++的硬件监控工具，提供：
//! - 硬件概览信息展示
//! - 游戏内实时监控面板
//! - 可自定义的监控设置

pub mod hardware;

use hardware::types::{HardwareOverview, RealtimeStats, MonitorSettings};
use std::sync::Mutex;
use std::fs;
use std::path::PathBuf;
use once_cell::sync::Lazy;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// 获取配置文件路径
fn get_config_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("NanoStat");
    
    // 确保目录存在
    fs::create_dir_all(&config_dir).ok();
    
    config_dir.join("settings.json")
}

/// 从文件加载设置
fn load_settings_from_file() -> MonitorSettings {
    let path = get_config_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            match serde_json::from_str::<MonitorSettings>(&content) {
                Ok(settings) => return settings,
                Err(_) => {
                    // 文件损坏：备份原文件再回退默认，避免下次保存覆盖丢失用户配置
                    let bak = path.with_extension("json.bak");
                    let _ = fs::copy(&path, &bak);
                }
            }
        }
    }
    MonitorSettings::default()
}

/// 保存设置到文件
fn save_settings_to_file(settings: &MonitorSettings) -> Result<(), String> {
    let path = get_config_path();
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;
    Ok(())
}

/// 全局监控设置
pub static MONITOR_SETTINGS: Lazy<Mutex<MonitorSettings>> = Lazy::new(|| {
    Mutex::new(load_settings_from_file())
});

/// 悬浮窗口标签
const OVERLAY_WINDOW_LABEL: &str = "overlay";

/// 获取硬件概览信息
/// 
/// 返回完整的系统硬件信息，包括 CPU、GPU、内存、磁盘和网络
#[tauri::command]
fn get_hardware_overview() -> HardwareOverview {
    hardware::get_hardware_overview()
}

/// 获取实时监控数据
/// 
/// 返回用于游戏内监控面板的实时数据
#[tauri::command]
fn get_realtime_stats() -> RealtimeStats {
    hardware::get_realtime_stats()
}

/// 检查 LHM 温度采集所需的 PawnIO 驱动是否缺失（供 UI 提示引导安装）
#[tauri::command]
fn is_lhm_driver_missing() -> bool {
    hardware::lhm::is_driver_missing()
}

/// 判断是否为便携版（exe 同目录存在 portable.txt 标记文件）
/// 便携版不进行自动检查更新，也不内置安装器更新
#[tauri::command]
fn is_portable() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|dir| dir.join("portable.txt")))
        .map(|flag| flag.exists())
        .unwrap_or(false)
}

/// 获取当前监控设置
#[tauri::command]
fn get_monitor_settings() -> MonitorSettings {
    MONITOR_SETTINGS.lock().unwrap().clone()
}

/// 更新监控设置
#[tauri::command]
async fn update_monitor_settings(
    app: tauri::AppHandle,
    settings: MonitorSettings,
) -> Result<(), String> {
    let mut current = MONITOR_SETTINGS.lock()
        .map_err(|e| format!("Failed to lock settings: {}", e))?;
    *current = settings.clone();
    
    // 保存到文件
    save_settings_to_file(&settings)?;
    
    // 通知悬浮窗口设置已变更（前端监听后更新显示）
    drop(current);
    use tauri::Emitter;
    let _ = app.emit("settings-changed", &settings);
    
    Ok(())
}

/// 显示游戏内监控悬浮窗口
#[tauri::command]
async fn show_overlay_window(app: tauri::AppHandle) -> Result<(), String> {
    // 如果窗口已存在，直接显示（位置由前端 CSS 依据 settings.position 吸附到屏幕边缘）
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // 悬浮窗为整屏透明层：面板位置由前端 CSS 吸附定位，鼠标完全穿透
    let monitor = app
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No primary monitor found")?;
    let screen_size = monitor.size();
    let scale_factor = monitor.scale_factor();
    let width = screen_size.width as f64 / scale_factor;
    let height = screen_size.height as f64 / scale_factor;

    let window = WebviewWindowBuilder::new(
        &app,
        OVERLAY_WINDOW_LABEL,
        WebviewUrl::App("overlay.html".into()),
    )
    .title("NanoStat Monitor")
    .inner_size(width, height)
    .position(0.0, 0.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    // 关键：无边框窗口默认阴影会让 tao 把窗口外扩一圈隐形边距、内容内缩，
    // 导致面板内容不贴屏幕边缘（透明窗口阴影本身不可见，肉眼只见“留缝”）
    .shadow(false)
    .build()
    .map_err(|e| e.to_string())?;

    // 整层鼠标穿透，游戏操作不受影响
    window.set_ignore_cursor_events(true).ok();

    Ok(())
}

/// 隐藏游戏内监控悬浮窗口
#[tauri::command]
async fn hide_overlay_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// 应用入口：构建 Tauri 应用（窗口/托盘/命令注册/启动采集），并处理退出清理
pub fn run() {


    let built_app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_hardware_overview,
            get_realtime_stats,
            is_lhm_driver_missing,
            is_portable,
            get_monitor_settings,
            update_monitor_settings,
            show_overlay_window,
            hide_overlay_window,
        ])
        .setup(|app| {
            // 启动页切换：前端就绪后关闭 splash、显示主窗口（带 8s 超时兜底）
            {
                use tauri::Listener;
                if let (Some(main), Some(splash)) = (
                    app.get_webview_window("main"),
                    app.get_webview_window("splash"),
                ) {
                    let main_clone = main.clone();
                    let splash_clone = splash.clone();
                    app.listen("main-ready", move |_| {
                        let _ = splash_clone.close();
                        let _ = main_clone.show();
                        let _ = main_clone.set_focus();
                    });
                    // 兜底：8 秒后仍未收到就绪事件也切换（防止 splash 卡死）
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(8));
                        let _ = splash.close();
                        let _ = main.show();
                    });
                }
            }

            // 启动 LHM 温度采集桥接进程（懒加载；驱动可选，未安装时自动回退 WMI）
            hardware::lhm::ensure_bridge(app.handle());
            // 启动 ETW FPS 监听（无注入；需要管理员权限）
            hardware::fps::ensure_fps_monitor();
            
            // 创建系统托盘
            use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState};
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            
            // 创建菜单项
            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            
            // 创建菜单
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;
            
            // 创建托盘图标
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button, button_state, .. } = event {
                        if button == MouseButton::Left && button_state == MouseButtonState::Up {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;
            
            // 如果设置中启用了游戏内监控，自动显示悬浮窗口
            let settings = MONITOR_SETTINGS.lock().unwrap().clone();
            if settings.enabled {
                let app_handle = app.handle().clone();
                // 延迟一点启动，确保主窗口已经准备好
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    tauri::async_runtime::block_on(async {
                        let _ = show_overlay_window(app_handle).await;
                    });
                });
            }
            
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // 退出清理：停掉 PresentMon 子进程与残留 ETW 实时会话
    // （实时会话在进程被强杀后会残留，堆积会拖慢系统）
    built_app.run(|_app, event| {
        if let tauri::RunEvent::Exit = event {
            hardware::fps::stop_all_trace_sessions();
        }
    });
}
