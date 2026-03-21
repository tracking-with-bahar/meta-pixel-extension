const ADVANCED_MATCHING_KEYS = [
  'em', 'fn', 'ln', 'ph', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'
];

// Standard event names
const STANDARD_EVENTS = [
  'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
  'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead',
  'CompleteRegistration', 'Contact', 'CustomizeProduct', 'Donate',
  'FindLocation', 'Schedule', 'StartTrial', 'SubmitApplication', 'Subscribe'
];

// Advanced matching keys
const ADVANCED_MATCHING_LABELS = {
  em: 'Email',
  fn: 'First Name',
  ln: 'Last Name',
  ph: 'Phone',
  ge: 'Gender',
  db: 'Date of Birth',
  ct: 'City',
  st: 'State',
  zp: 'Zip Code',
  country: 'Country',
  external_id: 'External ID'
};

function parsePixelRequest(url) {
  try {
    const urlObj = new URL(url);

    if (!urlObj.pathname.startsWith('/tr')) {
      return null;
    }

    const params = urlObj.searchParams;
    const pixelId = params.get('id');
    const eventName = params.get('ev');

    if (!pixelId || !eventName) {
      return null;
    }

    const advancedMatching = {};
    for (const key of ADVANCED_MATCHING_KEYS) {
      const value = params.get(`ud[${key}]`);
      if (value) {
        advancedMatching[key] = value;
      }
    }

    const customParams = {};
    for (const [key, value] of params.entries()) {
      if (key.startsWith('cd[') && key.endsWith(']')) {
        const paramName = key.slice(3, -1);
        customParams[paramName] = value;
      }
    }

    // Extract event info
    const eventInfo = {
      documentLocation: params.get('dl') || '',
      documentTitle: params.get('dt') || '',
      referrer: params.get('rl') || '',
      screenWidth: params.get('sw') || '',
      screenHeight: params.get('sh') || '',
      pixelVersion: params.get('v') || '',
      cookieEnabled: params.get('coo') || '',
      requestMethod: params.get('rqm') || ''
    };

    // Extract cookie data
    const cookies = {
      fbp: params.get('fbp') || '',
      fbc: params.get('fbc') || ''
    };

    const timestamp = params.get('ts') ? parseInt(params.get('ts'), 10) : Date.now();

    return {
      pixelId,
      eventName,
      timestamp,
      urlCalled: url,
      isStandardEvent: STANDARD_EVENTS.includes(eventName),
      advancedMatching,
      customParams,
      eventInfo,
      cookies,
      status: 'success'
    };
  } catch (e) {
    return null;
  }
}

function isPixelRequest(url) {
  try {
    const urlObj = new URL(url);
    const isPixelDomain = urlObj.hostname === 'www.facebook.com' ||
                          urlObj.hostname === 'pixel.facebook.com';
    return isPixelDomain && urlObj.pathname.startsWith('/tr');
  } catch {
    return false;
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.PixelParser = {
    parsePixelRequest,
    isPixelRequest,
    STANDARD_EVENTS,
    ADVANCED_MATCHING_KEYS,
    ADVANCED_MATCHING_LABELS
  };
}
