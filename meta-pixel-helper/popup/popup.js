document.addEventListener('DOMContentLoaded', async () => {
  const pixelListEl = document.getElementById('pixelList');
  const emptyStateEl = document.getElementById('emptyState');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.runtime.sendMessage(
      { type: 'getPixelData', tabId: tab.id },
      (response) => {
        if (chrome.runtime.lastError) return;

        const data = response?.data;

        if (!data || !data.pixels || Object.keys(data.pixels).length === 0) {
          if (emptyStateEl) emptyStateEl.style.display = 'flex';
          return;
        }

        renderPixelData(data);
      }
    );
  } catch {}

  function renderPixelData(data) {
    const pixelIds = Object.keys(data.pixels);

    pixelIds.forEach((pixelId, index) => {
      const pixel = data.pixels[pixelId];
      const card = createPixelCard(pixel, index, pixelIds.length);
      pixelListEl.appendChild(card);
    });
  }

  function createPixelCard(pixel, index, totalPixels) {
    const card = document.createElement('div');
    card.className = 'pixel-card';

    const pixelName = 'Meta Pixel Inspector';

    const summaryHtml = index === 0
      ? `<div class="summary" id="summaryPixel">${totalPixels} pixel${totalPixels > 1 ? 's' : ''} found on this page</div>`
      : '';

    card.innerHTML = `
      ${summaryHtml}
      <div class="pixel-header">
        <div class="pixel-info">
          <div class="pixel-icon">
            <img src="../icons/pixel.png" width="32" height="32" alt="Pixel">
          </div>
          <div class="pixel-details">
            <div class="pixel-name">${escapeHtml(pixelName)}</div>
            <a href="https://eventsmanager.facebook.com/events_manager2" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400">Visit Events Manager</a>
            <div class="pixel-id-row">
              <span class="pixel-id-label">ID:</span>
              <span class="pixel-id-value" title="Copy pixel ID">${escapeHtml(pixel.id)}</span>
              <div class="cursor-pointer" title="Copy pixel ID" role="button" tabindex="0">
                <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
      <h3 class="text-[17px] font-semibold text-gray-900 dark:text-white">Events on this page</h3>
      <div class="event-list"></div>
    `;

    const link = card.querySelector('.pixel-details a');
    if (link) {
      link.addEventListener('mouseover', () => {
        link.style.textDecoration = "underline";
        link.style.textDecorationColor = "#2563EB";
      });
      link.addEventListener('mouseout', () => {
        link.style.textDecoration = "none";
      });
    }

    const idValue = card.querySelector('.pixel-id-value');
    const svg = card.querySelector('div.cursor-pointer');

    async function copyPixelId() {
      try {
        const textToCopy = pixel.id || idValue?.innerText || '';
        await navigator.clipboard.writeText(textToCopy);
        if (idValue) {
          idValue.textContent = 'copied!';
          setTimeout(() => { idValue.textContent = pixel.id; }, 2000);
        }
      } catch {
        if (idValue) idValue.textContent = 'copy failed';
      }
    }

    if (idValue) idValue.addEventListener('click', copyPixelId);
    if (svg) svg.addEventListener('click', copyPixelId);

    const eventList = card.querySelector('.event-list');

    if (pixel.events?.length) {
      pixel.events.forEach((event, idx) => {
        eventList.appendChild(createEventRow(event, `${pixel.id}-${idx}`));
      });
    } else {
      const noEvents = document.createElement('div');
      noEvents.className = 'event-list-empty';
      const header = card.querySelector('h3');
      if (header) header.style.display = 'none';
      noEvents.innerHTML = `
        <h3 class="text-label-large">A Warning found on this page</h3>
        <div class="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <div class="shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" class="size-6 text-yellow-500">
              <path fill-rule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd">
              </path>
            </svg>
          </div>
          <div>
            <div class="text-sm font-medium text-gray-900">
              No pixels have fired on this page
            </div>
            <div class="mt-1 text-xs text-gray-500">
              Pixels have fired on other pages of this website. Consider adding tracking events here or check if existing pixels are configured correctly.
            </div>
          </div>
        </div>
      `;
      eventList.appendChild(noEvents);
    }

    return card;
  }

  function createEventRow(event, uniqueId) {
    const row = document.createElement('div');
    row.className = 'event-row';

    row.innerHTML = `
      <div class="event-header">
        <div class="event-left">
          <span class="event-name">${escapeHtml(event.eventName || '')}</span>
          <div class="event-status">
            <span class="status-dot"></span>
            <span>Active</span>
          </div>
        </div>
        <div class="event-right">
          <svg class="arrow-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
          </svg>
        </div>
      </div>
      <div class="event-details" id="event-details-${uniqueId}"></div>
    `;

    const header = row.querySelector('.event-header');
    const arrow = row.querySelector('.arrow-icon');
    const details = row.querySelector('.event-details');

    header.addEventListener('click', () => {
      const expanded = details.classList.contains('expanded');

      if (!expanded && !details.hasChildNodes()) {
        buildEventDetails(details, event);
      }

      details.classList.toggle('expanded');
      arrow.classList.toggle('expanded');
    });

    if (event?.eventName === "SubscribedButtonClick") {
      row.style.display = "none";
    }

    return row;
  }

  function buildEventDetails(container, event) {

    if (event.customParams && Object.keys(event.customParams).length)
      container.appendChild(createParamSection('Custom Parameters Sent', 'custom-params', event.customParams, false));

    if (event.advancedMatching && Object.keys(event.advancedMatching).length)
      container.appendChild(createParamSection('Advanced Matching Parameters Sent', 'advanced-matching', event.advancedMatching, true));

    const eventInfoData = {};
    if (event.loadTime != null) eventInfoData['Load Time'] = `${event.loadTime} ms`;

    if (event.eventInfo) {
      if (event.eventInfo.documentLocation) eventInfoData['Pixel Location'] = event.eventInfo.documentLocation;
      if (event.eventInfo.documentTitle) eventInfoData['Page Title'] = event.eventInfo.documentTitle;
      if (event.eventInfo.referrer) eventInfoData['Referrer'] = event.eventInfo.referrer;
      if (event.eventInfo.eventId) eventInfoData['Event ID'] = event.eventInfo.eventId;
    }

    if (Object.keys(eventInfoData).length > 0)
      container.appendChild(createParamSection('Event Info', 'event-info-title', eventInfoData, false));

    if (!container.hasChildNodes()) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 8px 0; color: #8a8d91; font-size: 12px;';
      empty.textContent = 'No additional parameters sent.';
      container.appendChild(empty);
    }
  }

  const AdvancedMatchingLabels = {
    fn: 'First Name',
    ln: 'Last Name',
    em: 'Email',
    ph: 'Phone',
    ct: 'City',
    st: 'State',
    zp: 'Zip Code',
    country: 'Country',
    external_id: 'External ID',
    ge: 'Gender',
    db: 'Date of Birth'
  };

  function createParamSection(title, titleClass, params, isAdvancedMatching) {
    const section = document.createElement('div');
    section.className = 'param-section';

    const titleEl = document.createElement('div');
    titleEl.className = `param-section-title ${titleClass}`;
    titleEl.textContent = title;
    section.appendChild(titleEl);

    Object.entries(params).forEach(([key, value]) => {
      const label = isAdvancedMatching ? (AdvancedMatchingLabels[key] || key) : key;
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = `<span class="param-key">${label}:</span><span class="param-value">${escapeHtml(String(value))}</span>`;
      section.appendChild(row);
    });

    return section;
  }

  function getDomain(url) {
    try { return new URL(url).hostname; }
    catch { return 'this page'; }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});