# Kimi K3 本地聊天 UI (Local Dedicated Chat UI)

专为 **moonshotai/kimi-k3** 打造的轻量、本地运行聊天工具。后端通过 NVIDIA Build API (`https://integrate.api.nvidia.com/v1/chat/completions`) 调用模型，支持原生深度思考 Reasoning、长等待保活与即时 System Prompt 调控。

---

## 快速开始

### 1. 安装依赖
由于本项目完全由您自主管理 npm 镜像源与依赖安装，请在项目根目录下执行：
```bash
npm install
```

### 2. 配置环境变量
在项目根目录创建 `.env` 文件（或复制 `.env.example`）：
```bash
cp .env.example .env
```
编辑 `.env` 文件，填入您的 NVIDIA API Key：
```env
# 从 https://build.nvidia.com 获取的 Key (以 nvapi- 开头)
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 本地服务端口 (默认 3001)
PORT=3001

# 单次请求超时时间 (毫秒)，默认 30 分钟 (1800000 ms)
REQUEST_TIMEOUT_MS=1800000
```

### 3. 启动开发环境
使用一条命令同时启动后端服务（端口 3001）与前端界面（端口 5173）：
```bash
npm run dev
```

在浏览器中打开：
```text
http://localhost:5173
```

---

## 核心特性

- 🧠 **独立 Reasoning 显示**：完整拆分展示 `reasoning_content`（深度思考过程）与最终 `content`（正式回答），支持折叠/展开与独立一键复制。
- ⚙️ **官方标准参数**：支持 `Reasoning Effort` 三档自由切换（Low / High / Max，默认 High）；支持调节 Max Tokens（默认 16384）与 Temperature（默认 1.0）。
- 📝 **即时 System Prompt**：输入框上方可直接修改 System Prompt，即刻对下一次请求生效，作为标准首条 `system` 消息发送，不隐式注入任何隐形指令。
- ⏳ **长等待与心跳保活**：默认 30 分钟超长超时支持，并在流式静默期发送 SSE Keep-Alive 心跳注释，防止网络代理提前中断。
- 🛑 **随时终止 (Stop)**：支持一键中止当前生成，保留已接收的局部思考和正文，后端同步取消 NVIDIA 上游请求。
- 💬 **上下文连贯性**：多轮对话严格遵照 NVIDIA K3 OpenAPI 规范回传历史 `reasoning_content`，避免多轮推理上下文丢失。
- ✏️ **便捷交互**：支持编辑用户历史消息并截断重跑、重新生成最新回答、对话清空与新建。
- 💾 **本地自动保存**：基于 `localStorage` 实时保存对话与参数，刷新页面即刻无缝恢复。
- 🛡️ **安全隔离**：API Key 仅存放于后端 `.env`，前端绝不暴露，后端日志自动对密钥脱敏输出。
