# 打工人合成记 💼

一个单文件 HTML5 物理小游戏：从实习生卷到财富自由，**同岗位相撞 → 升职 → 财富自由**。

## 玩法

- 鼠标移动 / 触屏拖动 → 选择落点
- 点击 / 空格 / 回车 → 丢下打工人
- 同等级岗位碰撞会合并升职
- 任何打工人长时间停在虚线之上 → 被优化（游戏结束）
- 升到 🏝️ 财富自由 +500 分；两次财富自由对撞 +1000 分

## 升职路径

🎓 实习生 → 😩 试用期 → 💻 专员 → 📋 主管 → 👔 经理 → 💼 总监 → 🎯 VP → 👑 CEO → 🚀 创始人 → 💰 投资人 → 🏝️ 财富自由

每升一级，弹出对应剧情台词。底部图鉴会随你解锁的等级亮起。

## 战报分享

游戏结束后点击「生成战报」可生成一张 600×900 PNG 战报图片，包含：
当前升到的最高岗位、工资分数、巅峰记录、合成次数。可直接下载或长按保存，发到朋友圈 / 抖音。

## 开始玩

```bash
# 任选一种
open mini-game/index.html              # macOS
xdg-open mini-game/index.html          # Linux
python3 -m http.server -d mini-game 8000  # 起本地服务，访问 http://localhost:8000
```

## 埋点事件

通过 `window.dataLayer.push` / `gtag` / `aplus_queue` 上报，调试时设 `window.__DEBUG_TRACK__ = true` 控制台可见。

| 事件 | 触发时机 | 关键字段 |
|---|---|---|
| `game_start` | 点击开始 / 再卷一次 | `best` |
| `first_merge` | 本局第一次合成 | - |
| `reach_level` | 首次升到主管 / 总监 / CEO / 投资人 / 财富自由 | `level`, `role` |
| `won` | 首次合出财富自由 | - |
| `game_over` | 游戏结束 | `score`, `best`, `highest_role`, `role_name`, `drops`, `merges`, `won`, `duration_s` |
| `share_open` | 打开战报弹窗 | `highest_role`, `score` |
| `share_download` | 下载战报图片 | `highest_role`, `score` |

接入微信 / 抖音小游戏 SDK 时，把 `track()` 函数内部替换成 `wx.reportEvent` / `tt.reportAnalytics` 即可。

## 特性

- ⚛️ 自实现的简易刚体物理（重力、碰撞、摩擦、自旋），无任何依赖
- 💼 11 级职场剧情台词，每次升职都有梗
- 🎯 危险线警告：打工人停在线上方过久会变红
- 🎉 连锁合并触发 COMBO，分数倍率成长
- 📸 一键生成战报图，社交分享友好
- 💾 最高分自动保存（localStorage，键名 `dgr_best` / `dgr_best_role`）
- 📱 鼠标 / 触屏 / 键盘 全平台支持，自适应屏幕
- 📦 单 HTML 文件，零依赖，离线可玩
