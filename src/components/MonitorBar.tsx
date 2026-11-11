/**
 * 监控条渲染组件（OSD 与设置页预览共用）
 *
 * 渲染完整的监控条（背景/圆角/字体/所有细项），是 OSD 悬浮窗与
 * 设置页「监控面板预览」的单一渲染源——两处显示永远一致。
 *
 * 样式来自 styles/monitor-bar.css（overlay.css 通过 @import 引用同一份）。
 */

import type { CSSProperties, ReactNode } from 'react';
import type { RealtimeStats, MonitorSettings } from '../types/hardware';
import { formatGb, formatSpeed, formatDiskRate } from '../utils/format';
import {
  resolveItemOrder,
  itemFamily,
  ITEM_LABELS,
  ITEM_GROUP_LABELS,
  type ItemKey,
} from '../utils/overlayItems';
import '../styles/monitor-bar.css';

/** 占用率负载色：低绿 / 中黄 / 高红（对齐游戏加加按负载变色） */
function loadColor(usage: number): string {
  if (usage >= 85) return '#d15047';
  if (usage >= 60) return '#d1bc47';
  return '#47d179';
}

/** 显存占用百分比（used/total 前端换算），数据缺失返回 null */
function vramUsage(stats: RealtimeStats | null): number | null {
  if (stats?.vram_used != null && stats.vram_total) {
    return (stats.vram_used / stats.vram_total) * 100;
  }
  return null;
}

function vramLoadColor(stats: RealtimeStats | null): string {
  return loadColor(vramUsage(stats) ?? 0);
}

/**
 * 单个细项的渲染实现。
 * groupLabel：块首标签（同硬件连续项合并为一个块时由调用方传入，标签只渲染一次）。
 * 每个细项渲染为独立分组（.monitor-seg），块内留出呼吸间距。
 */
function renderItem(
  key: ItemKey,
  stats: RealtimeStats | null,
  groupLabel: string | null,
): ReactNode {
  const label = (text: string) =>
    groupLabel == null ? null : <span className="monitor-label">{text}</span>;
  // 块首渲染硬件名标签（CPU/GPU/FPS/内存...），块内后续项 suppress
  const showLabel = () => label(groupLabel ?? '');

  switch (key) {
    case 'cpu':
      return (
        <span className="monitor-seg">
          {showLabel()}
          <span
            className="monitor-value"
            style={{ color: loadColor(stats?.cpu_usage ?? 0) }}
          >
            {stats?.cpu_usage.toFixed(0) ?? '--'}%
          </span>
        </span>
      );
    case 'cpu_temp':
      return (
        <span className="monitor-seg">
          {showLabel()}
          <span className="monitor-value text-temp">
            {stats?.cpu_temp?.toFixed(0) ?? '--'}°C
          </span>
        </span>
      );
    case 'cpu_freq':
      return (
        <span className="monitor-seg">
          {showLabel()}
          <span className="monitor-value text-power">
            {stats?.cpu_frequency != null
              ? `${stats.cpu_frequency.toFixed(0)} MHz`
              : '--'}
          </span>
        </span>
      );
    case 'cpu_power':
      return (
        <span className="monitor-seg">
          {showLabel()}
          <span className="monitor-value text-power">
            {stats?.cpu_power != null ? `${stats.cpu_power.toFixed(0)}W` : '--'}
          </span>
        </span>
      );
    case 'gpu':
      return (
        <span className="monitor-seg">
          {showLabel()}
          <span
            className="monitor-value"
            style={{ color: loadColor(stats?.gpu_usage ?? 0) }}
          >
            {stats?.gpu_usage.toFixed(0) ?? '--'}%
          </span>
        </span>
      );
    case 'gpu_temp':
      return (
        <span className="monitor-seg">
          {showLabel()}
          <span className="monitor-value text-temp">
            {stats?.gpu_temp?.toFixed(0) ?? '--'}°C
          </span>
        </span>
      );
    case 'gpu_freq':
      return (
        <span className="monitor-seg">
          {showLabel()}
          <span className="monitor-value text-power">
            {stats?.gpu_clock != null
              ? `${stats.gpu_clock.toFixed(0)} MHz`
              : '--'}
          </span>
        </span>
      );
    case 'gpu_power':
      return (
        <span className="monitor-seg">
          {showLabel()}
          <span className="monitor-value text-power">
            {stats?.gpu_power != null ? `${stats.gpu_power.toFixed(0)}W` : '--'}
          </span>
        </span>
      );
    case 'fps':
      return (
        <span className="monitor-seg">
          {/* FPS：全程显示（游戏前台为游戏帧率，非游戏为桌面整体帧率） */}
          {showLabel()}
          <span className="monitor-value text-fps">
            {stats?.fps != null ? stats.fps.toFixed(0) : '--'}
          </span>
        </span>
      );
    case 'fps_1pct':
      return (
        <span className="monitor-seg">
          {/* 1% Low FPS（帧时间 99 百分位换算；仅游戏前台且有足够帧数时有效）。
              与 FPS 同块合并时也要自带标签，否则数值意义不明 */}
          <span className="monitor-label">1%Low</span>
          <span className="monitor-value text-fps">
            {stats?.fps_1pct != null ? stats.fps_1pct.toFixed(0) : '--'}
          </span>
        </span>
      );
    case 'memory':
      return (
        <span className="monitor-seg">
          {showLabel()}
          {/* 占用百分比，负载变色（<60 绿 / <85 黄 / >=85 红） */}
          <span
            className="monitor-value"
            style={{ color: loadColor(stats?.memory_usage ?? 0) }}
          >
            {stats?.memory_usage.toFixed(0) ?? '--'}%
          </span>
        </span>
      );
    case 'memory_cap':
      return (
        <span className="monitor-seg">
          {showLabel()}
          {/* 具体占用（已用/总量），蓝色 */}
          <span className="monitor-value text-power">
            {stats ? `${formatGb(stats.memory_used)}/${formatGb(stats.memory_total)}` : '--'}
          </span>
        </span>
      );
    case 'network':
      return (
        <span className="monitor-seg">
          {showLabel()}
          <span className="monitor-value text-network">
            ↓{formatSpeed(stats?.network_stats.download_rate ?? 0)}
          </span>
        </span>
      );
    case 'vram':
      return (
        <span className="monitor-seg">
          {showLabel()}
          {/* 占用百分比（used/total 前端换算），负载变色 */}
          <span
            className="monitor-value"
            style={{ color: vramLoadColor(stats) }}
          >
            {vramUsage(stats) != null ? vramUsage(stats)!.toFixed(0) : '--'}%
          </span>
        </span>
      );
    case 'vram_cap':
      return (
        <span className="monitor-seg">
          {showLabel()}
          {/* 具体占用（已用/总量），蓝色 */}
          <span className="monitor-value text-power">
            {stats?.vram_used != null && stats?.vram_total != null
              ? `${formatGb(stats.vram_used)}/${formatGb(stats.vram_total)}`
              : '--'}
          </span>
        </span>
      );
    case 'disk':
      return (
        <span className="monitor-seg">
          {showLabel()}
          <span className="monitor-value text-network">
            ↓{stats?.disk_read_rate != null ? formatDiskRate(stats.disk_read_rate) : '--'}{' '}
            ↑{stats?.disk_write_rate != null ? formatDiskRate(stats.disk_write_rate) : '--'}
          </span>
        </span>
      );
    default:
      return null;
  }
}

interface MonitorBarProps {
  /** 监控设置（显示项开关/顺序/位置/透明度/字号） */
  settings: MonitorSettings;
  /** 实时统计数据（null 时所有项显示 --） */
  stats: RealtimeStats | null;
  /** 预览模式：不输出屏幕定位类（pos-*），供设置页模拟屏幕内摆放 */
  preview?: boolean;
}

/** 监控条组件：渲染完整监控条（游戏加加风格的深色圆角条 + 全部细项） */
export function MonitorBar({ settings, stats, preview = false }: MonitorBarProps) {
  const isVertical = settings.position === 'LeftCenter' || settings.position === 'RightCenter';

  // 面板样式：透明度只作用于背景（--panel-bg-alpha），文字指标保持不透明；
  // 文字大小通过 --panel-font-size 控制（整屏透明层内面板收缩包裹内容）
  const panelStyle = {
    '--panel-bg-alpha': settings.opacity / 100,
    '--panel-font-size': `${settings.font_size}px`,
  } as CSSProperties;

  // 按自定义顺序渲染已启用的细项；相邻同硬件项合并为一个显示块（标签只在块首出现）
  const d = settings.display_items as unknown as Record<string, boolean>;
  const items = resolveItemOrder(settings.item_order).filter(key => d[key]);
  const runs: ItemKey[][] = [];
  for (const key of items) {
    const last = runs[runs.length - 1];
    if (last && itemFamily(last[0]) === itemFamily(key)) {
      last.push(key);
    } else {
      runs.push([key]);
    }
  }

  return (
    <div
      className={`overlay-panel ${preview ? '' : `pos-${settings.position}`} ${
        isVertical ? 'overlay-vertical' : 'overlay-horizontal'
      }`}
      style={panelStyle}
    >
      {runs.map(run => {
        // 块首标签：cpu/gpu/memory/vram 合并块固定显示硬件名（CPU/GPU/内存/显存），
        // 不随首项（如 内存占用/显存容量）变化；其余项（FPS/网络等）用自身标签
        const family = itemFamily(run[0]);
        const headLabel =
          family in ITEM_GROUP_LABELS
            ? ITEM_GROUP_LABELS[family as keyof typeof ITEM_GROUP_LABELS]
            : ITEM_LABELS[run[0]];
        // 游戏加加块式结构：每个块自带独立深色底，块间透出游戏画面
        return (
          <div className="monitor-block" key={run[0]}>
            {run.map((key, idx) => renderItem(key, stats, idx === 0 ? headLabel : null))}
          </div>
        );
      })}
    </div>
  );
}
