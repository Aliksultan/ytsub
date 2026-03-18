const DEFAULT_SETTINGS = {
  fontSize: 36,
  fontFamily: 'Arial, sans-serif',
  color: '#ffffff',
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

const fields = {
  srtFile: document.getElementById('srtFile'),
  clearBtn: document.getElementById('clearBtn'),
  status: document.getElementById('status'),
  fontSize: document.getElementById('fontSize'),
  fontFamily: document.getElementById('fontFamily'),
  color: document.getElementById('color'),
  backgroundColor: document.getElementById('backgroundColor'),
  backgroundOpacity: document.getElementById('backgroundOpacity'),
  outlineColor: document.getElementById('outlineColor'),
  outlineWidth: document.getElementById('outlineWidth'),
  bottomOffset: document.getElementById('bottomOffset'),
  maxWidth: document.getElementById('maxWidth'),
  delayMs: document.getElementById('delayMs')
};

function setStatus(message, isError = false) {
  fields.status.textContent = message;
  fields.status.style.color = isError ? '#c62828' : '';
}

async function getActiveYouTubeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('youtube.com')) {
    throw new Error('Open a YouTube video tab first.');
  }

  return tab.id;
}

async function sendToTab(message) {
  const tabId = await getActiveYouTubeTab();
  return chrome.tabs.sendMessage(tabId, message);
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

function getSettingsFromUI() {
  return {
    fontSize: Number(fields.fontSize.value),
    fontFamily: fields.fontFamily.value,
    color: fields.color.value,
    backgroundColor: fields.backgroundColor.value,
    backgroundOpacity: Number(fields.backgroundOpacity.value),
    outlineColor: fields.outlineColor.value,
    outlineWidth: Number(fields.outlineWidth.value),
    bottomOffset: Number(fields.bottomOffset.value),
    maxWidth: Number(fields.maxWidth.value),
    delayMs: Number(fields.delayMs.value)
  };
}

function setUIFromSettings(settings) {
  fields.fontSize.value = String(settings.fontSize);
  fields.fontFamily.value = settings.fontFamily;
  fields.color.value = settings.color;
  fields.backgroundColor.value = settings.backgroundColor;
  fields.backgroundOpacity.value = String(settings.backgroundOpacity);
  fields.outlineColor.value = settings.outlineColor;
  fields.outlineWidth.value = String(settings.outlineWidth);
  fields.bottomOffset.value = String(settings.bottomOffset);
  fields.maxWidth.value = String(settings.maxWidth);
  fields.delayMs.value = String(settings.delayMs);
}

async function persistAndBroadcastSettings() {
  const next = getSettingsFromUI();
  await chrome.storage.sync.set(next);

  try {
    await sendToTab({ type: MESSAGE_TYPES.UPDATE_SETTINGS, payload: next });
    setStatus('Settings saved.');
  } catch (error) {
    setStatus(error.message || 'Saved settings, but tab was unavailable.', true);
  }
}

async function init() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...stored
  };

  setUIFromSettings(settings);

  Object.entries(fields).forEach(([key, element]) => {
    if (['srtFile', 'clearBtn', 'status'].includes(key)) {
      return;
    }

    element.addEventListener('input', () => {
      persistAndBroadcastSettings().catch((error) => {
        setStatus(error.message || 'Could not update settings.', true);
      });
    });
  });

  fields.srtFile.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await readFile(file);
      const result = await sendToTab({
        type: MESSAGE_TYPES.LOAD_SRT,
        payload: text
      });

      if (result?.ok) {
        setStatus(`Loaded ${result.cueCount} subtitle cue(s).`);
      } else {
        setStatus('Subtitle load failed.', true);
      }
    } catch (error) {
      setStatus(error.message || 'Could not send subtitles to YouTube tab.', true);
    } finally {
      fields.srtFile.value = '';
    }
  });

  fields.clearBtn.addEventListener('click', async () => {
    try {
      await sendToTab({ type: MESSAGE_TYPES.CLEAR_SUBS });
      setStatus('Cleared subtitles.');
    } catch (error) {
      setStatus(error.message || 'Could not clear subtitles.', true);
    }
  });
}

init().catch((error) => {
  setStatus(error.message || 'Initialization failed.', true);
});
