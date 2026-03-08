# Features

Detailed feature documentation for **Antigravity Sync** extension.

## 📂 Profile Management

### Folder-based Storage (v0.5.0+)

Each profile is stored as a dedicated folder in Google Drive's appDataFolder:

```
📁 My Profile/
├── meta.json          # Profile metadata (name, timestamps, syncKeys)
├── settings.json      # Editor settings
├── extensions.json    # Installed extension IDs
├── keybindings.json   # Keyboard shortcuts
└── snippets.json      # User snippets (base64-bundled)
```

A central `sync-meta.json` file at root appDataFolder stores syncKeys for all profiles, enabling fast listing (2 API calls instead of N+1).

This structure allows:
- Individual file updates without rewriting the entire profile
- Easy extensibility for future sync targets (themes, etc.)
- Better conflict resolution at the file level

### Operations

| Action         | Description                                          |
| -------------- | ---------------------------------------------------- |
| **Create**     | Captures current settings, extensions, keybindings, and snippets into a new profile with selectable sync items |
| **Push**       | Updates an existing profile with your current configuration (checkboxes pre-checked to match profile) |
| **Pull**       | Downloads a profile and applies it to your local editor (only shows items available in the profile) |
| **Delete**     | Permanently removes a profile from Google Drive       |

## ☑️ Sync Item Selection (v0.5.0+)

Choose exactly which items to sync for each operation:

- **Create** — Checkbox list appears below the profile name input
- **Push** — Confirm modal shows checkboxes pre-checked to match the profile's existing `syncKeys`
- **Pull** — Only items stored in the profile are shown (filtered by `meta.syncKeys`)
- **Validation** — At least one item must be selected to proceed
- **Extensible** — Built on `ISyncItem` registry pattern, adding new sync types requires only a registry entry

## ⏳ Sync Progress Modal (v0.5.0+)

Every sync operation (create, push, pull) displays a real-time progress modal:

- **Step list** — Shows all steps with status icons:
  - ⏳ Pending (circle outline)
  - 🔄 Active (spinning loader)
  - ✅ Done (green check)
- **Progress bar** — Animated gradient bar showing completion percentage
- **Lock behavior** — Modal cannot be dismissed while sync is in progress
- **Auto-close** — Closes automatically after 800ms on completion
- **Error handling** — Modal becomes dismissable if an error occurs

## 🧩 Extension Sync (v0.5.0+)

When pulling a profile, the extension compares your local extensions with the remote profile:

- **Confirm modal** — Lists extensions to install and remove before applying
- **Skip option** — You can skip extension sync and only apply settings/keybindings/snippets
- **Exclude list** — Configure `antigravitysync.excludeExtensions` to permanently exclude specific extensions from sync

## 📝 Snippets Sync (v0.6.0+)

Sync user-level snippets from `User/snippets/` directory:

- **Multi-file support** — All `.json` and `.code-snippets` files are synced
- **Base64 encoding** — File contents preserved exactly (comments, whitespace, JSON5 syntax)
- **Bundled storage** — All snippet files packed into a single `snippets.json` on Google Drive
- **Auto-create directory** — Snippets directory created automatically on pull if it doesn't exist

## 🔧 Base64 Config Preservation (v0.6.0+)

Settings and keybindings are now stored as raw base64-encoded content:

- **Comments preserved** — JSON5 comments in `settings.json` and `keybindings.json` survive sync
- **Whitespace preserved** — Original formatting maintained exactly
- **No conversion loss** — No JSON5 → JSON parsing that strips comments

## 🗂️ App Data Explorer (v0.4.0+)

Browse files and folders stored in Google Drive appDataFolder:

- **Folder navigation** — Double-click to drill down into subfolders
- **Breadcrumb trail** — Visual path indicator with clickable segments
- **File preview** — View JSON and text file content in a formatted modal
- **Pagination** — Prev/Next controls for directories with many items (20 per page)
- **Type badges** — Color-coded indicators for Folder, JSON, Text, and other file types
- **Loading state** — Spinner and loading text while fetching files

## ⚡ Progressive UI Loading (v0.5.0+)

The dashboard loads in two phases for instant responsiveness:

1. **Phase 1** — Auth and user info loads first, UI appears immediately with profile loading spinner
2. **Phase 2** — Profiles and app data load in background, displayed when ready

- Refresh buttons animate (spin) during loading
- App Data Explorer shows loading placeholder before files arrive

## 🎨 Dashboard UI (v0.3.0+)

Modern webview panel providing all functionality in one place:

- **Account card** — Google email, avatar, and sign-out button
- **Quick actions** — Create profile, set config paths, view logs, refresh
- **Profile cards** — Pull, push, or delete with one click
- **Modal system** — Themed confirm/input dialogs with backdrop blur and keyboard support
- **Toast notifications** — Success/error/info with progress bar, auto-dismiss, and close button

## 🔐 Security

- **Google OAuth 2.0** — Secure login via browser redirect
- **SecretStorage** — Tokens encrypted by OS-level keychain (Windows DPAPI, macOS Keychain, Linux Secret Service)
- **appDataFolder** — Profile data is invisible to the user in Google Drive and doesn't consume storage quota
- **Build-time credentials** — OAuth secrets injected via `.env` at build time, never in source code
- **Auto token refresh** — Transparent re-authentication when tokens expire (1h lifetime)

## ⚙️ Configuration

| Setting                             | Default | Description                        |
| ----------------------------------- | ------- | ---------------------------------- |
| `antigravitysync.excludeExtensions` | `[]`    | Extension IDs to exclude from sync |

## 📦 What Gets Synced

| Item                             | Synced | File               |
| -------------------------------- | ------ | ------------------ |
| Settings (`settings.json`)       | ✅     | `settings.json`    |
| Keybindings (`keybindings.json`) | ✅     | `keybindings.json` |
| Extensions                       | ✅     | `extensions.json`  |
| Snippets                         | ✅     | `snippets.json`    |

### Planned

| Item       | Status  |
| ---------- | ------- |
| Themes     | Planned |
| Tasks      | Planned |

## ⚠️ Known Limitations

- A window reload may be required after pulling a profile
- This extension is designed exclusively for [Antigravity IDE](https://www.antigravity.google/)
