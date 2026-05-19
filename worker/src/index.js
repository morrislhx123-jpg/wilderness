import system from "./knowledge/system.md";
import service from "./knowledge/service.md";
import methodology from "./knowledge/methodology.md";
import intake from "./knowledge/intake.md";
import faq from "./knowledge/faq.md";
import cases from "./knowledge/cases.md";

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_DAILY_IP_LIMIT = 80;
const MAX_USER_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 1400;
const DEFAULT_LOG_LIMIT = 80;

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = buildCorsHeaders(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true }, corsHeaders);
    }

    if (url.pathname === "/track" && request.method === "POST") {
      return handleTrack(request, env, corsHeaders, ctx);
    }

    if (url.pathname === "/admin/logs" && request.method === "GET") {
      return handleLogs(url, env, corsHeaders);
    }

    if (url.pathname !== "/chat" || request.method !== "POST") {
      return json({ error: "Not found" }, corsHeaders, 404);
    }

    try {
      if (!env.DEEPSEEK_API_KEY) {
        return json({ error: "DeepSeek API Key 还没有配置" }, corsHeaders, 500);
      }

      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const limitResult = await checkIpLimit(env, ip);
      if (!limitResult.allowed) {
        return json({ error: "今天的免费咨询次数已经比较多了，可以明天再试，或添加Morris继续咨询。" }, corsHeaders, 429);
      }

      const body = await request.json();
      const messages = sanitizeMessages(body.messages);
      if (!messages.length) {
        return json({ error: "请输入你想咨询的问题" }, corsHeaders, 400);
      }

      const payload = {
        model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          ...messages,
        ],
        temperature: Number(env.DEEPSEEK_TEMPERATURE || 0.45),
        max_tokens: Number(env.DEEPSEEK_MAX_TOKENS || 900),
      };

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.error?.message || "DeepSeek 接口暂时不可用";
        return json({ error: detail }, corsHeaders, response.status);
      }

      const reply = data?.choices?.[0]?.message?.content?.trim();
      const finalReply = reply || "我刚刚没有生成有效回复，你可以换一种说法再问一次。";
      ctx.waitUntil(writeLog(env, {
        type: "chat",
        deviceId: sanitizeText(body.deviceId, 80),
        ipHash: await hashIp(ip),
        userMessage: lastUserMessage(messages),
        aiReply: finalReply,
        messageCount: messages.length,
        model: payload.model,
        usage: data?.usage || null,
      }));
      return json({ reply: finalReply }, corsHeaders);
    } catch (error) {
      return json({ error: error.message || "服务器暂时不可用" }, corsHeaders, 500);
    }
  },
};

function buildSystemPrompt() {
  return [
    system,
    "\n\n# 服务规则\n",
    service,
    "\n\n# 策略方法论\n",
    methodology,
    "\n\n# 资料收集与启动方法\n",
    intake,
    "\n\n# 常见问题\n",
    faq,
    "\n\n# 案例资料\n",
    cases,
    "\n\n请始终基于以上知识回答。优先帮助用户做适配判断、方向梳理、资料准备和下一步选择。如果用户需要购买、付款、人工确认或复杂判断，引导添加 Morris 微信。回答尽量控制在 500 字以内，不要一次性甩完整资料表。",
  ].join("");
}

async function handleTrack(request, env, corsHeaders, ctx) {
  try {
    const body = await request.json();
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    ctx.waitUntil(writeLog(env, {
      type: "event",
      event: sanitizeText(body.event, 80),
      deviceId: sanitizeText(body.deviceId, 80),
      ipHash: await hashIp(ip),
      page: sanitizeText(body.page, 180),
      url: sanitizeText(body.url, 500),
      referrer: sanitizeText(body.referrer, 500),
      title: sanitizeText(body.title, 160),
      detail: sanitizeObject(body.detail),
    }));
    return json({ ok: true }, corsHeaders);
  } catch (error) {
    return json({ error: "日志记录失败" }, corsHeaders, 400);
  }
}

async function handleLogs(url, env, corsHeaders) {
  if (!env.LOGS_KV) {
    return json({ error: "LOGS_KV 还没有配置" }, corsHeaders, 500);
  }
  if (!env.ADMIN_KEY) {
    return json({ error: "ADMIN_KEY 还没有配置" }, corsHeaders, 500);
  }
  if (url.searchParams.get("key") !== env.ADMIN_KEY) {
    return json({ error: "没有权限" }, corsHeaders, 401);
  }

  const limit = Math.min(Number(url.searchParams.get("limit") || DEFAULT_LOG_LIMIT), 200);
  const list = await env.LOGS_KV.list({ prefix: "log:", limit });
  const logs = await Promise.all(
    list.keys.map(async (item) => {
      const raw = await env.LOGS_KV.get(item.name);
      try {
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return { key: item.name, raw };
      }
    })
  );

  logs.sort((a, b) => String(b?.ts || "").localeCompare(String(a?.ts || "")));
  return json({
    count: logs.filter(Boolean).length,
    logs: logs.filter(Boolean),
  }, corsHeaders);
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && ["user", "assistant"].includes(message.role))
    .slice(-MAX_USER_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(0, MAX_MESSAGE_LENGTH),
    }))
    .filter((message) => message.content.trim());
}

function lastUserMessage(messages) {
  const found = [...messages].reverse().find((message) => message.role === "user");
  return found ? found.content : "";
}

async function writeLog(env, log) {
  if (!env.LOGS_KV) return;
  const ts = new Date().toISOString();
  const random = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2);
  const key = `log:${ts}:${random}`;
  await env.LOGS_KV.put(key, JSON.stringify({
    ts,
    ...log,
  }), { expirationTtl: Number(env.LOG_TTL_SECONDS || 60 * 60 * 24 * 90) });
}

async function hashIp(ip) {
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function sanitizeText(value, maxLength) {
  return String(value || "").slice(0, maxLength);
}

function sanitizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 20)
      .map(([key, item]) => [sanitizeText(key, 80), sanitizeText(item, 500)])
  );
}

async function checkIpLimit(env, ip) {
  if (!env.USAGE_KV) return { allowed: true };
  const limit = Number(env.DAILY_IP_LIMIT || DEFAULT_DAILY_IP_LIMIT);
  const date = new Date().toISOString().slice(0, 10);
  const key = `ip:${date}:${ip}`;
  const current = Number((await env.USAGE_KV.get(key)) || 0);
  if (current >= limit) {
    return { allowed: false, current };
  }
  await env.USAGE_KV.put(key, String(current + 1), { expirationTtl: 60 * 60 * 36 });
  return { allowed: true, current: current + 1 };
}

function buildCorsHeaders(env) {
  const origin = env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
