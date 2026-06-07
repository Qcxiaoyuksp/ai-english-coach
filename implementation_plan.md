# AI 英语口语陪练 — 开发计划 v4（体验提升 + 强制提交物）

> 本版在 v3（MVP 冲刺）基础上更新：MVP 主线（练习→实时纠错→课后报告→历史）已全部完成并合并到 main。
> 本版聚焦两件事：① 赛事**强制提交物**（README + 部署 + Demo 视频）；② 一轮**体验质量提升**
> （录音交互、ASR/TTS 可配置、免费模式、更多 Provider）。
>
> 状态图例：✅ 已完成并合并 / 🚧 进行中 / ⬜ 待开始 / ⭐ 可选加分。
> 工作流：每个 PR 只做一件事 → 写完先 `npm run build` 自检 → 暂停让用户浏览器验证 → 用户说"检查无误"后再走 git 提交合并。

---

## 项目理解

72 小时限时竞赛，开发一款 **AI 英语口语练习工具**。界面中文、对话全英文。
产品定位：场景化对话 + 实时轻量纠错 + 课后可量化报告。

赛事评审：作品完整度与创新性 40% / 开发过程与质量（架构、代码、PR 与 commit 分布）40% / 演示表达 20%。
**强制项**：公开 GitHub 仓库、README、Demo 视频；全周期持续 PR；主分支随时可运行可复现。

---

## 已完成进度（截至本版）

| PR | 内容 | 状态 |
|----|------|------|
| #1 | 项目初始化 & 设计系统 | ✅ |
| #2 | 场景系统 & 首页 | ✅ |
| #3 | API 配置 & Provider 层（OpenAI 兼容 + Gemini） | ✅ |
| #4 | 语音服务层（Web Speech STT/TTS） | ✅ |
| #5 | 语音对话页面与交互 | ✅ |
| #6 | 实时纠错打通（function calling + FeedbackBubble） | ✅ |
| #7 | 数据持久化（localStorage 封装，打通练习→报告→历史）+ SSR 水合修复 | ✅ |
| #8 | 课后评估报告 + 可解释发音评测（analyzer + 六维雷达图 + 真实信号打分） | ✅ |
| 额外 | UI 打磨（应用内确认弹框、弹框动画、首页文案、核心词汇扩充） | ✅ |
| 额外 | 进行中练习自动保存草稿、离开返回自动续接 | ✅ |

> 对应 GitHub PR #1–#10 均已合并。下一个新分支从 main 切出，GitHub PR 编号从 #11 起。

### 关键实现现状（新会话需了解）
- 纯前端 Next.js 15 (App Router) + React 19 + Vanilla CSS，代码在 `frontend/`。
- 持久化：`frontend/lib/storage.ts`（**localStorage 封装**，非 IndexedDB；接口已解耦，可后续替换）。
  - 键：`practice-sessions` / `practice-reports` / `custom-scenarios` / `practice-drafts` / `api-config` / `provider-profiles`。
- Provider：`frontend/lib/ai-providers/provider.ts`，`chatWithProvider()` 走 OpenAI 兼容 + Gemini 两条路径；服务端代理 `app/api/chat`、`app/api/analyze`。
- 语音：`frontend/lib/speech/*`（STT/TTS）+ `hooks/useWebSpeech.ts` + `hooks/useVoiceSession.ts`（会话状态机、纠错、计时、草稿续接、发音信号采集）。
- 发音评测：`frontend/lib/analyzer.ts` 用 STT 置信度 + 语速(WPM) 给出可解释分；报告页免费模式纯本地、标准模式接 analyze 并用本地客观分覆盖发音/流利度。
- 设置页 `app/settings/page.tsx`：Provider 预设、按提供商记忆配置(`provider-profiles`)、测试连接。

### 开发约定 / 已知坑（务必遵守）
- 本项目 ESLint(React 19) **禁止在 useEffect 内同步 setState**；读取 localStorage 等浏览器数据用 `hooks/useIsClient.ts` 派生，避免 SSR hydration 报错。
- 标准模式演示用 **DeepSeek**（OpenAI 兼容）。
- 若先跑过 `npm run build` 再 `npm run dev`，需先 `rm -rf frontend/.next` 再启动，且**确保没有旧 dev 进程仍占用 `.next`**，否则会报 `Cannot find module './xxx.js'` 或 `routes-manifest.json` 缺失。
- 提交只精确暂存相关文件，不要提交 `.kiro/`、`.npm-cache/`、`implementation_plan.md`。

---

## 目标语音架构（三段可配置）

把语音链路三段解耦，各自可选"浏览器免费"或"API 高质量"：

```
   ASR（语音转文字）          LLM（对话生成）            TTS（文字转语音）
 ┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
 │ Web Speech(免费) │     │ 现有 Provider 层  │     │ SpeechSynthesis  │
 │ 或 ASR API(可配) │ →   │ (多家 LLM 可配)   │ →   │(免费) 或 TTS API │
 └─────────────────┘     └──────────────────┘     └─────────────────┘
```

| 模式 | ASR | LLM | TTS | 需要 Key |
|------|-----|-----|-----|---------|
| 🟢 免费 | Web Speech | 内置话术池 / 免费 Gemini(可选) | SpeechSynthesis | ❌（Gemini 可选） |
| 🟡 标准 | Web Speech | 用户配置 LLM | SpeechSynthesis | ✅ LLM Key |
| 🔵 高级 | Web Speech 或 ASR API | 用户配置 LLM | SpeechSynthesis 或 TTS API | ✅ |

> 说明：相比绑死 OpenAI Realtime，"ASR + LLM + TTS 各自可配"更灵活、质量更可控，且避免 WebRTC 复杂度。原计划的 Realtime 模式列为可选。

---

## 剩余路线图（按优先级）

> 顺序建议：**先做 P0 强制项保证作品有效可交**，再按 P1 → P2 → P3 提升体验。每项单独开 PR。

### 🔴 P0 — 赛事强制提交物（最高优先，先做）

#### PR：README & 依赖声明  — 分支 `docs/readme`
- **[NEW/MODIFY] `README.md`**（仓库根目录）：
  - 项目简介、功能特色、亮点（多 Provider、零成本可用、双阶段纠错、可解释发音评测、断点续接）。
  - 截图 / GIF 占位；技术架构图（可用上面的三段图）。
  - 快速开始：`cd frontend && npm install && npm run dev`。
  - 支持的 API 提供商列表与配置说明（含免费 Gemini 引导）。
  - **依赖说明与原创部分声明**（赛事有效性硬性要求）；开源协议。
  - Demo 视频链接占位（部署后补）。
- **测试**：README 渲染正常、命令可照做跑起来。

#### PR：Vercel 部署  — 分支 `chore/deploy-vercel`
- 确认 `frontend/` 可被 Vercel 识别（Root Directory 设为 `frontend`）。
- 处理构建配置；环境变量（本项目 key 由用户前端填写，通常无需服务端 env）。
- 注意 Web Speech 需 HTTPS（Vercel 默认满足）。
- 线上端到端回归：免费模式全流程 + 标准模式全流程（用 DeepSeek）。
- 把线上地址写进 README。
- **测试**：线上可访问、可复现核心演示。

> Demo 视频为人工录制，非代码任务；脚本见文末"评审模拟流程"。录完把链接补进 README（可并入上面任一 PR 或单独提交）。

### 🟠 P1 — 高性价比体验提升

#### PR：连续录音 + 手动结束（修录音过早截断）  — 分支 `feat/continuous-stt`
**问题**：`lib/speech/speech-manager.ts` STT 用 `continuous=false`，一停顿就自动结束并发送，打断用户。
- **[MODIFY] `lib/speech/web-speech-stt.ts` / `speech-manager.ts`**：改为 `continuous=true`，持续累积 interim+final 文本，不在停顿时自动提交。
- **[MODIFY] `hooks/useWebSpeech.ts` / `useVoiceSession.ts`**：
  - 录音期间累积完整转写；只有用户**再次点击麦克风（停止）**才把整段提交给 AI（点一下开始、再点一下结束）。
  - 处理 continuous 模式下的 onend 自动重启，避免中途断流。
  - 更新麦克风按钮与状态文案（"正在聆听，说完再点一次结束"）。
- **测试**：长句、中途停顿都不会被提前发送；点停止后整段送出。

#### PR：更多 Provider 预设 + URL 归一化 + 获取模型列表  — 分支 `feat/provider-presets-models`
- **[MODIFY] `app/settings/page.tsx` `PROVIDER_PRESETS`**：新增
  - 智谱开放平台 `https://open.bigmodel.cn/api/paas/v4`（如 `glm-4-flash`）
  - OpenRouter `https://openrouter.ai/api/v1`
  - 硅基流动 SiliconFlow `https://api.siliconflow.cn/v1`
  - ModelScope 魔搭 `https://api-inference.modelscope.cn/v1`
- **[NEW] URL 归一化工具**：用户填的 Base URL 无论是 `.../`、`.../v1`、`.../v1/chat`、`.../v1/chat/completions`，都规整成统一 base，再由调用层拼 `/chat/completions` 与 `/models`。在 `provider.ts` 请求前统一归一化。
- **[NEW] `app/api/models/route.ts`**：服务端用用户 key 调 `GET {base}/models` 拉模型列表（避免前端暴露 key）。
- **[MODIFY] settings**：模型名称输入框旁加"获取模型列表"按钮 → 拉取后下拉选择；保留手填。
- **测试**：填 ModelScope 各种 URL 形态都能用；点"获取模型列表"能列出并选择；切换 provider 仍记忆各自配置。

### 🟡 P2 — 质量提升

#### PR：TTS API 接入（高级模式第一步）  — 分支 `feat/tts-api`
- **[NEW] TTS 抽象**：在 `lib/speech/` 增加可配置 TTS——浏览器 SpeechSynthesis（默认）或 TTS API（如 OpenAI `/audio/speech`，OpenAI 兼容）。
- **[NEW] `app/api/tts/route.ts`**：服务端代理 TTS 请求，返回音频；前端播放。
- **[MODIFY] settings**：TTS 来源选择（浏览器/API）+ 音色/语速。
- **[MODIFY] `useVoiceSession`**：AI 回复改用所选 TTS；支持句子级分段播放降低延迟。
- **测试**：API TTS 自然度明显优于浏览器；无 key/失败时回退浏览器 TTS。

#### PR：免费模式对话改进  — 分支 `feat/free-mode-improve`
- **策略 A（引导）**：首页/设置更醒目引导"填免费 Gemini Key 获得真实对话"。
- **策略 B（话术池）**：`useVoiceSession` 免费回复从"8 句循环"改为**场景化话术池** + 简单意图判断（陈述/提问）+ 复述用户关键词，让回复至少接得上。
- **测试**：免费模式回复不再机械重复、能贴合场景与用户输入。

### 🟢 P3 — 大工程 / 可选（时间够再做）

#### PR：ASR API 接入  — 分支 `feat/asr-api`
- 用 `MediaRecorder` 录制麦克风音频 → 上传到 ASR API（Whisper 兼容等）转写 → 替代 Web Speech，提升识别准确率。
- **[NEW] `app/api/asr/route.ts`** 服务端代理；处理音频格式、延迟、失败回退 Web Speech。
- 工程量最大（录音/上传/格式/延迟），排最后。

#### ⭐ 其它可选
- **学习记录趋势折线**（`feat/progress-chart`）：history 页加得分随时间折线 + 高频错误聚合。
- **首次引导 / 移动端适配 / 非 Chrome 提示**（`feat/onboarding-responsive`）。
- **Azure 专业发音评测**（`feat/azure-pronunciation`）：逐音素评分，无 key 降级本地。
- **OpenAI Realtime 模式**（`feat/realtime`）：WebRTC 语音到语音。

---

## Verification Plan

### 自动化
```bash
cd frontend
npm run build      # 编译 + 类型 + lint（本项目 lint 错误会使 build 失败）
```
- 建议给 `lib/analyzer.ts` 纯函数补轻量单测（如引入 vitest），对应"代码质量"评分。

### 手动验证（= Demo 视频脚本）
1. 首页 → 精美场景选择界面。
2. 免费模式（不配 key）选场景 → 对话数轮 → 看到实时纠错气泡。
3. 结束 → 课后报告（六维雷达图 + 发音/流利度可解释分 + 错误分析）。
4. 历史记录 → 看到记录与平均分；点击回看报告。
5. 标准模式（DeepSeek）重复，体现对话质量与纠错。
6. 创建自定义场景；练习中切走再回来验证断点续接。
7. （体验项做完后）连续录音不被打断、获取模型列表、API TTS 自然度。
8. 移动端 / 非 Chrome 兼容提示。

---

## 创新亮点（路演讲点）
| 亮点 | 说明 |
|------|------|
| 🔌 多 Provider + 三段可配 | ASR/LLM/TTS 各自可选浏览器或 API，一套代码适配多家 |
| 🆓 零成本可用 | 不填 key 即可用浏览器语音体验 |
| ⚖️ 双阶段纠错 | 对话中轻提示(tool call) + 课后深度报告 |
| 📊 可解释发音评测 | 基于识别置信度与语速的透明算法，敢讲依据 |
| ↩️ 断点续接 | 离开再回来对话不丢，自动恢复 |
| 🎨 暗色科技风 UI | 玻璃态 + 音频可视化 + 应用内统一弹框 |


---

# 🔄 交接说明 v5（新会话从这里开始读）

> 本节是最新的权威进度与剩余计划，覆盖上文旧路线图中已完成的部分。

## 当前进度（GitHub PR）
- **#1–#16 已合并 main**：MVP 主线 + UI 打磨 + 断点续接 + README(#11) + Vercel 部署(#12) + 连续录音(#13) + 多 Provider/获取模型列表(#14) + 免费模式场景化话术(#15) + 历史成绩趋势折线与高频纠错聚合(#16)。
- **#17 `feat/free-mode-llm`（已本地提交 commit 414e294，待 push/PR/合并）**：免费模式改为服务端内置 LLM（智谱 glm-4.5-air）真实对话 + 实时纠错，env 缺失回退本地话术。**本地已验证“检查无误”。**
  - 待办（用户在终端手动执行）：push 分支 → 建 PR → 合并 → 同步 main。
  - **线上生效需在 Vercel 配置环境变量**：`FREE_LLM_PROVIDER=zhipu`、`FREE_LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4`、`FREE_LLM_MODEL=glm-4.5-air`、`FREE_LLM_API_KEY=<你的智谱key>`。
  - **安全**：智谱 key 曾在对话中明文出现，建议到智谱后台重置后再用于 `.env.local` 与 Vercel。

## 线上 / 部署
- 线上地址：https://ai-english-coach-ruby.vercel.app/ （Vercel Git 集成，push main 自动重部署）。
- 本地密钥在 `frontend/.env.local`（已 gitignore，不入库）；`frontend/.env.example` 为说明模板（入库）。

## 三种语音模式的目标设计（核心方向 · 已定稿 v6）
把语音链路做成三段（ASR + LLM + TTS），**引擎跟随模式**，标准/高级可叠加用户自配：

| 模式 | ASR 识别 | LLM 对话 | TTS 发音 | 用户需配置 |
|------|----------|----------|----------|-----------|
| 🟢 免费 | 浏览器 Web Speech | 服务端内置(智谱 glm-4.5-air)，缺失回退本地话术 | 浏览器 SpeechSynthesis | 无（零配置） |
| 🟡 标准 | 浏览器 Web Speech | **内置智谱 或 自己配置(二选一)** | **服务端内置小米(免费)，失败回退浏览器** | 可选配 LLM（默认内置） |
| 🔵 高级 | **内置硅基(默认) 或 自填 ASR API** | **内置智谱 或 自己配置(二选一)** | **内置小米(默认) 或 自填 TTS API** | 可选 |

要点：
- 内置 LLM = 服务端 `FREE_LLM_*`（智谱）；标准/高级也能选用，`useServerKey` 走 `/api/chat`。
- 标准模式 TTS 用服务端内置小米（`XIAOMI_TTS_API_KEY`），无 key 自动回退浏览器。
- 高级模式 ASR/TTS 默认用服务端内置（硅基/小米），用户可在高级页自填自己的 key/base/model。
- 引擎由 voiceMode 决定（免费/标准强制对应引擎），用户自配的 LLM/ASR/TTS 凭据持久保存(`api-config` + `provider-profiles`)。
- 原 OpenAI Realtime 占位（`useRealtimeSession.ts`）→ **删除**；`voiceMode` 的 `realtime` 重命名为 `advanced`，旧存档自动迁移。

## 剩余开发计划（按优先级，每个单独 PR）

### P0｜先把 #17 收尾（push/PR/合并 + Vercel 配 env）

### P1｜`feat/tts-api` — 可配置 TTS（最直接改善“AI 发音人机”）
- **目标**：高级模式用 TTS API 合成更自然的语音；浏览器 TTS 作为默认/回退。
- **小米 TTS**：文档 https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5 ，模型 `mimo-v2.5-tts`。**动手前先读该文档确认**：endpoint、鉴权方式、请求体字段、返回音频格式（很可能不是 OpenAI `/audio/speech` 形态，需要写“小米适配器”）。
- **新增** `app/api/tts/route.ts`：服务端代理，接收文本→调小米 TTS→返回音频二进制（key 走服务端 env，不出前端）。
- **新增** `lib/speech/` 下 TTS 抽象：`browser`（现有 SpeechSynthesis）/ `api`（小米）两种实现，统一接口；API 失败回退浏览器。
- **设置页**：TTS 来源选择（浏览器/API）+ 音色/语速；可配 base/key/model（默认小米）。建议 TTS key 也走服务端 env（如 `XIAOMI_TTS_API_KEY`），或允许用户前端填。
- **useVoiceSession**：AI 回复改用所选 TTS；支持句子级分段播放降低延迟。
- **测试**：API TTS 自然度优于浏览器；无 key/失败回退浏览器。

### P2｜`feat/asr-api` — 可配置 ASR（解决“识别差 + 录音过早结束”）
- **根因**：浏览器 Web Speech 准确率有限、静音会自动结束。根治=API ASR。
- **方案**：用 `MediaRecorder` 录制整段音频（完全由用户点“停止”才结束，不会被停顿截断）→ 上传 ASR API → 返回转写。
- **ASR 默认**：硅基流动 `TeleAI/TeleSpeechASR`，base `https://api.siliconflow.cn/v1`，OpenAI 兼容 `POST /audio/transcriptions`（multipart）。**动手前确认该模型的请求参数与音频格式要求**。
- **新增** `app/api/asr/route.ts`：服务端代理（multipart 转发，key 走服务端/用户配置）；处理音频格式、失败回退 Web Speech。
- **设置页**：ASR 来源选择（浏览器/API）+ model。
- **useVoiceSession / useWebSpeech**：高级模式走 MediaRecorder→API；免费/标准仍用 Web Speech。注意录音权限、格式(webm/opus 或 wav)、延迟、错误回退。
- **测试**：识别准确率明显提升；长句/停顿不被截断；失败回退浏览器。

### P3｜`feat/advanced-mode` — 三模式语义定稿 + 引擎随模式 + 删 Realtime（进行中）
- 按 v6 模式表实现：免费(浏览器+内置智谱+浏览器)；标准(浏览器ASR+内置/自配LLM+内置小米TTS)；高级(内置/自配ASR + 内置/自配LLM + 内置/自配TTS)。
- `voiceMode` `realtime`→`advanced`，旧存档迁移；删除 `useRealtimeSession.ts` 与设置页“选高级即强制 OpenAI”逻辑。
- 新增 `llmSource: 'builtin'|'custom'`（标准/高级）；高级新增 `asrUseCustomApi`/`ttsUseCustomApi`；引擎由模式派生，免费/标准强制浏览器ASR、标准/高级强制小米TTS。
- 设置页按模式呈现配置项；用户自配凭据持久保存（`api-config` + `provider-profiles`）。更新 README 模式表。
- 状态：✅ #18 feat/tts-api、✅ #19 fix/voice-mode-label、✅ #20 feat/asr-api 已合并；本项进行中。

### P4｜Demo 视频（赛事强制提交物，非代码）
- 用声音讲解 + 演示核心模块，传 B 站/云盘，链接补进 README。脚本见旧路线图“手动验证”一节。

### 可选加分
- 练习结束自动生成报告（让趋势图/历史更完整）；移动端适配 + 非 Chrome 提示；给 analyzer/free-coach 等纯函数补 vitest 单测。

## 关键技术约定 / 已知坑（务必遵守）
- 纯前端 Next.js 15 (App Router) + React 19 + Vanilla CSS，代码在 `frontend/`。
- 持久化用 `lib/storage.ts`（localStorage 封装，非 IndexedDB）。
- ESLint(React 19) 禁止在 useEffect 内同步 setState；读 localStorage 用 `hooks/useIsClient.ts` 派生，避免 SSR hydration 报错。点击外部收起等用 document 事件监听（注意祖先 backdrop-filter 会限制 position:fixed）。
- 服务端代理统一放 `app/api/*`，第三方 key 走服务端 env 或用户前端填，不硬编码、不入库。
- 先 `npm run build` 再 `npm run dev` 时，需先 `rm -rf frontend/.next` 且无旧 dev 进程占用，否则报 `Cannot find module './xxx.js'` 或 routes-manifest 缺失。
- 提交只精确暂存相关文件，**不要提交** `.kiro/`、`.npm-cache/`、`implementation_plan.md`、`frontend/.env.local`。

## 工作流（严格遵守）
1. 有不确定随时问用户。2. 写完代码先 `cd frontend && npm run build` 自检无误 → 暂停让用户浏览器验证。3. 用户说“检查无误”后才走 git 提交。4. 每个 PR 只做一件事；新分支开发；commit/PR 描述含 ①标题 ②功能描述 ③实现思路 ④测试方式；用 gh 建 PR 合并到 main；合并后同步 main 再 build 确认。
