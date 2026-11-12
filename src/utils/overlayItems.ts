/**
 * 游戏内监控悬浮窗 - 显示项定义
 *
 * 细项粒度模型：每个指标（占用/温度/频率/功耗）都是独立项，
 * 可单独开关、单独拖动排序；渲染时相邻的同硬件项（CPU 系 / GPU 系）
 * 自动合并为一个显示块，标签只在块首出现一次（游戏加加样式）。
 */

/** 细项 key */
export type ItemKey =
  | 'fps'
  | 'fps_1pct'
  | 'cpu'
  | 'cpu_temp'
  | 'cpu_freq'
  | 'cpu_power'
  | 'gpu'
  | 'gpu_temp'
  | 'gpu_freq'
  | 'gpu_power'
  | 'memory'
  | 'memory_cap'
  | 'network'
  | 'vram'
  | 'vram_cap'
  | 'disk';

/** 细项标签（设置界面列表用；OSD 合并块标签另见 ITEM_GROUP_LABELS） */
export const ITEM_LABELS: Record<ItemKey, string> = {
  fps: 'FPS',
  fps_1pct: '1%Low',
  cpu: 'CPU占用',
  cpu_temp: 'CPU温度',
  cpu_freq: 'CPU频率',
  cpu_power: 'CPU功耗',
  gpu: 'GPU占用',
  gpu_temp: 'GPU温度',
  gpu_freq: 'GPU频率',
  gpu_power: 'GPU功耗',
  memory: '内存占用',
  memory_cap: '内存容量',
  network: '网络',
  vram: '显存占用',
  vram_cap: '显存容量',
  disk: '磁盘',
};

/** OSD 合并块首标签：同硬件细项合并后统一显示硬件名（不随首项变化）。
    fps 族例外：各细项（FPS/1%Low/原始帧/帧生成）语义独立，自带标签 */
/** OSD 合并块首标签映射：cpu/gpu/memory/vram 四族合并后显示的块名 */
export const ITEM_GROUP_LABELS: Record<'cpu' | 'gpu' | 'memory' | 'vram', string> = {
  cpu: 'CPU',
  gpu: 'GPU',
  memory: '内存',
  vram: '显存',
};

/** 细项所属硬件族（相邻同族项合并为一个显示块） */
export function itemFamily(key: ItemKey): string {
  if (key.startsWith('cpu')) return 'cpu';
  if (key.startsWith('gpu')) return 'gpu';
  if (key.startsWith('fps')) return 'fps';
  if (key === 'memory' || key === 'memory_cap') return 'memory';
  if (key === 'vram' || key === 'vram_cap') return 'vram';
  return key;
}

/** 默认显示顺序（同族项相邻，渲染时自动合并） */
export const DEFAULT_ITEM_ORDER: ItemKey[] = [
  'fps',
  'fps_1pct',
  'cpu',
  'cpu_temp',
  'cpu_freq',
  'cpu_power',
  'gpu',
  'gpu_temp',
  'gpu_freq',
  'gpu_power',
  'memory',
  'memory_cap',
  'network',
  'vram',
  'vram_cap',
  'disk',
];

/**
 * 兼容迁移：item_order 可能是三种历史形态
 * 1. 细项 key（v1.2.0 原版 / 当前版）——原样保留
 * 2. 块级 key（合并版：cpu/gpu 块）——展开为块内细项
 * 3. 空/未知 key——按默认顺序补齐
 * 统一去重后，缺失项按默认顺序补齐到尾部。
 */
const GROUP_EXPANSION: Record<string, ItemKey[]> = {
  cpu: ['cpu', 'cpu_temp', 'cpu_freq', 'cpu_power'],
  gpu: ['gpu', 'gpu_temp', 'gpu_freq', 'gpu_power'],
  fps: ['fps', 'fps_1pct'],
  memory: ['memory', 'memory_cap'],
  network: ['network'],
  vram: ['vram', 'vram_cap'],
  disk: ['disk'],
};

/**
 * 兼容迁移：将持久化的 item_order 解析为完整细项顺序。
 * 处理三种历史形态：细项 key（当前）、块级 key（旧合并版）、空/未知（补默认序）；
 * 新增细项插入同族成员之后，缺失项按默认顺序补齐尾部，统一去重。
 */
export function resolveItemOrder(itemOrder?: string[]): ItemKey[] {
  const list = itemOrder ?? [];
  // 含有细项 key 即视为细项粒度配置（块级配置只含 8 个块 key）
  const isFine = list.some(
    k =>
      k === 'cpu_temp' ||
      k === 'cpu_freq' ||
      k === 'cpu_power' ||
      k === 'gpu_temp' ||
      k === 'gpu_freq' ||
      k === 'gpu_power',
  );

  const seen = new Set<ItemKey>();
  const result: ItemKey[] = [];
  for (const raw of list) {
    const keys: (ItemKey | undefined)[] = isFine
      ? [(raw as ItemKey) in ITEM_LABELS ? (raw as ItemKey) : undefined]
      : GROUP_EXPANSION[raw];
    for (const key of keys) {
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(key);
      }
    }
  }
  // 缺失项按默认顺序补齐；新拆分的项（memory_cap/vram_cap 等）插到同族成员之后，
  // 避免旧配置迁移时被追加到尾部导致同族块分裂显示
  for (const key of DEFAULT_ITEM_ORDER) {
    if (seen.has(key)) continue;
    seen.add(key);
    const family = itemFamily(key);
    let insertAt = -1;
    for (let i = 0; i < result.length; i++) {
      if (itemFamily(result[i]) === family) insertAt = i;
    }
    if (insertAt >= 0) {
      result.splice(insertAt + 1, 0, key);
    } else {
      result.push(key);
    }
  }
  return result;
}
