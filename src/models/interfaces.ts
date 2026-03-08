// TypeScript interfaces cho Antigravity Sync
// Extensible sync architecture with SyncItem registry

/** Định nghĩa một mục sync — registry pattern */
export interface ISyncItem {
    key: string;           // "settings" | "extensions" | "keybindings" | ...
    fileName: string;      // "settings.json", "extensions.json", ...
    label: string;         // Tên hiển thị cho UI
    icon: string;          // Codicon name
    enabled: boolean;      // Mặc định có sync không
}

/** Registry mặc định — thêm data type mới chỉ cần thêm entry */
export const DEFAULT_SYNC_ITEMS: ISyncItem[] = [
    { key: "settings",    fileName: "settings.json",    label: "Settings",    icon: "settings-gear", enabled: true },
    { key: "extensions",  fileName: "extensions.json",  label: "Extensions",  icon: "extensions",    enabled: true },
    { key: "keybindings", fileName: "keybindings.json", label: "Keybindings", icon: "keyboard",      enabled: true },
    { key: "snippets",    fileName: "snippets.json",    label: "Snippets",    icon: "symbol-snippet",  enabled: true },
];

/** Profile metadata — stored as meta.json inside profile folder */
export interface IProfileMeta {
    name: string;
    createdAt: string;  // ISO 8601
    updatedAt: string;  // ISO 8601
    syncKeys: string[]; // Keys đã sync: ["settings", "extensions", "keybindings"]
}

/** Full profile data — dynamic, keyed by ISyncItem.key */
export interface IProfile {
    profileName: string;
    data: Record<string, any>;  // { settings: {...}, extensions: [...], keybindings: [...] }
}

/** Root sync-meta.json — lưu syncKeys tất cả profiles ở root appDataFolder */
export type ISyncMeta = Record<string, string[]>;
// { "work": ["settings", "extensions"], "home": ["settings"] }
