# Changelog

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
