# Antigravity Sync

Sync your **Antigravity / VS Code / Cursor** settings, extensions, and keybindings across devices using **GitHub Gists**.

> Based on [Sync Everything](https://github.com/0x3at/synceverything) by DunderDev — adapted for Antigravity IDE with multi-editor support.

## Features

- **Profile Management** — Create, pull, update, and delete sync profiles
- **One-Click Sync** — Push or pull your entire configuration in seconds
- **Secure Storage** — All data stored in private GitHub Gists
- **Multi-Editor Support** — Works with Antigravity, VS Code, Cursor, and VS Code Insiders
- **Cross-Platform** — Windows, macOS, and Linux

### What Gets Synced

| Item | Synced |
|------|--------|
| Settings (`settings.json`) | ✅ |
| Keybindings (`keybindings.json`) | ✅ |
| Extensions | ✅ |

## Requirements

- A GitHub account with Gist permissions
- Antigravity, VS Code, or Cursor (v1.90.0+)

## Installation

### From Open VSX Registry
Search for **"Antigravity Sync"** in the Extensions panel, or install from [open-vsx.org](https://open-vsx.org).

### From VSIX
1. Download the `.vsix` file
2. Open Antigravity → Extensions → `...` → **Install from VSIX**

## Usage

### Initial Setup
1. Install the extension
2. On first activation, sign in to GitHub when prompted
3. A default "Origin" profile is created automatically

### Commands
Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type **"Antigravity Sync"**:

| Command | Description |
|---------|-------------|
| **Show Menu** | Open the quick action menu |
| **Create Profile** | Save current config as a new profile |
| **Pull Profile** | Download and apply a profile |
| **Update Profile** | Update an existing profile with current config |
| **Delete Profile** | Remove a profile from GitHub |
| **Show Logs** | View extension logs |
| **Set Paths Manually** | Manually set config file paths |

### Status Bar
Click the `$(sync) Antigravity Sync` button in the status bar to quickly access the menu.

## Important Notes

- Comments in `settings.json` and `keybindings.json` are **not preserved** (JSON5 → JSON conversion)
- Extension sync will prompt before installing/uninstalling extensions
- A window reload may be required after pulling a profile

## License

[MIT](LICENSE.md)
