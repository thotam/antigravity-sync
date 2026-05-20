# Changelog

## [0.7.0] - 2026-05-20

### Added
- **Antigravity IDE 2.0+ Support** — Fully compatible with Google's major IDE update

### Changed
- **Config Storage Path** — Migrated config paths to `Antigravity IDE` instead of `Antigravity` to match version 2.0+ specifications
- **IDE Detection** — Updated app recognition to support the new `"Antigravity IDE"` identifier exclusively

## [0.6.0] - 2026-03-08

### Added
- **Snippets Sync** — Sync user snippets (`User/snippets/`) across devices, bundled as base64-encoded content in `snippets.json`
- **Orphaned Panel Cleanup** — Dashboard automatically closes when extension restarts, preventing non-functional UI

### Changed
- **Base64 Config Storage** — Settings and keybindings now stored as raw base64 instead of parsed JSON, preserving comments, whitespace, and JSON5 syntax
- Refactored `getConfigPaths()` to accept relative paths (files or directories) for reuse across config types

### Fixed
- Comments in `settings.json` and `keybindings.json` are now **preserved** during sync (previously lost due to JSON5 → JSON conversion)

### Removed
- `json5` dependency (no longer needed with base64 storage)
- Unused `ISettings` and `IKeybinds` interfaces

### Breaking Changes
- ⚠️ **Profiles created in v0.5.0 or earlier are incompatible** — Settings/keybindings format changed from parsed JSON to base64. Please delete old profiles and recreate them

## [0.5.0] - 2026-03-08

### Added
- **Folder-based Profile Storage** — Each profile is now stored as a dedicated folder containing `meta.json`, `settings.json`, `extensions.json`, and `keybindings.json`
- **Sync Progress Modal** — Real-time progress display with step-by-step status (pending → active → done), animated progress bar, and auto-close on completion
- **Extension Sync Confirm Modal** — In-webview modal listing extensions to install/remove before applying, replaces native VS Code dialog
- **Sync Item Selection** — Choose which items to sync (Settings, Extensions, Keybindings) when creating, pushing, or pulling profiles via checkbox modals
- **Extensible Sync Architecture** — `ISyncItem` registry pattern allowing easy addition of new sync data types in the future
- **Root Sync Meta** — Central `sync-meta.json` at root appDataFolder for fast profile listing (2 API calls instead of N+1)
- **Progressive UI Loading** — Dashboard UI appears immediately, profiles and app data load progressively with loading spinners
- `FEATURES.md` — Comprehensive feature documentation

### Changed
- Profile storage restructured from single `.json` files to folder-based layout for better extensibility
- App Data Explorer now correctly shows only direct children at root level
- Extension sync confirmation moved from native OS dialog to themed webview modal with detailed extension list
- Sync progress modal is locked during operation (cannot be dismissed until complete or error)
- Refresh buttons now spin during data loading and stop when complete
- App Data Explorer shows loading placeholder when fetching files

### Breaking Changes
- ⚠️ **Profiles created in v0.4.0 or earlier are incompatible** — Please delete old profiles and recreate them

## [0.4.0] - 2026-03-08

### Added
- **App Data Explorer** — Browse all files and folders in Google Drive appDataFolder directly from the Dashboard
- Folder navigation: double-click to drill down, breadcrumb trail, and back button
- File preview modal for JSON and text-based files with formatted display
- Paginated file listing with Prev/Next controls (20 items per page)
- Type badges with color coding (Folder, JSON, Text, File)
- File metadata display: name, type, size, and modified time (with seconds)

## [0.3.0] - 2026-03-08

### Added
- Full webview Dashboard panel — replaces the old command palette menu
- Custom modal system (confirm and input dialogs) with backdrop blur, keyboard support, and animations
- Upgraded toast notifications with close button, progress bar, and slide-in animation
- Google profile avatar display in header and account card
- OAuth scopes for `userinfo.email` and `userinfo.profile` to fetch account details
- Project rule file enforcing English-only text for global accessibility

### Changed
- Simplified to a single command: `Antigravity Sync: Open Dashboard`
- All user-facing text translated from Vietnamese to English
- Logout and delete confirmations now use in-webview modals instead of native VS Code dialogs
- Profile creation uses in-webview input modal instead of `vscode.window.showInputBox`
- Reload prompt after pull uses in-webview modal instead of native notification
- StatusBar click opens the Dashboard directly (no menu)
- File picker cancel no longer shows a false error toast

### Removed
- All individual commands (login, logout, create/pull/update/delete profile, show logs, set paths)
- QuickPick menu system
- Vietnamese UI text

## [0.2.0] - 2026-03-08

### Changed
- **Storage**: Switched from GitHub Gists to Google Drive (appDataFolder)
- **Authentication**: Replaced GitHub token with Google OAuth 2.0
- **Scope**: Focused exclusively on Antigravity IDE (warning for other editors)
- **Dependencies**: Removed `axios`, using native Node.js `https` module

### Added
- Google OAuth login/logout commands
- Secure token storage via SecretStorage (OS-level encryption)
- Auto token refresh (1h expiry, transparent to user)
- Re-login prompt when refresh token is revoked
- Non-Antigravity IDE warning dialog
- Multi-path fallback for config file detection (APPDATA + USERPROFILE)
- Build-time credential injection via `.env` + webpack DefinePlugin (credentials excluded from source)

### Removed
- GitHub Gist storage
- GitHub authentication requirement
- Multi-editor support (VS Code, Cursor, VS Code Insiders)
- `axios` dependency

## [0.1.0] - 2026-03-08

### Added
- Initial release
- Sync settings, keybindings, and extensions via GitHub Gists
- Multi-editor support: Antigravity, VS Code, Cursor, VS Code Insiders
- Profile management: create, pull, update, delete
- Cross-platform support: Windows, macOS, Linux
- GitHub OAuth built-in authentication
- StatusBar quick access menu
