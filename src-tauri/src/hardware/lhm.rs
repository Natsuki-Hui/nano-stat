//! LHM (LibreHardwareMonitor) 桥接模块
//! 
//! 管理 lhm-bridge 子进程的生命周期：
//! - 懒启动：首次需要 CPU 温度时才拉起 bridge 子进程
//! - bridge 持续输出 JSON Lines 温度流（每 1 秒一行），本模块后台线程解析缓存
//! - 若 PawnIO 驱动未安装，bridge 输出错误标记退出，本模块标记 driver_missing，
//!   上层回退到 WMI / N/A
//! 
//! 协议（JSON Lines over stdout）：
//!   {"cpu_temp":55.2,"gpu_temp":63.4,"mb_temp":42.0,"timestamp":1723000000000}
//!   错误: {"error":"PAWNIO_NOT_INSTALLED"}  + exit code 2

use std::io::{BufRead, BufReader};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::io::FromRawHandle;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use once_cell::sync::Lazy;
use serde::Deserialize;
use tauri::Manager;
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{
    CloseHandle, SetHandleInformation, HANDLE, HANDLE_FLAG_INHERIT, HANDLE_FLAGS,
};
use windows::Win32::Security::SECURITY_ATTRIBUTES;
use windows::Win32::System::Pipes::CreatePipe;
use windows::Win32::System::Threading::{
    CreateProcessW, CREATE_NO_WINDOW, PROCESS_CREATION_FLAGS, PROCESS_INFORMATION,
    STARTF_USESTDHANDLES, STARTUPINFOW,
};

/// bridge 输出的温度/功耗快照（与 C# 端字段对应）
#[derive(Debug, Clone, Deserialize)]
struct TempSnapshot {
    #[serde(default)]
    cpu_temp: Option<f32>,
    #[serde(default)]
    gpu_temp: Option<f32>,
    #[serde(default)]
    mb_temp: Option<f32>,
    #[serde(default)]
    cpu_power: Option<f32>,
    #[serde(default)]
    error: Option<String>,
}

/// LHM 桥接状态
struct LhmState {
    /// 子进程句柄（0 = 未启动/已退出；实际为 HANDLE）
    h_process: isize,
    /// bridge stdin 写端句柄（保持打开；关闭后 bridge 读到 EOF 自行退出）
    h_stdin_write: isize,
    /// 最近一次温度快照
    snapshot: Option<TempSnapshot>,
    /// 快照时间（用于新鲜度检查）
    last_update: Instant,
    /// PawnIO 驱动是否未安装（决定上层是否回退 WMI）
    driver_missing: bool,
    /// 缓存的 bridge 可执行文件路径（运行期自动重启用）
    bridge_path: Option<PathBuf>,
    /// 上次启动时刻（防重启风暴：bridge 崩溃循环时 5 秒内不重复拉起）
    last_start: Option<Instant>,
}

impl LhmState {
    fn new() -> Self {
        LhmState {
            h_process: 0,
            h_stdin_write: 0,
            snapshot: None,
            last_update: Instant::now() - Duration::from_secs(60),
            driver_missing: false,
            bridge_path: None,
            last_start: None,
        }
    }
}

static LHM_STATE: Lazy<Mutex<LhmState>> = Lazy::new(|| Mutex::new(LhmState::new()));

/// 找到 bridge 可执行文件路径（优先打包后的 resources，其次开发目录）
fn find_bridge_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    // 打包后：resources 保留相对结构（lhm-bridge/bin/.../lhm-bridge.exe）或扁平放置
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [
            resource_dir.join("lhm-bridge/bin/Release/net8.0/win-x64/publish/lhm-bridge.exe"),
            resource_dir.join("lhm-bridge.exe"),
        ];
        for path in candidates {
            if path.exists() {
                return Some(path);
            }
        }
    }

    // 开发时：项目内 publish 产物
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("lhm-bridge/bin/Release/net8.0/win-x64/publish/lhm-bridge.exe");
    if dev.exists() {
        return Some(dev);
    }

    None
}



/// 启动 bridge 子进程（应用启动时调用一次；此后由 ensure_alive 在运行期自动重启崩溃的 bridge）
pub fn ensure_bridge(app: &tauri::AppHandle) {
    // 锁内只做状态判断与记录；spawn 必须在锁外执行
    // （spawn_bridge 内部会再次加锁；Mutex 不可重入，持锁调用会死锁主线程）
    let start_path = {
        let mut state = LHM_STATE.lock().unwrap();

        // 已在运行：无需重启
        if state.h_process != 0 {
            return;
        }
        // 防重启风暴：bridge 启动后 5 秒内不重复拉起（崩溃循环保护）
        if state
            .last_start
            .map(|t| t.elapsed() < Duration::from_secs(5))
            .unwrap_or(false)
        {
            return;
        }

        let Some(path) = find_bridge_path(app) else {
            // bridge 未打包，标记不可用（上层回退 WMI）
            return;
        };
        state.bridge_path = Some(path.clone());
        state.last_start = Some(Instant::now());
        Some(path)
    };

    if let Some(path) = start_path {
        spawn_bridge(path);
    }
}

/// PawnIO 驱动是否未安装（供 UI 提示用）
pub fn is_driver_missing() -> bool {
    LHM_STATE.lock().unwrap().driver_missing
}

/// 运行期自愈：bridge 崩溃退出后，用缓存路径自动重启（由 get_realtime_stats 每秒调用）
pub fn ensure_alive() {
    let Ok(mut st) = LHM_STATE.lock() else { return };
    if st.h_process != 0 || st.bridge_path.is_none() {
        return;
    }
    // 防重启风暴：5 秒内不重复拉起
    if st
        .last_start
        .map(|t| t.elapsed() < Duration::from_secs(5))
        .unwrap_or(false)
    {
        return;
    }
    st.last_start = Some(Instant::now());
    let path = st.bridge_path.clone().unwrap();
    std::mem::drop(st);
    spawn_bridge(path);
}

/// 启动 bridge 子进程并启动解析线程（ensure_bridge / ensure_alive 共用）。
///
/// 安全说明：程序路径由「主程序自身目录/资源目录解析」得到并单独传参，
/// 命令行不含任何动态拼接的用户输入，不经 shell，无注入面。
fn spawn_bridge(path: PathBuf) {
    // stdin 管道：父进程持有写端保持打开（bridge 读 stdin，父进程退出关闭后 EOF 自退）
    unsafe {
        let mut stdout_r = HANDLE::default();
        let mut stdout_w = HANDLE::default();
        let mut stdin_r = HANDLE::default();
        let mut stdin_w = HANDLE::default();

        if CreatePipe(
            &mut stdout_r,
            &mut stdout_w,
            Some(&SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: std::ptr::null_mut(),
                bInheritHandle: true.into(),
            }),
            0,
        )
        .is_err()
        {
            return;
        }
        if CreatePipe(
            &mut stdin_r,
            &mut stdin_w,
            Some(&SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: std::ptr::null_mut(),
                bInheritHandle: true.into(),
            }),
            0,
        )
        .is_err()
        {
            let _ = CloseHandle(stdout_r);
            let _ = CloseHandle(stdout_w);
            return;
        }
        // 句柄继承精确控制：只让子进程继承它需要的端（stdin 读端 + stdout 写端）。
        // 否则子进程会继承 stdin 写端副本——父进程退出关闭句柄后，
        // 子进程仍持有写端副本，stdin EOF 永不到来，bridge 进程变成孤儿永不退出
        let _ = SetHandleInformation(stdout_r, HANDLE_FLAG_INHERIT.0, HANDLE_FLAGS(0));
        let _ = SetHandleInformation(stdout_w, HANDLE_FLAG_INHERIT.0, HANDLE_FLAG_INHERIT);
        let _ = SetHandleInformation(stdin_r, HANDLE_FLAG_INHERIT.0, HANDLE_FLAG_INHERIT);
        let _ = SetHandleInformation(stdin_w, HANDLE_FLAG_INHERIT.0, HANDLE_FLAGS(0));

        let exe_w: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        let cmd_const: &std::ffi::OsStr = std::ffi::OsStr::new("lhm-bridge");
        let mut cmd_w: Vec<u16> = cmd_const
            .encode_wide()
            .chain(Some(0))
            .collect();

        let mut si = STARTUPINFOW::default();
        si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        si.dwFlags = STARTF_USESTDHANDLES;
        si.hStdInput = stdin_r;
        si.hStdOutput = stdout_w;
        si.hStdError = stdout_w;

        let mut pi = PROCESS_INFORMATION::default();
        if CreateProcessW(
            PCWSTR(exe_w.as_ptr()),
            Some(PWSTR(cmd_w.as_mut_ptr())),
            None,
            None,
            true,
            PROCESS_CREATION_FLAGS(CREATE_NO_WINDOW.0),
            None,
            PCWSTR::null(),
            &si,
            &mut pi,
        )
        .is_err()
        {
            let _ = CloseHandle(stdout_r);
            let _ = CloseHandle(stdout_w);
            let _ = CloseHandle(stdin_r);
            let _ = CloseHandle(stdin_w);
            return;
        }
        // 子进程持有继承副本；父进程关闭 stdout 写端（避免读端 EOF 永不到来），
        // 保留 stdin 写端打开以保活 bridge
        let _ = CloseHandle(stdout_w);
        let _ = CloseHandle(stdin_r);
        let _ = CloseHandle(pi.hThread);

        let file = std::fs::File::from_raw_handle(stdout_r.0 as *mut _);
        if let Ok(mut st) = LHM_STATE.lock() {
            st.h_process = pi.hProcess.0 as isize;
            st.h_stdin_write = stdin_w.0 as isize;
        }

        // 后台线程持续读取并解析 JSON Lines
        std::thread::spawn(move || {
            let reader = BufReader::new(file);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let Ok(snap) = serde_json::from_str::<TempSnapshot>(trimmed) else {
                    continue;
                };
                if snap.error.as_deref() == Some("PAWNIO_NOT_INSTALLED") {
                    if let Ok(mut state) = LHM_STATE.lock() {
                        state.driver_missing = true;
                        state.snapshot = None;
                    }
                    continue;
                }
                if let Ok(mut state) = LHM_STATE.lock() {
                    state.snapshot = Some(snap);
                    state.last_update = Instant::now();
                }
            }
            // stdout 关闭 = bridge 退出（由 ensure_alive 下次轮询时自动重启）
            if let Ok(mut state) = LHM_STATE.lock() {
                state.h_process = 0;
            }
        });
    }
}

/// 获取 CPU 温度/// 获取 CPU 温度（来自 LHM），数据超过 3 秒视为过期返回 None
pub fn get_cpu_temp() -> Option<f32> {
    let state = LHM_STATE.lock().unwrap();
    if state.driver_missing || state.h_process == 0 {
        return None;
    }
    if state.last_update.elapsed() > Duration::from_secs(3) {
        return None;
    }
    state.snapshot.as_ref()?.cpu_temp
}

/// 获取 GPU 温度（来自 LHM，NVML 不可用时的补充数据源）
pub fn get_gpu_temp() -> Option<f32> {
    let state = LHM_STATE.lock().unwrap();
    if state.driver_missing || state.h_process == 0 {
        return None;
    }
    if state.last_update.elapsed() > Duration::from_secs(3) {
        return None;
    }
    state.snapshot.as_ref()?.gpu_temp
}

/// 获取主板温度（预留能力，供后续 UI 扩展展示）
#[allow(dead_code)]
/// 读取主板温度传感器（LHM Motherboard 温度，取最高值）
pub fn get_mb_temp() -> Option<f32> {
    let state = LHM_STATE.lock().unwrap();
    if state.driver_missing || state.h_process == 0 {
        return None;
    }
    if state.last_update.elapsed() > Duration::from_secs(3) {
        return None;
    }
    state.snapshot.as_ref()?.mb_temp
}

/// 获取 CPU 封装功耗（W，来自 LHM Package Power 传感器）
pub fn get_cpu_power() -> Option<f32> {
    let state = LHM_STATE.lock().unwrap();
    if state.driver_missing || state.h_process == 0 {
        return None;
    }
    if state.last_update.elapsed() > Duration::from_secs(3) {
        return None;
    }
    state.snapshot.as_ref()?.cpu_power
}
