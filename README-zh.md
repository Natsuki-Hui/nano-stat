# NanoStat

<p align="center">
  <img src="./public/assets/show.png" alt="NanoStat 截图" width="720">
</p>

<p align="center">
  <a href="https://github.com/Natsuki-Hui/nano-stat/releases"><img src="https://img.shields.io/badge/version-1.3.0-blue.svg" alt="版本"></a>
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/Rust-2021-000000?logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=0B1B2B" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/TailwindCSS-4-38BDF8?logo=tailwindcss&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT">
</p>

<p align="center">
  <a href="README.md">English</a> | <b>简体中文</b>
</p>

一款轻量、现代的 Windows 桌面硬件监控工具 —— 实时硬件信息展示与游戏内悬浮监控面板（类似游戏++ 的监控体验）。

> **本项目基于 [Chunyu33/nano-stat](https://github.com/Chunyu33/nano-stat) v1.1.0 二次开发**。
> 与原版相比的完整改动说明见 [CHANGES-FROM-UPSTREAM.md](./CHANGES-FROM-UPSTREAM.md)，

## 功能特性

### 硬件概览（主窗口）

- **卡片化展示** — CPU / GPU / 内存 / 磁盘 / 网络 / 显示器信息，带实时使用率图表
- **CPU 实际睿频频率** — PDH `% Processor Performance` 计数器 × 基频，随睿频实时波动
  （修复原版恒定显示 WMI 静态基频的问题）
- **GPU 完整遥测** — NVIDIA 走 NVML（占用/温度/频率/功耗/显存/驱动）；AMD / Intel 走 WMI
- **CPU / 主板温度** — 可选安装 PawnIO 内核驱动（管理员运行）后经 LibreHardwareMonitor
  桥接读取 MSR 级温度；未安装时回退 WMI 热区（部分主板可用），卡片内显示安装引导
- **排除虚拟网卡** — 网络速率过滤 Hyper-V vEthernet / 回环 / TAP 等虚拟接口，
  修复镜像流量导致的速率虚高翻倍

### 游戏内悬浮监控（OSD）—— 本 fork 的核心增强

- **16 个独立显示项** — FPS、1%Low、CPU/GPU 的占用/温度/频率/功耗、
  内存占用/容量、显存占用/容量、网络速率、磁盘读写，每项可**单独开关 + 拖拽排序**；
  相邻同硬件项自动合并为一个显示块（块首显示硬件名）
- **负载变色** — 占用率按负载动态变色：<60% 绿 / 60~85% 黄 / ≥85% 红（内存/显存同规则）
- **智能 FPS 栏** — ETW 无注入采集（反作弊安全），按前台窗口进程统计；
  每帧记录事件自带 QPC 时间戳，FPS 由帧时间差分计算（修复批量投递导致的数值失真）；
  前台进程无帧时回退桌面整体帧率
- **1% Low 帧率** — 帧时间 99 百分位换算（与 PresentMon 口径一致），空闲间隙不计入
- **CPU 实际频率（OSD）** — PDH 实时频率随睿频波动，不显示恒定基频
- **内置字体** — Noto Sans SC 字形子集（SIL OFL 1.1 免费商用，~35KB），
  中英文同字体渲染、行盒等高，OSD 不再高低参差
- **等宽数字** — 数值刷新时宽度不变，整条不左右抖动
- **设置页实时预览** — 预览与 OSD 共用同一渲染组件（MonitorBar），所见即所得
- **8 个屏幕位置** — 四边中间 + 四角，透明度/字号可调（仅背景透明，文字始终清晰）
- **体验细节** — 自定义标题栏、可收缩侧边栏、深色主题、系统托盘

## 与原版（v1.1.0）的主要差异

| 领域 | 原版 | 本版 |
|---|---|---|
| OSD 显示项 | 5 个固定项 | 16 个独立细项，开关 + 拖拽排序，同族自动合并 |
| FPS 采集 | 事件到达速率（批量投递下失真） | 事件 QPC 时间戳差分（精确） |
| 1% Low | 无 | 帧时间 99 百分位（PresentMon 口径） |
| CPU 频率 | WMI 静态基频（恒定 2304MHz） | PDH 实时睿频频率 |
| 占用率显示 | 单一颜色 | 负载变色（绿/黄/红） |
| 内存/显存 | 单一项 | 占用 % 与容量拆分，独立开关 |
| OSD 字体 | 系统字体混排（中英文高低参差） | 内置 Noto Sans SC 子集，全等高 |
| 磁盘速率 | 无 | PDH 计数器，紧凑格式 |
| 网络速率 | 含虚拟接口（镜像流量致虚高） | 过滤 Hyper-V/回环/TAP 虚拟接口 |
| 健壮性 | 进程强杀后 ETW 会话/子进程残留堆积 | 退出清理 + bridge 崩溃自愈 + 句柄继承精确控制 |
| 设置文件 | 损坏即静默丢失配置 | 损坏先备份 `.bak` 再回退默认 |

## 快速开始

环境要求：Windows 10/11、Node.js 18+、Rust 1.70+、.NET SDK 8（编译 lhm-bridge 温度采集桥，NativeAOT）。

```bash
# 安装依赖
npm install

# 开发模式（Tauri）
npm run tauri dev

# 构建发布版本
npm run tauri build
```

> 如需完整的 NVIDIA 遥测数据，请安装官方显卡驱动（保证 NVML 可用）。
> 应用需以**管理员权限**运行，ETW 帧率采集与完整温度传感才可用。

## 技术栈

- **前端**：React 19、TypeScript、TailwindCSS、Radix UI、Recharts
- **桌面框架**：Tauri 2
- **后端**：Rust —— sysinfo、systemstat、nvml-wrapper、wmi、windows（PDH/ETW/进程管理）

## 文档

- [English README](./README.md)

## 贡献

欢迎提交 Bug 反馈、功能建议和 PR。建议先开 Issue 讨论方向，再提交 PR。

## 许可证

[MIT](./LICENSE)
