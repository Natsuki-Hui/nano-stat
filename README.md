# NanoStat

<p align="center">
  <img src="./public/assets/show.png" alt="NanoStat Screenshot" width="720">
</p>

<p align="center">
  <a href="https://github.com/Natsuki-Hui/nano-stat/releases"><img src="https://img.shields.io/badge/version-1.3.0-blue.svg" alt="Version"></a>
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/Rust-2021-000000?logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=0B1B2B" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/TailwindCSS-4-38BDF8?logo=tailwindcss&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT">
</p>

<p align="center">
  <b>English</b> | <a href="README-zh.md">简体中文</a>
</p>

A lightweight, modern desktop hardware monitoring tool for Windows — real-time hardware stats and an in-game overlay, inspired by GamePP-style monitoring.

> **This project is a fork of [Chunyu33/nano-stat](https://github.com/Chunyu33/nano-stat) v1.1.0.**
> See [CHANGES-FROM-UPSTREAM.md](./CHANGES-FROM-UPSTREAM.md) for the complete list of changes
> compared to the original.

## Features

### Hardware overview (main window)

- **Card-based UI** — CPU / GPU / memory / disk / network / display cards with live usage charts
- **Live CPU boost frequency** — PDH `% Processor Performance` counter × base clock, tracks
  real-time turbo behavior (fixes the constant base clock shown by the original)
- **Full GPU telemetry** — NVIDIA via NVML (usage / temp / clock / power / VRAM / driver);
  AMD / Intel via WMI
- **CPU / motherboard temps** — optional PawnIO kernel driver (run as admin) unlocks
  MSR-based temps via the LibreHardwareMonitor bridge; falls back to WMI thermal zones
  with an in-card install hint
- **Virtual NIC filtering** — network rates exclude Hyper-V vEthernet / loopback / TAP
  adapters (fixes doubled rates from mirrored traffic)

### In-game overlay (OSD) — the core enhancement of this fork

- **16 independent display items** — FPS, 1%Low, CPU/GPU usage-temp-clock-power,
  memory usage-capacity, VRAM usage-capacity, network rate, disk IO — each **individually
  toggleable + drag-to-reorder**; adjacent same-hardware items auto-merge into one block
- **Load-based coloring** — usage turns green <60%, yellow 60–85%, red ≥85%
  (memory/VRAM follow the same rule)
- **Smart FPS item** — ETW-based, no injection (anti-cheat safe); each frame records the
  event's own QPC timestamp and FPS is computed from frame-time deltas (fixes the
  batch-delivery distortion); falls back to desktop frame rate when the foreground
  process emits no frames
- **1% Low FPS** — 99th percentile of frame times (PresentMon-aligned); idle gaps excluded
- **Live CPU clock (OSD)** — real turbo frequency, not the constant base clock
- **Bundled font** — subsetted Noto Sans SC (SIL OFL 1.1, free for commercial use, ~35KB);
  CJK and Latin share one typeface with matching line metrics
- **Tabular numerals** — stable digit widths, the bar never jitters on refresh
- **Live settings preview** — the settings-page preview shares the same MonitorBar renderer
  as the OSD (what you see is what you get)
- **8 screen positions** — edge-center + four corners, adjustable opacity / font size
- **Polish** — custom title bar, collapsible sidebar, dark theme, system tray

## Key differences from upstream (v1.1.0)

| Area | Upstream | This fork |
|---|---|---|
| OSD items | 5 fixed items | 16 independent items, toggle + reorder, auto-merge |
| FPS capture | Event arrival rate (distorted by batch delivery) | QPC timestamp deltas (accurate) |
| 1% Low | — | 99th percentile frame time (PresentMon-aligned) |
| CPU clock | WMI static base clock (constant 2304MHz) | PDH live turbo frequency |
| Usage display | Single color | Load-based coloring (green/yellow/red) |
| Memory/VRAM | Single item | Usage % and capacity split, individually toggleable |
| OSD font | System font mixing (uneven heights) | Bundled Noto Sans SC subset, uniform metrics |
| Disk rates | — | PDH counters, compact format |
| Network rates | Includes virtual NICs (mirrored traffic inflates) | Filters Hyper-V/loopback/TAP |
| Robustness | Orphaned ETW sessions / child processes pile up after force-kill | Exit cleanup + bridge crash auto-revive + precise handle inheritance |
| Settings file | Corrupt file silently wipes config | Backs up `.bak` before resetting |

## Getting Started

Prerequisites: Windows 10/11, Node.js 18+, Rust 1.70+, .NET SDK 8 (builds the lhm-bridge
temperature sidecar via NativeAOT; `npm run tauri dev/build` publishes it automatically).

```bash
# Install dependencies
npm install

# Development (Tauri)
npm run tauri dev

# Production build
npm run tauri build
```

> For full NVIDIA telemetry, install the official GPU driver (NVML enabled).
> Run as **administrator** for ETW frame capture and full temperature sensors.

## Tech Stack

- **Frontend**: React 19, TypeScript, TailwindCSS, Radix UI, Recharts
- **Desktop**: Tauri 2
- **Backend**: Rust — sysinfo, systemstat, nvml-wrapper, wmi, windows (PDH/ETW/process mgmt)

## Documentation

- [简体中文文档](./README-zh.md)
- [Changes from upstream](./CHANGES-FROM-UPSTREAM.md)

## Contributing

Bug reports, feature suggestions, and PRs are welcome. Open an issue first to discuss direction, then submit a PR.

## License

[MIT](./LICENSE)
