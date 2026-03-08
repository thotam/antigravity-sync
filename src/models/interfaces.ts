// TypeScript interfaces for Antigravity Sync
// Extensible sync architecture with SyncItem registry

/** Defines a sync item — registry pattern */
export interface ISyncItem {
    key: string;           // "settings" | "extensions" | "keybindings" | ...
    fileName: string;      // "settings.json", "extensions.json", ...
    label: string;         // Display name for UI
    icon: string;          // Codicon name
    enabled: boolean;      // Sync by default
}

/** Default registry — add new data types by adding entries */
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
    syncKeys: string[]; // Synced keys: ["settings", "extensions", "keybindings"]
}

/** Full profile data — dynamic, keyed by ISyncItem.key */
export interface IProfile {
    profileName: string;
    data: Record<string, any>;  // { settings: {...}, extensions: [...], keybindings: [...] }
}

/** Root sync-meta.json — stores syncKeys for all profiles at root appDataFolder */
export type ISyncMeta = Record<string, string[]>;
// { "work": ["settings", "extensions"], "home": ["settings"] }
