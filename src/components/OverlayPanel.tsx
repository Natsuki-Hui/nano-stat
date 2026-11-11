/**
 * 游戏内监控悬浮面板（OSD）主组件：轮询实时数据、按设置渲染监控条
 *
 * 渲染本体在 components/MonitorBar.tsx（与设置页预览共用同一份），
 * 本组件只负责：设置加载/监听、实时数据轮询、OSD 透明层的屏幕定位。
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { RealtimeStats, MonitorSettings } from '../types/hardware';
import { MonitorBar } from './MonitorBar';

/** 默认设置 */
const defaultSettings: MonitorSettings = {
  enabled: true,
  position: 'TopCenter',
  display_items: {
    cpu: true,
    cpu_temp: false,
    cpu_power: true,
    gpu: true,
    gpu_temp: true,
    memory: true,
    memory_cap: true,
    network: true,
    fps: false,
    fps_1pct: true,
    vram: true,
    vram_cap: true,
    disk: true,
    cpu_freq: false,
    gpu_freq: false,
    gpu_power: false,
  },
  refresh_interval: 1000,
  opacity: 80,
  font_size: 12,
  item_order: [],
};

export function OverlayPanel() {
  const [stats, setStats] = useState<RealtimeStats | null>(null);
  const [settings, setSettings] = useState<MonitorSettings>(defaultSettings);

  // 加载设置并监听设置变更事件（替代原来的每秒轮询）
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await invoke<MonitorSettings>('get_monitor_settings');
        setSettings(data);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadSettings();

    // 监听主窗口设置变更事件，实时响应（位置切换、显示项调整等）
    const unlistenPromise = listen<MonitorSettings>('settings-changed', (event) => {
      setSettings(event.payload);
    });
    return () => {
      unlistenPromise.then(unlisten => unlisten()).catch(() => {});
    };
  }, []);

  // 定时获取实时数据：链式调度（上一次请求完成后再排下一次），
  // 避免固定 setInterval 在请求耗时超过间隔时堆积并发请求；
  // 刷新间隔加 250ms 下限防护，配置异常值不会打爆主进程
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const data = await invoke<RealtimeStats>('get_realtime_stats');
        if (!cancelled) {
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
      if (!cancelled) {
        timer = window.setTimeout(tick, Math.max(250, settings.refresh_interval));
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [settings.refresh_interval]);

  // OSD 透明层根节点：面板条由 MonitorBar 渲染，
  // pos-* 类驱动 overlay.css 中 #root 的屏幕边缘吸附
  return <MonitorBar settings={settings} stats={stats} />;
}
