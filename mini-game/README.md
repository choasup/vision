# 打工人合成记 💼

一个单文件 HTML5 物理小游戏：从实习生卷到财富自由，**同岗位相撞 → 升职 → 财富自由**。

## 两个版本

| 目录 | 适用场景 |
|---|---|
| [`index.html`](./index.html) | **H5 / Web** 版。单文件，丢任何静态托管即可（Vercel/GitHub Pages/Cloudflare Pages/七牛/OSS），用来在抖音 H5、微信公众号文章里测题材 |
| [`wxgame/`](./wxgame/) | **微信小游戏** 版。同款玩法，全 Canvas UI（无 DOM），用 `wx.createCanvas` / `wx.shareAppMessage` / `wx.createRewardedVideoAd`。开发者工具直接「导入项目」即可。提审 + 上线流程详见 [`wxgame/README.md`](./wxgame/README.md) |

## 玩法

- 鼠标移动 / 触屏拖动 → 选择落点
- 点击 / 空格 / 回车 → 丢下打工人
- 同等级岗位碰撞会合并升职
- 任何打工人长时间停在虚线之上 → 被优化（游戏结束）
- 每局可看一次广告续命（自动清掉最上面 30% 的方块，最多 3 个）
- 升到 🏝️ 财富自由 +500 分；两次财富自由对撞 +1000 分

## 升职路径

🎓 实习生 → 😩 试用期 → 💻 专员 → 📋 主管 → 👔 经理 → 💼 总监 → 🎯 VP → 👑 CEO → 🚀 创始人 → 💰 投资人 → 🏝️ 财富自由

每升一级，从该级**台词池随机抽一句**显示（每级 4 句以上，避免重复）。
连击 ≥3 次时，偶尔弹"加薪 30%"／"团建去三亚"等加薪 buff 文案。
底部图鉴会随你解锁的等级亮起。

## 战报分享

游戏结束后点击「生成战报」：
- **微信小游戏**：调 `wx.shareAppMessage` 原生分享卡
- **抖音小游戏**：调 `tt.shareAppMessage`，channel: video（可分享到抖音视频）
- **Web**：生成 600×900 PNG 战报图片（最高岗位 + 工资 + 巅峰 + 合成次数 + 召唤朋友打挑战），可下载或长按保存

## 平台适配

`PLATFORM` 在启动时自动检测 `wx` / `tt` / `qq` / `web`。`track()` 和 `Ad.show()` 内部按平台分流：

| 平台 | track() 调用 | 续命广告 | 分享 |
|---|---|---|---|
| Web | `dataLayer.push` + `gtag` + `aplus_queue` | 模拟（1.2s 后回调成功） | 渲染图片 → 下载 |
| 微信 | + `wx.reportEvent` | `wx.createRewardedVideoAd` | `wx.shareAppMessage` |
| 抖音 | + `tt.reportAnalytics` | `tt.createRewardedVideoAd` | `tt.shareAppMessage` |

接入正式 SDK 时，把代码里的 `TODO_WX_AD_UNIT_ID` / `TODO_TT_AD_UNIT_ID` 替换为实际广告位 ID 即可。

## 开始玩

```bash
# 任选一种
open mini-game/index.html              # macOS
xdg-open mini-game/index.html          # Linux
python3 -m http.server -d mini-game 8000  # 起本地服务，访问 http://localhost:8000
```

## 埋点事件

调试时设 `window.__DEBUG_TRACK__ = true` 控制台可见。

| 事件 | 触发时机 | 关键字段 |
|---|---|---|
| `first_visit` | 首次访问（写入 `dgr_intro_seen`） | - |
| `game_start` | 点击开始 / 再卷一次 | `best` |
| `first_merge` | 本局第一次合成 | - |
| `reach_level` | 首次升到主管 / 总监 / CEO / 投资人 / 财富自由 | `level`, `role` |
| `won` | 首次合出财富自由 | - |
| `game_over` | 游戏结束 | `score`, `best`, `highest_role`, `role_name`, `drops`, `merges`, `won`, `duration_s` |
| `revive_click` / `revive_success` / `revive_fail` | 续命按钮 | `score`, `highest_role`, `reason` |
| `share_open` / `share_success` / `share_fail` | 分享 | `highest_role`, `score`, `platform` |
| `share_download` | Web 端下载战报 | `highest_role`, `score` |

每条事件都会附 `platform` 字段（`wx`/`tt`/`qq`/`web`）。

## 特性

- ⚛️ 自实现的简易刚体物理（重力、碰撞、摩擦、自旋），无任何依赖
- 💼 11 级职场剧情台词，每级多句随机抽，连击触发加薪 buff
- 📺 IAA 续命机制：广告位预加载、回调清零危险区
- 🎯 危险线警告：打工人停在线上方过久会变红
- 🎉 连锁合并触发 COMBO，分数倍率成长
- 📸 一键生成战报图（Web）／调原生分享卡（小游戏）
- 💾 最高分自动保存（localStorage，键名 `dgr_best` / `dgr_best_role` / `dgr_intro_seen`）
- 📱 鼠标 / 触屏 / 键盘 全平台支持，自适应屏幕
- 📦 单 HTML 文件，零依赖，离线可玩
