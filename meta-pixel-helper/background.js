const PIXEL_URL_PATTERNS = [
  '*://www.facebook.com/tr*',
  '*://facebook.com/tr*',
  '*://connect.facebook.net/*',
  '*://www.facebook.com/events*',
  '*://facebook.com/events*'
];

const UD_KEYS = ['fn', 'ln', 'em', 'ph', 'ct', 'st', 'zp', 'country', 'external_id', 'ge', 'db'];

// ── Standard events ──
const STANDARD_EVENTS = new Set([
  'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
  'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead',
  'CompleteRegistration', 'Contact', 'CustomizeProduct', 'Donate',
  'FindLocation', 'Schedule', 'StartTrial', 'SubmitApplication', 'Subscribe'
]);

const tabData = new Map();

const pendingRequests = new Map();

const pollingIntervals = new Map();

// ── Helpers ──

function getTabData(tabId) {
  if (!tabData.has(tabId)) {
    tabData.set(tabId, { url: '', pixels: {}, totalEvents: 0 });
  }
  return tabData.get(tabId);
}

function updateBadge(tabId) {
  const data = tabData.get(tabId);
  if (data && data.totalEvents > 0) {
    chrome.action.setBadgeText({ text: String(data.totalEvents), tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#1877F2', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

function adjustTotalEvents(tabId) {
  const data = tabData.get(tabId);
  if (!data) return;
  let total = 0;
  for (const pixel of Object.values(data.pixels)) {
    for (const event of pixel.events) {
      if (event.eventName !== 'SubscribedButtonClick') {
        total++;
      }
    }
  }
  data.totalEvents = total;
  updateBadge(tabId);
}

function normalizeRequest(details) {
  const urlObj = new URL(details.url);
  const params = new URLSearchParams(urlObj.search);

  const pixelId = params.get('id');
  if (pixelId) return params;

  if (details.requestBody) {
    if (details.requestBody.formData) {
      const formParams = new URLSearchParams();
      for (const [key, values] of Object.entries(details.requestBody.formData)) {
        if (Array.isArray(values)) formParams.set(key, values[0]);
      }
      if (formParams.get('id') || formParams.get('ev')) {
        for (const [key, value] of params.entries()) {
          if (!formParams.has(key)) formParams.set(key, value);
        }
        return formParams;
      }
    }
    if (details.requestBody.raw && details.requestBody.raw.length > 0) {
      try {
        const decoder = new TextDecoder();
        const body = decoder.decode(details.requestBody.raw[0].bytes);
        const bodyParams = new URLSearchParams(body);
        if (bodyParams.get('id') || bodyParams.get('ev')) {
          for (const [key, value] of params.entries()) {
            if (!bodyParams.has(key)) bodyParams.set(key, value);
          }
          return bodyParams;
        }
      } catch (e) { /* ignore */ }
    }
  }

  return null;
}

function parsePixelEvent(params, requestUrl) {
  const pixelId = params.get('id');
  const eventName = params.get('ev');
  if (!pixelId || !eventName) return null;

  // ── Advanced Matching (ensure country shows) ──
  const advancedMatching = {};
  for (const key of UD_KEYS) {
    let value = params.get(`ud[${key}]`);
    if (!value) value = params.get(`ud[${key.toLowerCase()}]`);
    if (value) advancedMatching[key] = decodeURIComponent(value);
  }

  // ── Custom data ──
  const customParams = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith('cd[') && key.endsWith(']')) {
      customParams[key.slice(3, -1)] = value;
    }
  }

  return {
    pixelId,
    eventName,
    timestamp: params.get('ts') ? parseInt(params.get('ts'), 10) : Date.now(),
    urlCalled: requestUrl,
    isStandardEvent: STANDARD_EVENTS.has(eventName),
    advancedMatching,
    customParams,
    eventInfo: {
      documentLocation: params.get('dl') || '',
      documentTitle: params.get('dt') || '',
      referrer: params.get('rl') || '',
      screenWidth: params.get('sw') || '',
      screenHeight: params.get('sh') || '',
      pixelVersion: params.get('v') || '',
      eventId: params.get('eid') || '',
    },
    cookies: {
      fbp: params.get('fbp') || '',
      fbc: params.get('fbc') || '',
    },
    loadTime: null,
    status: 'success',
    requestId: null
  };
}

// ── webRequest: onBeforeRequest ──
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    if (details.initiator && details.initiator.startsWith('chrome-extension://')) return;
    if (!details.url.includes('facebook.com/tr')) return;

    const params = normalizeRequest(details);
    if (!params) return;

    const parsed = parsePixelEvent(params, details.url);
    if (!parsed) return;

    parsed.requestId = details.requestId;
    pendingRequests.set(details.requestId, {
      tabId: details.tabId,
      pixelId: parsed.pixelId,
      eventName: parsed.eventName,
      requestStartTime: details.timeStamp
    });

    const data = getTabData(details.tabId);
    const { pixelId } = parsed;
    if (!data.pixels[pixelId]) data.pixels[pixelId] = { id: pixelId, name: null, events: [] };
    data.pixels[pixelId].events.push(parsed);

    if (parsed.eventName !== 'SubscribedButtonClick') data.totalEvents++;

    updateBadge(details.tabId);
  },
  { urls: PIXEL_URL_PATTERNS },
  ['requestBody']
);

// ── webRequest: onCompleted ──
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const pending = pendingRequests.get(details.requestId);
    if (pending) {
      const loadTime = (details.timeStamp - pending.requestStartTime).toFixed(2);
      const data = tabData.get(pending.tabId);
      if (data && data.pixels[pending.pixelId]) {
        const events = data.pixels[pending.pixelId].events;
        for (let i = events.length - 1; i >= 0; i--) {
          if (events[i].requestId === details.requestId) {
            events[i].loadTime = loadTime;
            break;
          }
        }
      }
      pendingRequests.delete(details.requestId);
      return;
    }

    if (!details.url.includes('facebook.com/tr')) return;

    try {
      const urlObj = new URL(details.url);
      const params = new URLSearchParams(urlObj.search);
      const parsed = parsePixelEvent(params, details.url);
      if (!parsed) return;

      const data = tabData.get(details.tabId);
      if (data) {
        const alreadyCaptured = Object.values(data.pixels)
          .flatMap(p => p.events)
          .some(e => e.urlCalled === details.url && e.eventName === parsed.eventName);
        if (alreadyCaptured) return;
      }

      const tabEntry = getTabData(details.tabId);
      if (!tabEntry.pixels[parsed.pixelId]) tabEntry.pixels[parsed.pixelId] = { id: parsed.pixelId, name: null, events: [] };

      tabEntry.pixels[parsed.pixelId].events.push(parsed);

      if (parsed.eventName !== 'SubscribedButtonClick') tabEntry.totalEvents++;

      updateBadge(details.tabId);
    } catch (e) { }
  },
  { urls: PIXEL_URL_PATTERNS }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => pendingRequests.delete(details.requestId),
  { urls: PIXEL_URL_PATTERNS }
);

// ── Runtime Pixel Polling ──
function startPolling(tabId) {
  stopPolling(tabId);
  const intervalId = setInterval(() => checkForRuntimePixels(tabId), 3000);
  pollingIntervals.set(tabId, intervalId);
  checkForRuntimePixels(tabId);
}

function stopPolling(tabId) {
  const intervalId = pollingIntervals.get(tabId);
  if (intervalId) {
    clearInterval(intervalId);
    pollingIntervals.delete(tabId);
  }
}

async function checkForRuntimePixels(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        try {
          if (!window.fbq) return [];
          const pixels = [];
          if (window.fbq.instance && window.fbq.instance.pixelsByID) {
            for (const id in window.fbq.instance.pixelsByID) {
              if (Object.prototype.hasOwnProperty.call(window.fbq.instance.pixelsByID, id)) {
                pixels.push({ id, name: window.fbq.instance.pixelsByID[id].name || null });
              }
            }
          }
          if (pixels.length === 0 && window.fbq._pixelById) {
            for (const id in window.fbq._pixelById) {
              if (Object.prototype.hasOwnProperty.call(window.fbq._pixelById, id)) {
                pixels.push({ id, name: window.fbq._pixelById[id].name || null });
              }
            }
          }
          if (pixels.length === 0 && typeof window.fbq.getState === 'function') {
            try {
              const state = window.fbq.getState();
              if (state && state.pixels) state.pixels.forEach(p => pixels.push({ id: p.id, name: p.name || null }));
            } catch (e) { }
          }
          return pixels;
        } catch (e) { return []; }
      },
      world: 'MAIN'
    });

    if (!results) return;
    const data = getTabData(tabId);

    for (const frameResult of results) {
      if (!frameResult.result || !Array.isArray(frameResult.result)) continue;
      for (const pixel of frameResult.result) {
        if (!pixel.id) continue;
        if (!data.pixels[pixel.id]) data.pixels[pixel.id] = { id: pixel.id, name: pixel.name || 'Facebook Pixel', events: [] };
        else if (pixel.name && !data.pixels[pixel.id].name) data.pixels[pixel.id].name = pixel.name;
      }
    }

    adjustTotalEvents(tabId);
  } catch (e) {
    if (e.message && (e.message.includes('No tab') || e.message.includes('Cannot access'))) stopPolling(tabId);
  }
}

// ── Navigation tracking ──
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  tabData.delete(details.tabId);
  pendingRequests.forEach((val, key) => {
    if (val.tabId === details.tabId) pendingRequests.delete(key);
  });
  updateBadge(details.tabId);
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0) startPolling(details.tabId);
});

// ── Tab cleanup ──
chrome.tabs.onRemoved.addListener((tabId) => {
  tabData.delete(tabId);
  stopPolling(tabId);
  pendingRequests.forEach((val, key) => {
    if (val.tabId === tabId) pendingRequests.delete(key);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') startPolling(tabId);
});

// ── Message handling ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getPixelData') {
    const data = tabData.get(message.tabId);
    sendResponse({ data: data || { url: '', pixels: {}, totalEvents: 0 } });
    return true;
  }

  if (message.type === 'pixelDetected' && sender.tab) {
    const tabId = sender.tab.id;
    const data = getTabData(tabId);
    data.url = sender.tab.url || '';

    if (message.pixelId) {
      if (!data.pixels[message.pixelId]) {
        data.pixels[message.pixelId] = { id: message.pixelId, name: message.pixelName || 'Facebook Pixel', events: [] };
      } else if (message.pixelName) {
        data.pixels[message.pixelId].name = message.pixelName;
      }
    }
    adjustTotalEvents(tabId);
    sendResponse({ ok: true });
    return true;
  }
});
