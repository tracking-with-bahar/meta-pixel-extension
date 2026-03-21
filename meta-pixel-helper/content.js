(function () {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const data = event.data;
    if (
      data != null &&
      typeof data === 'object' &&
      data.action === 'FB_LOG' &&
      data.logType === 'Meta Pixel Error' &&
      data.error != null
    ) {
      chrome.runtime.sendMessage({
        type: 'PIXEL_USER_ERROR',
        payload: {
          logMessage: data.logMessage,
          error: data.error,
          pixelId: data.pixelId ?? null,
          url: data.url
        }
      });
    }
  });
})();
