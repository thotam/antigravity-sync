# Changelog

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
