const ALL_URLS = ['*://*.medium.com/*', '*://towardsdatascience.com/*'];
const ACTIVE = '1';
const INACTIVE = '0';
const DEFAULT_COOKIES = JSON.stringify({});

/**
 * Session wrapper for persisting site cookies
 * Allows for reclaiming cookies.
 */
class Session {
  cookies = Session.read();

  put(url, cookie) {
    let key = JSON.stringify([url, cookie.name]);
    this.cookies[key] = cookie;
    this.persist();
  }

  has(url, cookie) {
    let key = JSON.stringify([url, cookie.name]);
    return key in this.cookies;
  }

  persist() {
    localStorage.cookies = JSON.stringify(this.cookies);
  }

  static read() {
    let cookies = localStorage.cookies || DEFAULT_COOKIES;
    cookies = JSON.parse(cookies);
    return cookies;
  }

  reclaim() {
    const cookies = [];
    for (let [key, cookie] of Object.entries(this.cookies)) {
      key = JSON.parse(key);

      cookie.url = key[0];

      delete cookie.hostOnly;
      delete cookie.session;
      cookies.push(cookie);
    }
    return cookies;
  }
}

/**
 * State for extension.
 */
class State {
  value = null;

  init() {
    this.value = ACTIVE;
  }

  toggle() {
    this.value = this.value == ACTIVE ? INACTIVE : ACTIVE;
    this.persist();
  }

  isActive() {
    return this.value == ACTIVE;
  }
  persist() {
    localStorage.state = this.value;
  }
  repr() {
    return this.isActive() ? 'ON' : 'OFF';
  }
}

const session = new Session();

function saveCookieForURL(session, url) {
  function fn(cookie) {
    if (cookie === null) return;
    // Only store first session,
    // For example if logged in before activating extension to view publication,
    // It should be able to reclaim session back after deactivating extension
    if (session.has(url, cookie)) return;
    session.put(url, cookie);
  }
  return fn;
}

function captureSession(session, url) {
  chrome.cookies.get({ url: url, name: 'sid' }, saveCookieForURL(session, url));
  chrome.cookies.get({ url: url, name: 'uid' }, saveCookieForURL(session, url));
}

function removeCookies(url) {
  chrome.cookies.remove({ url: url, name: 'sid' });
}

function onBeforeRequest(state, session) {
  function fn(details) {
    if (!state.isActive()) {
      return;
    }
    // We only care for the domain here so we're using the initiator
    // instead of detail url.
    captureSession(session, details.initiator);
    removeCookies(details.initiator);
  }
  return fn;
}

function browserActionOnClicked(state, session) {
  function fn(tab) {
    state.toggle();
    chrome.browserAction.setBadgeText({ text: state.repr() });
    if (!state.isActive()) {
      for (let cookie of session.reclaim()) {
        chrome.cookies.set(cookie);
      }
    }
  }
  return fn;
}

state = new State();

function onInstalled(state) {
  function fn() {
    state.init();
    state.persist();
    chrome.browserAction.setBadgeText({ text: state.repr() });
  }
  return fn;
}

// Register handlers
chrome.webRequest.onBeforeRequest.addListener(
  onBeforeRequest(state, session),
  { urls: ALL_URLS },
  []
);
chrome.browserAction.onClicked.addListener(
  browserActionOnClicked(state, session)
);
chrome.runtime.onInstalled.addListener(onInstalled(state));
