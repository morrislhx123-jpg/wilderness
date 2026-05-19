const CONSULT_CONFIG = {
  // 部署 Cloudflare Worker 后，把这里改成 Worker 地址。
  // 例如：https://ai-consultant.your-name.workers.dev/chat
  endpoint: "https://wilderness-ai-consultant.wilderness-ai.workers.dev/chat",
  freePoints: 30,
  chatCost: 1,
  maxMessages: 16,
};

const STORAGE_KEY = "wilderness_ai_consult_state_v1";

const messagesEl = document.querySelector("#messages");
const pointsText = document.querySelector("#pointsText");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const quickButtons = document.querySelectorAll(".quick-prompts button");

const welcomeMessage =
  "你好，我是旷野行动的AI自媒体策略顾问。你可以直接告诉我：你做什么业务、想做哪个平台、现在卡在哪里。我会先帮你判断适不适合内容订阅，以及下一步该怎么开始。";

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.messages) && Number.isFinite(saved.points)) {
      return {
        ...saved,
        points: Math.min(saved.points, CONSULT_CONFIG.freePoints),
        deviceId: saved.deviceId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      };
    }
  } catch (error) {
    console.warn("Failed to load consult state", error);
  }
  return {
    points: CONSULT_CONFIG.freePoints,
    messages: [{ role: "assistant", content: welcomeMessage }],
    deviceId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updatePoints() {
  pointsText.textContent = `${state.points} / ${CONSULT_CONFIG.freePoints}`;
}

function renderMessages() {
  messagesEl.innerHTML = "";
  state.messages.forEach((message) => {
    const item = document.createElement("div");
    item.className = `message ${message.role === "user" ? "user" : "ai"}`;
    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = message.content;
    item.appendChild(content);
    messagesEl.appendChild(item);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
  updatePoints();
}

function addMessage(role, content) {
  state.messages.push({ role, content });
  if (state.messages.length > CONSULT_CONFIG.maxMessages) {
    const first = state.messages[0];
    state.messages = [first, ...state.messages.slice(-CONSULT_CONFIG.maxMessages + 1)];
  }
  saveState();
  renderMessages();
}

function addError(content) {
  const item = document.createElement("div");
  item.className = "message error";
  const body = document.createElement("div");
  body.className = "message-content";
  body.textContent = content;
  item.appendChild(body);
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setLoading(isLoading) {
  sendButton.disabled = isLoading;
  sendButton.textContent = isLoading ? "思考中" : "发送";
  input.disabled = isLoading;
}

async function sendMessage(text) {
  if (!text.trim()) return;
  if (state.points < CONSULT_CONFIG.chatCost) {
    addError("免费咨询积分已经用完。你可以添加微信购买39元试用包，获得更完整的赛道分析、用户分析和2条样例内容。");
    trackEvent("points_empty", { points: state.points });
    return;
  }
  if (CONSULT_CONFIG.endpoint.includes("YOUR_WORKER_SUBDOMAIN")) {
    addError("AI接口还没有配置。请先部署 Cloudflare Worker，并在 consult.js 里填写 Worker 地址。");
    return;
  }

  addMessage("user", text.trim());
  state.points -= CONSULT_CONFIG.chatCost;
  saveState();
  updatePoints();
  trackEvent("chat_send", {
    pointsLeft: state.points,
    messageLength: text.trim().length,
  });
  setLoading(true);

  try {
    const response = await fetch(CONSULT_CONFIG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: state.deviceId,
        messages: state.messages
          .filter((message) => ["user", "assistant"].includes(message.role))
          .map((message) => ({
            role: message.role,
            content: message.content,
          })),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "AI接口暂时不可用");
    }

    const reply = data.reply || "我刚刚没有拿到有效回复，你可以换一种说法再试一次。";
    addMessage("assistant", reply);
    if (state.points < CONSULT_CONFIG.chatCost) {
      trackEvent("points_empty", { points: state.points });
    }
  } catch (error) {
    state.points += CONSULT_CONFIG.chatCost;
    saveState();
    updatePoints();
    addError(`刚刚没有连接成功：${error.message}。如果持续失败，可以先截图发给Morris。`);
  } finally {
    setLoading(false);
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value;
  input.value = "";
  sendMessage(text);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    form.requestSubmit();
  }
});

quickButtons.forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.textContent;
    trackEvent("quick_prompt_click", { text: button.textContent });
    input.focus();
  });
});

renderMessages();

function trackEvent(eventName, detail) {
  if (window.WildernessAnalytics) {
    window.WildernessAnalytics.track(eventName, {
      deviceId: state.deviceId,
      ...(detail || {}),
    });
  }
}
