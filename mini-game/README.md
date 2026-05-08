# Flappy Dash 🐤

一个单文件 HTML5 Canvas 小游戏：Flappy Bird 加强版。

## 玩法

- 点击屏幕 / 按 `空格` / `↑` 起跳
- 穿过水管之间的缝隙得 1 分
- 撞到水管或地面就 GG
- 最高分自动保存在浏览器（localStorage）

## 开始玩

```bash
# 任选一种
open mini-game/index.html              # macOS
xdg-open mini-game/index.html          # Linux
python3 -m http.server -d mini-game 8000  # 本地起服务，访问 http://localhost:8000
```

或者直接双击 `index.html`。

## 特性

- 🌓 随机白天 / 黑夜场景，黑夜带星空
- ✨ 起跳和得分粒子特效
- 📱 自适应屏幕，触屏 / 键盘 / 鼠标都能玩
- 🏅 按分数发铜 / 银 / 金 / 白金奖牌
- 💾 最高分本地保存，打破纪录会有"新纪录"提示
- 📦 零依赖，纯单文件 HTML

## 文件

```
mini-game/
├── index.html   # 游戏全部内容（HTML + CSS + JS）
└── README.md    # 本文件
```
