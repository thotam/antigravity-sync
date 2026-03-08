# Antigravity Sync

[![Open VSX Version](https://img.shields.io/open-vsx/v/thotam/antigravity-sync)](https://open-vsx.org/extension/thotam/antigravity-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![GitHub](https://img.shields.io/badge/GitHub-thotam%2Fantigravity--sync-blue)](https://github.com/thotam/antigravity-sync)

Sync your **Antigravity** settings, extensions, and keybindings across devices using **Google Drive**.

> **Note**: This extension is designed exclusively for [Antigravity IDE](https://www.antigravity.google/). A warning will be shown if used on other editors.

## Features

- **Full Dashboard UI** — Modern webview panel with account info, profile management, and quick actions
- **App Data Explorer** — Browse files/folders in Google Drive appDataFolder with folder navigation, file preview, and pagination
- **Google Drive Storage** — Data stored securely in a hidden app-specific folder
- **One-Click Sync** — Push or pull your entire configuration in seconds
- **Cross-Platform** — Windows, macOS, and Linux
- **Secure** — Google OAuth 2.0, tokens encrypted by OS via SecretStorage
- **Google Avatar** — Display your Google profile picture in the dashboard

### What Gets Synced

| Item                             | Synced |
| -------------------------------- | ------ |
| Settings (`settings.json`)       | ✅     |
| Keybindings (`keybindings.json`) | ✅     |
| Extensions                       | ✅     |

## Installation

### From Open VSX Registry

Search for **"Antigravity Sync"** in the Extensions panel, or install directly from [open-vsx.org](https://open-vsx.org/extension/thotam/antigravity-sync).

### From VSIX

1. Download the `.vsix` file from [Releases](https://github.com/thotam/antigravity-sync/releases)
2. Open Antigravity → Extensions → `...` → **Install from VSIX**

## Requirements

- **Antigravity IDE**
- A Google account

## Usage

### First Time Setup

1. Install the extension
2. Click the **StatusBar** button or run `Antigravity Sync: Open Dashboard`
3. Click **Sign in with Google** → Authorize in browser → you're done!

### Command

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command                              | Description              |
| ------------------------------------ | ------------------------ |
| **Antigravity Sync: Open Dashboard** | Open the Dashboard panel |

All profile management (create, pull, push, delete), account actions (sign in/out), and settings are available directly within the Dashboard UI.

### Status Bar

Click the `$(sync) Antigravity Sync` button in the status bar to quickly open the Dashboard.

### Dashboard Features

- **Account Card** — Shows your Google email and avatar with sign-out button
- **Quick Actions** — Create profile, set settings/keybindings path, view logs
- **Profile Cards** — Pull, push, or delete profiles with one click
- **Modal Dialogs** — Create profile input, delete/sign-out confirmations, reload prompt
- **Toast Notifications** — Success/error/info feedback with progress bar and close button

## How It Works

1. **Authentication**: OAuth 2.0 flow opens your browser for Google login
2. **Storage**: Profiles are saved in Google Drive's hidden [appDataFolder](https://developers.google.com/drive/api/guides/appdata) — invisible to the user, doesn't consume storage quota
3. **Sync**: Settings and keybindings are read as JSON5 (preserving compatibility) and stored as JSON in Drive

## Configuration

| Setting                             | Default | Description                        |
| ----------------------------------- | ------- | ---------------------------------- |
| `antigravitysync.excludeExtensions` | `[]`    | Extension IDs to exclude from sync |

## Important Notes

- Comments in `settings.json` and `keybindings.json` are **not preserved** (JSON5 → JSON conversion)
- Extension sync will prompt before installing/uninstalling extensions
- A window reload may be required after pulling a profile
- Tokens are stored securely via OS-level encryption (SecretStorage)
- OAuth credentials are injected at build time from `.env` (not in source code)

## Development

### Prerequisites

- Node.js 20+
- [Antigravity IDE](https://www.antigravity.google/) (for testing)
- Google OAuth Client ID ([Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Desktop app** type)

### Setup

```bash
git clone https://github.com/thotam/antigravity-sync.git
cd antigravity-sync
npm install
cp .env.example .env   # Fill in your Google OAuth credentials
```

### Run Locally (Development)

```bash
npm run compile                # Build once (development mode)
npm run watch                  # Build & watch for changes
antigravity --extensionDevelopmentPath="$(pwd)"  # Launch Antigravity with extension
```

### Build Production

```bash
npm run package                # Webpack production build
```

### Package VSIX

```bash
npx -y @vscode/vsce package --allow-missing-repository
# Output: antigravity-sync-x.x.x.vsix
```

### Publish to Open VSX

```bash
npx -y ovsx publish antigravity-sync-x.x.x.vsix -p <YOUR_OPENVSX_TOKEN>
```

Get token from: [open-vsx.org/user-settings/tokens](https://open-vsx.org/user-settings/tokens)

### Create GitHub Release

1. Go to [Releases → New release](https://github.com/thotam/antigravity-sync/releases/new)
2. Create tag: `vX.X.X`
3. Title: `vX.X.X — Description`
4. Upload `.vsix` file as asset
5. Copy changelog entries as release notes

### Project Structure

```
src/
├── extension.ts               # Entry point, single command, StatusBar
├── models/
│   └── interfaces.ts          # TypeScript interfaces
├── providers/
│   └── dashboard-provider.ts  # Full webview panel dashboard
├── webview/
│   ├── dashboard.css          # Dashboard styles (modal, toast, cards)
│   └── dashboard.js           # Dashboard logic (modal system, state rendering)
└── core/
    ├── google-auth.ts          # Google OAuth 2.0 flow
    ├── google-drive.ts         # Google Drive API (appDataFolder)
    ├── sync-controller.ts      # Read/write Antigravity config
    └── logger.ts               # Output channel logging
```

## Release Notes

### 0.4.0 (2026-03-08)

- 📂 **App Data Explorer** — Browse all files/folders in Google Drive appDataFolder
- 🗂️ **Folder Navigation** — Double-click to drill down, breadcrumb trail, back button
- 👁️ **File Preview** — View JSON and text file content in a formatted modal
- 📄 **Pagination** — Prev/Next controls for large directories (20 items/page)

### 0.3.0 (2026-03-08)

- 🎨 **Full Dashboard UI** — Modern webview panel replaces command palette menu
- 🪟 **Modal System** — Custom confirm/input modals with backdrop blur and animations
- 🔔 **Toast Notifications** — Upgraded with close button, progress bar, and slide-in animation
- 👤 **Google Avatar** — Display profile picture in header and account card
- 🧹 **Simplified Commands** — Only `Open Dashboard` remains, all actions are in the panel
- 🌍 **English UI** — All user-facing text translated to English for global accessibility

### 0.2.0 (2026-03-08)

- 🔄 **Switched to Google Drive** — replaced GitHub Gists with Google Drive appDataFolder
- 🔒 **Google OAuth 2.0** — secure login via browser, tokens encrypted by OS
- 🔐 **Build-time credentials** — OAuth secrets injected via `.env` + DefinePlugin
- 🎯 **Antigravity Only** — focused support with warning for other editors
- 🗑️ **Removed GitHub dependency** — no longer requires GitHub account or token

### 0.1.0 (2026-03-08)

- 🎉 Initial release with GitHub Gist storage

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/thotam/antigravity-sync).

## Links

- 📦 [Open VSX Registry](https://open-vsx.org/extension/thotam/antigravity-sync)
- 🐛 [Report Issues](https://github.com/thotam/antigravity-sync/issues)
- 📜 [Source Code](https://github.com/thotam/antigravity-sync)

## License

[MIT](LICENSE.md)
