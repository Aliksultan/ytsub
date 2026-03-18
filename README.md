# YouTube SRT Overlay (Chrome Extension)

Chrome extension that injects local `.srt` subtitles into YouTube videos and lets you customize subtitle appearance.

## Features

- Load a local `.srt` file from extension popup.
- Display subtitles in sync with the current YouTube video.
- Fully customizable subtitle appearance:
  - font family and size
  - text and background color
  - background opacity
  - outline color and width
  - vertical position
  - max width
  - sync offset (delay/advance in milliseconds)
- Save settings via `chrome.storage.sync`.

## Development / Load Unpacked

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open any YouTube watch page.
6. Click extension icon and load an `.srt` file.

## Notes

- This extension does not replace YouTube's built-in caption tracks; it overlays your local subtitles on top of the player.
- If subtitles disappear after YouTube navigation, reopen popup and reload SRT (current implementation clears cues on page changes for safety).
