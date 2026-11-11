"""子集化 Noto Sans SC -> OSD 专用 woff2。

OSD 文字全部来自固定集合（标签 + 单位 + 占位符），
按这些字形子集化后每个字重只有几 KB。
"""
import os
from fontTools.subset import Subsetter, Options, load_font, save_font

SRC = os.path.join(os.path.dirname(__file__), "..", "fonts-src", "package", "files")
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "fonts")

# OSD 会出现的全部字符：标签、数字单位、箭头、占位符
CHARS = (
    "FPS1%Low"
    "CPU温度频率功耗"
    "GPU"
    "内存网络显存磁盘"
    "原始帧生成"
    "0123456789."
    "%°CMHzGWKMBs/"
    "↓↑"
    "--"
)
# 去重保序
text = "".join(dict.fromkeys(CHARS))

WEIGHTS = {
    "400": ["noto-sans-sc-latin-400-normal.woff2", "noto-sans-sc-chinese-simplified-400-normal.woff2"],
    "500": ["noto-sans-sc-latin-500-normal.woff2", "noto-sans-sc-chinese-simplified-500-normal.woff2"],
    "700": ["noto-sans-sc-latin-700-normal.woff2", "noto-sans-sc-chinese-simplified-700-normal.woff2"],
}

for weight, files in WEIGHTS.items():
    # latin 子集与中文子集分别子集化（保持 woff2 表结构简单），输出同名文件
    for fname in files:
        src = os.path.join(SRC, fname)
        opts = Options()
        opts.flavor = "woff2"
        opts.layout_features = ["tnum"]  # 保留等宽数字特性
        opts.name_IDs = [1, 2]
        font = load_font(src, opts)
        subsetter = Subsetter(opts)
        subsetter.populate(text=text)
        subsetter.subset(font)
        out = os.path.join(OUT, fname)  # 沿用原名，css 里按名引用
        save_font(font, out, opts)
        print(f"{fname}: {os.path.getsize(out)} bytes")
