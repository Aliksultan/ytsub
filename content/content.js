(() => {
  const DEFAULT_SETTINGS = {
    fontSize: 36,
    fontFamily: 'Arial, sans-serif',
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.45,
    outlineColor: '#000000',
    outlineWidth: 2,
    bottomOffset: 8,
    maxWidth: 90,
    delayMs: 0
  };

  const MESSAGE_TYPES = {
    LOAD_SRT: 'YTSUB_LOAD_SRT',
    UPDATE_SETTINGS: 'YTSUB_UPDATE_SETTINGS',
    CLEAR_SUBS: 'YTSUB_CLEAR_SUBS'
  };

  let cues = [];
  let activeIndex = -1;
  let overlay = null;
  let playerContainer = null;
  let video = null;
  let settings = { ...DEFAULT_SETTINGS };
  let animationHandle = null;
  let currentHref = location.href;

  function parseTimestamp(raw) {
    const value = raw.trim();
    const match = value.match(/^(\d{2}):(\d{2}):(\d{2})[,\.](\d{1,3})$/);

    if (!match) {
      return Number.NaN;
    }

    const [, hh, mm, ss, msRaw] = match;
    const ms = Number(msRaw.padEnd(3, '0'));

    return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + ms / 1000;
  }

  function parseSrt(content) {
    const normalized = content.replace(/\uFEFF/g, '').replace(/\r/g, '').trim();
    if (!normalized) {
      return [];
    }

    const blocks = normalized.split(/\n\n+/);
    const parsed = [];

    for (const block of blocks) {
      const lines = block.split('\n').map((line) => line.trimEnd());
      if (!lines.length) {
        continue;
      }

      let timingIndex = 0;
      if (/^\d+$/.test(lines[0].trim())) {
        timingIndex = 1;
      }

      const timingLine = lines[timingIndex] ?? '';
      const timingMatch = timingLine.match(/(.+)\s+-->\s+(.+)/);
      if (!timingMatch) {
        continue;
      }

      const start = parseTimestamp(timingMatch[1]);
      const end = parseTimestamp(timingMatch[2]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        continue;
      }

      const text = lines.slice(timingIndex + 1).join('\n').trim();
      if (!text) {
        continue;
      }

      parsed.push({ start, end, text });
    }

    return parsed.sort((a, b) => a.start - b.start);
  }

  function getVideoAndContainer() {
    const nextVideo = document.querySelector('video.html5-main-video');
    const nextContainer = document.querySelector('.html5-video-player');
    if (!nextVideo || !nextContainer) {
      return null;
    }

    return { video: nextVideo, container: nextContainer };
  }

  function ensureOverlay() {
    const target = getVideoAndContainer();
    if (!target) {
      return false;
    }

    video = target.video;
    if (playerContainer !== target.container) {
      playerContainer = target.container;
      if (overlay && overlay.parentElement) {
        overlay.remove();
      }
      overlay = null;
    }

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ytsub-overlay';
      playerContainer.appendChild(overlay);
    }

    applyOverlayStyles();
    return true;
  }

  function applyOverlayStyles() {
    if (!overlay) {
      return;
    }

    overlay.style.fontSize = `${settings.fontSize}px`;
    overlay.style.fontFamily = settings.fontFamily;
    overlay.style.color = settings.color;
    overlay.style.backgroundColor = toRgba(settings.backgroundColor, settings.backgroundOpacity);
    overlay.style.bottom = `${settings.bottomOffset}%`;
    overlay.style.maxWidth = `${settings.maxWidth}%`;
    overlay.style.textShadow = `
      -${settings.outlineWidth}px -${settings.outlineWidth}px 0 ${settings.outlineColor},
      ${settings.outlineWidth}px -${settings.outlineWidth}px 0 ${settings.outlineColor},
      -${settings.outlineWidth}px ${settings.outlineWidth}px 0 ${settings.outlineColor},
      ${settings.outlineWidth}px ${settings.outlineWidth}px 0 ${settings.outlineColor}
    `;
    overlay.style.padding = '0.15em 0.5em';
    overlay.style.borderRadius = '0.25em';
    overlay.style.lineHeight = '1.25';
  }

  function toRgba(hexColor, alpha) {
    const sanitized = hexColor.replace('#', '').trim();
    const expanded = sanitized.length === 3
      ? sanitized.split('').map((char) => char + char).join('')
      : sanitized;

    if (!/^[a-fA-F0-9]{6}$/.test(expanded)) {
      return `rgba(0, 0, 0, ${alpha})`;
    }

    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${Math.min(Math.max(alpha, 0), 1)})`;
  }

  function setSubtitle(text) {
    if (!overlay) {
      return;
    }

    if (!text) {
      overlay.textContent = '';
      overlay.classList.remove('ytsub-visible');
      return;
    }

    overlay.textContent = text;
    overlay.classList.add('ytsub-visible');
  }

  function findCueIndex(time) {
    let lo = 0;
    let hi = cues.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const cue = cues[mid];

      if (time < cue.start) {
        hi = mid - 1;
      } else if (time >= cue.end) {
        lo = mid + 1;
      } else {
        return mid;
      }
    }

    return -1;
  }

  function tick() {
    animationHandle = requestAnimationFrame(tick);

    if (!cues.length || !video || !ensureOverlay()) {
      setSubtitle('');
      activeIndex = -1;
      return;
    }

    const shiftedTime = video.currentTime + settings.delayMs / 1000;
    const nextIndex = findCueIndex(shiftedTime);

    if (nextIndex !== activeIndex) {
      activeIndex = nextIndex;
      setSubtitle(nextIndex === -1 ? '' : cues[nextIndex].text);
    }
  }

  async function loadSettings() {
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    settings = {
      ...DEFAULT_SETTINGS,
      ...stored
    };

    applyOverlayStyles();
  }

  function resetSessionState() {
    cues = [];
    activeIndex = -1;
    setSubtitle('');
  }

  function initNavigationWatcher() {
    const observer = new MutationObserver(() => {
      if (location.href !== currentHref) {
        currentHref = location.href;
        ensureOverlay();
        resetSessionState();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === MESSAGE_TYPES.LOAD_SRT) {
      const parsed = parseSrt(String(message.payload ?? ''));
      cues = parsed;
      activeIndex = -1;
      sendResponse({ ok: true, cueCount: parsed.length });
      return true;
    }

    if (message.type === MESSAGE_TYPES.UPDATE_SETTINGS) {
      settings = {
        ...settings,
        ...(message.payload ?? {})
      };
      applyOverlayStyles();
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === MESSAGE_TYPES.CLEAR_SUBS) {
      resetSessionState();
      sendResponse({ ok: true });
      return true;
    }
  });

  loadSettings().catch(() => {
    settings = { ...DEFAULT_SETTINGS };
  });

  ensureOverlay();
  initNavigationWatcher();
  tick();
})();
