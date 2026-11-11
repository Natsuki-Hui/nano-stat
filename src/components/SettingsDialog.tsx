/**
 * 设置弹窗组件
 * 提供游戏内监控的配置选项
 * 
 * 特性：
 * - 所有设置实时预览（防抖 150ms 同步后端，overlay 通过 settings-changed 事件即时更新）
 * - 透明度只作用于监控面板背景，文字指标保持不透明
 * - 支持 8 个位置（四边中间 + 四角）
 * - framer-motion 过渡动画
 */

import { useState, useEffect, useRef, type PointerEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Settings2, Eye, Sun, Moon, Laptop, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import type { MonitorSettings, MonitorPosition } from '../types/hardware';
import { showOverlayWindow, hideOverlayWindow, updateMonitorSettings } from '../api/hardware';
import { useTheme, type ThemeMode } from '../hooks/useTheme';
import { Checkbox } from './ui/Checkbox';
import { ITEM_LABELS, resolveItemOrder, type ItemKey } from '../utils/overlayItems';

interface SettingsDialogProps {
  /** 弹窗是否打开 */
  open: boolean;
  /** 关闭弹窗回调 */
  onOpenChange: (open: boolean) => void;
  /** 当前设置 */
  settings: MonitorSettings;
  /** 保存设置回调 */
  onSave: (settings: MonitorSettings) => void;
}

/** 位置选项配置（四边中间 + 四角） */
const positionOptions: { value: MonitorPosition; label: string }[] = [
  { value: 'TopLeft', label: '左上角' },
  { value: 'TopCenter', label: '顶部中间' },
  { value: 'TopRight', label: '右上角' },
  { value: 'LeftCenter', label: '左侧中间' },
  { value: 'RightCenter', label: '右侧中间' },
  { value: 'BottomLeft', label: '左下角' },
  { value: 'BottomCenter', label: '底部中间' },
  { value: 'BottomRight', label: '右下角' },
];

/** 刷新间隔选项 */
const refreshIntervalOptions = [
  { value: 500, label: '500ms' },
  { value: 1000, label: '1秒' },
  { value: 2000, label: '2秒' },
  { value: 5000, label: '5秒' },
];

/** 主题选项配置 */
const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'system', label: '跟随系统', icon: Laptop },
];

/** 遮罩层动画 */
const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
};

/** 弹窗内容动画 */
const contentMotion = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 12 },
  transition: { duration: 0.2, ease: 'easeOut' as const },
};

/** 游戏内监控设置对话框：显示项开关/拖拽排序/刷新间隔/透明度等 */
export function SettingsDialog({ open, onOpenChange, settings, onSave }: SettingsDialogProps) {
  // 本地状态，用于编辑
  const [localSettings, setLocalSettings] = useState<MonitorSettings>(settings);
  // 主题
  const { theme, setTheme } = useTheme();
  // ref 同步最新设置，避免异步回调中使用过期的闭包值
  const settingsRef = useRef(localSettings);
  // 防抖定时器
  const debounceRef = useRef<number | null>(null);

  // 当外部设置变化时同步
  useEffect(() => {
    setLocalSettings(settings);
    settingsRef.current = settings;
  }, [settings]);

  // 实时预览：本地设置变更后防抖同步到后端，
  // overlay 监听 settings-changed 事件即时更新（透明度/显示项/刷新间隔等）。
  // 引用相等守卫：挂载回声与外部同步（未实际变化）不触发写盘
  useEffect(() => {
    if (localSettings === settingsRef.current) {
      return;
    }
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      updateMonitorSettings(localSettings).catch(err => {
        console.error('Failed to sync settings:', err);
      });
    }, 150);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [localSettings]);

  // 更新本地设置并同步 ref（保证后续异步操作读到最新值）
  const updateLocalSettings = (next: MonitorSettings) => {
    setLocalSettings(next);
    settingsRef.current = next;
  };

  // 处理开关变更 - 立即显示/隐藏悬浮窗口
  const handleEnabledChange = async (enabled: boolean) => {
    const next = { ...settingsRef.current, enabled };
    updateLocalSettings(next);
    try {
      if (enabled) {
        await showOverlayWindow();
      } else {
        await hideOverlayWindow();
      }
    } catch (err) {
      console.error('Failed to toggle overlay:', err);
    }
  };

  // 处理位置变更 - 面板由前端 CSS 吸附定位，settings-changed 事件即时生效
  const handlePositionChange = (position: MonitorPosition) => {
    updateLocalSettings({ ...settingsRef.current, position });
  };

  // 处理细项开关变更（每个指标独立开关）
  const handleDisplayItemChange = (key: ItemKey, value: boolean) => {
    updateLocalSettings({
      ...settingsRef.current,
      display_items: { ...settingsRef.current.display_items, [key]: value },
    });
  };

  // 处理显示项排序变更（拖拽换位或 ↑↓ 点击后触发，实时同步悬浮窗）
  const handleReorder = (newOrder: ItemKey[]) => {
    updateLocalSettings({ ...settingsRef.current, item_order: newOrder });
  };

  // 拖拽排序：基于 Pointer 事件手动实现。
  // 不用 HTML5 原生 DnD（WebView2 内 dragstart 不可靠）、不用 framer 投影，
  // 只依赖 pointermove + getBoundingClientRect，任何环境都稳定工作。
  const dragState = useRef<{ key: ItemKey } | null>(null);
  const [draggingKey, setDraggingKey] = useState<ItemKey | null>(null);
  const rowRefs = useRef(new Map<ItemKey, HTMLDivElement>());

  const handleGripPointerDown = (key: ItemKey) => (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); // 阻止文本选择与原生拖拽
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { key };
    setDraggingKey(key);
  };

  const handleGripPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const ds = dragState.current;
    if (!ds) return;
    const cur = resolveItemOrder(settingsRef.current.item_order);
    // 找指针当前落在哪一行，按行上半/下半决定插到其前/后
    let target: ItemKey | null = null;
    let before = false;
    for (const k of cur) {
      if (k === ds.key) continue;
      const el = rowRefs.current.get(k);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        target = k;
        before = e.clientY < r.top + r.height / 2;
        break;
      }
    }
    if (!target) return;
    const next = cur.filter(k => k !== ds.key);
    next.splice(next.indexOf(target) + (before ? 0 : 1), 0, ds.key);
    if (next.join('|') !== cur.join('|')) {
      handleReorder(next);
    }
  };

  const endDrag = () => {
    dragState.current = null;
    setDraggingKey(null);
  };

  // 处理显示项排序变更（↑ 上移 / ↓ 下移，实时同步悬浮窗）
  const handleMoveItem = (key: ItemKey, dir: -1 | 1) => {
    const current = resolveItemOrder(settingsRef.current.item_order);
    const idx = current.indexOf(key);
    const target = idx + dir;
    if (idx === -1 || target < 0 || target >= current.length) return;
    const next = [...current];
    [next[idx], next[target]] = [next[target], next[idx]];
    updateLocalSettings({ ...settingsRef.current, item_order: next });
  };

  // 处理刷新间隔变更
  const handleRefreshIntervalChange = (interval: number) => {
    updateLocalSettings({ ...settingsRef.current, refresh_interval: interval });
  };

  // 处理透明度变更
  const handleOpacityChange = (opacity: number) => {
    updateLocalSettings({ ...settingsRef.current, opacity });
  };

  // 处理文字大小变更
  const handleFontSizeChange = (fontSize: number) => {
    updateLocalSettings({ ...settingsRef.current, font_size: fontSize });
  };

  // 保存设置
  const handleSave = async () => {
    onSave(localSettings);

    // 根据启用状态控制悬浮窗口
    if (localSettings.enabled) {
      try {
        await showOverlayWindow();
      } catch (err) {
        console.error('Failed to show overlay:', err);
      }
    } else {
      try {
        await hideOverlayWindow();
      } catch (err) {
        console.error('Failed to hide overlay:', err);
      }
    }

    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            {/* 遮罩层 */}
            <Dialog.Overlay forceMount asChild>
              <motion.div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" {...overlayMotion} />
            </Dialog.Overlay>

            {/* 弹窗内容（flex 包裹层居中，不依赖 translate，
                避免 framer-motion 动画覆写 transform 后弹窗/内容错位） */}
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <Dialog.Content forceMount asChild className="pointer-events-auto">
              <motion.div
                className="w-[50vw] min-w-[560px] max-w-[900px] max-h-[85vh] rounded-xl shadow-2xl overflow-hidden bg-[var(--color-bg-card)] border border-[var(--color-border)]"
                {...contentMotion}
              >
                {/* 标题栏 */}
                <div
                  className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-sidebar)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Settings2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <Dialog.Title className="text-base font-semibold text-[var(--color-text-primary)]">
                      设置
                    </Dialog.Title>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-bg-input)] text-[var(--color-text-secondary)]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </Dialog.Close>
                </div>

                {/* 设置内容（固定高度滚动区，几何确定） */}
                <motion.div
                  className="p-6 flex flex-col gap-6 overflow-y-auto h-[60vh]"
                >
                  {/* 游戏内监控开关 */}
                  <div
                    className="flex items-center justify-between rounded-lg p-4 bg-[var(--color-bg-input)] border border-[var(--color-border)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <Monitor className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">游戏内监控</p>
                        <p className="text-xs text-[var(--color-text-muted)]">在游戏中显示硬件性能监控面板</p>
                      </div>
                    </div>
                    {/* 主题化开关 */}
                    <button
                      onClick={() => handleEnabledChange(!localSettings.enabled)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        localSettings.enabled
                          ? 'bg-emerald-500 shadow-[0_0_8px_var(--color-card-glow)]'
                          : 'bg-gray-600 shadow-none'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${
                          localSettings.enabled ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {/* 监控面板位置 - 四边中间 + 四角 */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">面板位置</p>
                    </div>
                    <div className="grid grid-cols-4 gap-2.5">
                      {positionOptions.map(option => (
                        <button
                          key={option.value}
                          onClick={() => handlePositionChange(option.value)}
                          className={`rounded-lg font-medium transition-all px-2 py-2.5 text-xs ${
                            localSettings.position === option.value
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-light)] hover:text-[var(--color-text-primary)]'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 显示项目 - 拖拽排序（framer-motion Reorder）+ ↑↓ 微调 */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">显示项目</p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        按住左侧 ⋮⋮ 拖动调整悬浮窗中的显示顺序，也可使用 ↑ ↓
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      {resolveItemOrder(localSettings.item_order).map((key, idx, arr) => {
                        const isDragging = draggingKey === key;
                        return (
                          <div
                            key={key}
                            ref={el => {
                              if (el) rowRefs.current.set(key, el);
                              else rowRefs.current.delete(key);
                            }}
                            className="flex items-center justify-between rounded-lg border px-3.5 py-2 bg-[var(--color-bg-input)] border-[var(--color-border)] select-none"
                            style={isDragging ? { opacity: 0.4 } : undefined}
                          >
                            <div className="flex items-center gap-1.5">
                              {/* 拖拽把手：按住后通过 Pointer 事件实时换位 */}
                              <div
                                onPointerDown={handleGripPointerDown(key)}
                                onPointerMove={handleGripPointerMove}
                                onPointerUp={endDrag}
                                onLostPointerCapture={endDrag}
                                title="按住拖动排序"
                                className="w-6 h-8 -mx-1 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover,rgba(255,255,255,0.06))] cursor-grab active:cursor-grabbing shrink-0 select-none touch-none"
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>
                              <Checkbox
                                checked={
                                  localSettings.display_items[
                                    key as keyof typeof localSettings.display_items
                                  ]
                                }
                                onChange={value => handleDisplayItemChange(key, value)}
                                label={ITEM_LABELS[key]}
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleMoveItem(key, -1)}
                                disabled={idx === 0}
                                title="上移"
                                className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-light)] disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveItem(key, 1)}
                                disabled={idx === arr.length - 1}
                                title="下移"
                                className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-light)] disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 刷新间隔 */}
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)] mb-3">刷新间隔</p>
                    <div className="flex gap-2.5">
                      {refreshIntervalOptions.map(option => (
                        <button
                          key={option.value}
                          onClick={() => handleRefreshIntervalChange(option.value)}
                          className={`flex-1 rounded-lg font-medium transition-all px-4 py-2.5 text-[13px] ${
                            localSettings.refresh_interval === option.value
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-light)] hover:text-[var(--color-text-primary)]'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 背景透明度（只影响面板背景，文字指标保持不透明） */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">背景透明度</p>
                      <span className="text-sm font-semibold text-[#10b981]">{localSettings.opacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      value={localSettings.opacity}
                      onChange={e => handleOpacityChange(Number(e.target.value))}
                      className="w-full h-2 bg-[var(--color-bg-input)] rounded-lg appearance-none cursor-pointer accent-emerald-500 border border-[var(--color-border)]"
                    />
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5">
                      仅调整监控面板背景透明度，文字与数值保持清晰可见
                    </p>
                  </div>

                  {/* 文字大小（容器随字号自适应） */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">文字大小</p>
                      <span className="text-sm font-semibold text-[#10b981]">{localSettings.font_size}px</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={20}
                      value={localSettings.font_size}
                      onChange={e => handleFontSizeChange(Number(e.target.value))}
                      className="w-full h-2 bg-[var(--color-bg-input)] rounded-lg appearance-none cursor-pointer accent-emerald-500 border border-[var(--color-border)]"
                    />
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5">
                      面板文字大小（10-20px），悬浮窗口尺寸会随之自适应
                    </p>
                  </div>

                  {/* 主题切换 */}
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)] mb-3">主题</p>
                    <div className="flex gap-2.5">
                      {themeOptions.map(option => {
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.value}
                            onClick={() => setTheme(option.value)}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-lg font-medium transition-all px-4 py-2.5 text-[13px] ${
                              theme === option.value
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : 'bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-light)] hover:text-[var(--color-text-primary)]'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>

                {/* 底部按钮 */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-sidebar)]">
                  <button
                    onClick={() => onOpenChange(false)}
                    className="px-5 py-2.5 text-[13px] font-medium text-[var(--color-text-secondary)] bg-transparent border border-[var(--color-border)] rounded-lg cursor-pointer transition-all hover:text-[var(--color-text-primary)]"
                  >
                    关闭
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-6 py-2.5 text-[13px] font-semibold text-white bg-[#10b981] border-none rounded-lg cursor-pointer transition-all hover:bg-[#0da271]"
                  >
                    保存设置
                  </button>
                </div>
              </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
