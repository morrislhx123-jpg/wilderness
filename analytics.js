(function () {
  const ANALYTICS_CONFIG = {
    endpoint: "https://wilderness-ai-consultant.wilderness-ai.workers.dev/track",
    storageKey: "wilderness_ai_analytics_device_v1",
  };

  function getDeviceId() {
    try {
      let id = localStorage.getItem(ANALYTICS_CONFIG.storageKey);
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        localStorage.setItem(ANALYTICS_CONFIG.storageKey, id);
      }
      return id;
    } catch (error) {
      return "unknown";
    }
  }

  function track(eventName, detail) {
    if (!ANALYTICS_CONFIG.endpoint || ANALYTICS_CONFIG.endpoint.includes("YOUR_WORKER_SUBDOMAIN")) {
      return;
    }
    const payload = {
      event: eventName,
      detail: detail || {},
      deviceId: getDeviceId(),
      page: location.pathname,
      url: location.href,
      referrer: document.referrer || "",
      title: document.title,
      ts: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ANALYTICS_CONFIG.endpoint, blob);
      return;
    }

    fetch(ANALYTICS_CONFIG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  window.WildernessAnalytics = { track, getDeviceId };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => track("page_view"));
  } else {
    track("page_view");
  }
})();
