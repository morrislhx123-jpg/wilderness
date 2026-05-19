# 旷野行动 AI 咨询 Worker

这个目录是 Cloudflare Worker 后端模板，用来安全调用 DeepSeek API。

前端页面放在网站根目录：

- `consult.html`
- `consult.css`
- `consult.js`

## 你需要配置的地方

### 1. DeepSeek API Key

不要把 API Key 写进代码。

部署到 Cloudflare 后，在 Worker 的环境变量/Secrets 里设置：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
```

如果用命令行，可以执行：

```powershell
npx wrangler secret put DEEPSEEK_API_KEY
```

### 2. 前端接口地址

部署 Worker 后，会得到一个地址，例如：

```text
https://wilderness-ai-consultant.xxx.workers.dev
```

把 `consult.js` 里的：

```js
endpoint: "https://YOUR_WORKER_SUBDOMAIN.workers.dev/chat"
```

改成：

```js
endpoint: "https://wilderness-ai-consultant.xxx.workers.dev/chat"
```

### 3. Skill 和知识库

修改这些文件即可调整 AI 的能力：

- `src/knowledge/system.md`：AI 角色、语气、边界。
- `src/knowledge/service.md`：服务介绍、价格、交付规则。
- `src/knowledge/methodology.md`：你的自媒体策略方法论。
- `src/knowledge/faq.md`：常见问题。
- `src/knowledge/cases.md`：案例和数据。

改完后重新部署 Worker。

### 4. 聊天和访问日志

如果要看到用户访问、点击和聊天内容，需要创建一个 Cloudflare KV，并绑定为：

```text
LOGS_KV
```

然后在 Worker 的环境变量/Secrets 里设置一个管理员密码：

```text
ADMIN_KEY=你自己设置的查看密码
```

部署后访问：

```text
https://你的Worker地址/admin/logs?key=你的查看密码
```

即可看到最近日志。

当前会记录：

- 进入主网页
- 进入咨询页
- 点击快捷问题
- 发送消息
- 积分用完
- 用户和 AI 的对话内容

为了隐私，日志里不会保存完整 IP，只保存一个简化后的 IP 标识。

## 可选：IP 限制

如果要启用后端 IP 每日限额，需要在 Cloudflare 创建 KV 命名空间，然后在 `wrangler.toml` 里绑定：

```toml
[[kv_namespaces]]
binding = "USAGE_KV"
id = "你的KV命名空间ID"
```

如果不绑定 KV，前端仍然会按浏览器设备记录免费积分，但后端不做 IP 限制。

## 本地开发

```powershell
cd worker
npm install
npx wrangler dev
```

本地测试时可以把 `consult.js` 的 `endpoint` 暂时改成 Wrangler 给出的本地地址。
