// SyncController — Read/write Antigravity config files
// Simplified: only supports Antigravity

import { readFile, readdir, mkdir, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
    Extension,
    ExtensionContext,
    Uri,
    commands,
    extensions,
    window,
    workspace,
} from "vscode";
import { IProfile, ISyncItem } from "../models/interfaces";
import Logger from "./logger";

export default class SyncController {
    context: ExtensionContext;
    logger: Logger;

    private constructor(logger: Logger, context: ExtensionContext) {
        this.logger = logger;
        this.context = context;
    }

    /** Initialize controller — find settings.json & keybindings.json */
    public static async initialize(
        logger: Logger,
        context: ExtensionContext
    ): Promise<SyncController | undefined> {
        // Try to auto-detect config file paths
        for (const fileType of ["settings", "keybindings"] as const) {
            if (!context.globalState.get(`${fileType}Path`)) {
                const found = await SyncController.findConfigFile(fileType, logger);
                if (found) {
                    context.globalState.update(`${fileType}Path`, found);
                    logger.info(`Found ${fileType}.json: ${found}`);
                } else {
                    logger.error(
                        `Cannot find ${fileType}.json — opening file picker`,
                        "SyncController.initialize",
                        true
                    );
                    try {
                        const manualPath = await SyncController.setManualPath(fileType);
                        context.globalState.update(`${fileType}Path`, manualPath);
                    } catch {
                        logger.error(
                            `${fileType}.json is required. Please reactivate the extension.`,
                            "SyncController.initialize",
                            true
                        );
                        return undefined;
                    }
                }
            }
        }
        return new SyncController(logger, context);
    }

    /** Try multiple possible paths to find config file */
    private static async findConfigFile(
        file: "settings" | "keybindings",
        logger: Logger
    ): Promise<string | null> {
        const candidates = SyncController.getConfigPaths(`${file}.json`);
        for (const path of candidates) {
            try {
                await workspace.fs.stat(Uri.file(path));
                return path;
            } catch {
                logger.info(`Not found: ${path}`);
            }
        }
        return null;
    }

    /** Trả về danh sách các đường dẫn cấu hình khả dĩ cho tệp hoặc thư mục tương đối */
    private static getConfigPaths(relativePath: string): string[] {
        const appName = "Antigravity IDE";
        switch (os.platform()) {
            case "win32":
                return [
                    `${process.env.APPDATA}\\${appName}\\User\\${relativePath}`,
                    `${process.env.USERPROFILE}\\AppData\\Roaming\\${appName}\\User\\${relativePath}`,
                ];
            case "darwin":
                return [
                    `${process.env.HOME}/Library/Application Support/${appName}/User/${relativePath}`,
                    `${os.homedir()}/Library/Application Support/${appName}/User/${relativePath}`,
                ];
            default:
                return [
                    `${process.env.HOME}/.config/${appName}/User/${relativePath}`,
                    `${process.env.XDG_CONFIG_HOME || `${os.homedir()}/.config`}/${appName}/User/${relativePath}`,
                    `${os.homedir()}/.config/${appName}/User/${relativePath}`,
                ];
        }
    }

    /** Open file dialog for manual config file selection */
    public static async setManualPath(
        t: "keybindings" | "settings",
        title?: string
    ): Promise<string> {
        const manualPath = (await window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { "JSON files": ["json"] },
            title: title || `Select ${t}.json file`,
        }))!;
        return manualPath[0].fsPath;
    }

    /** Read current config based on enabled sync items */
    public async getActiveProfile(syncItems: ISyncItem[]): Promise<IProfile> {
        const data: Record<string, any> = {};

        for (const item of syncItems.filter(i => i.enabled)) {
            switch (item.key) {
                case "settings":
                    data.settings = await this.readConfigRaw("settings");
                    break;
                case "keybindings":
                    data.keybindings = await this.readConfigRaw("keybindings");
                    break;
                case "extensions":
                    data.extensions = this.getExtensions();
                    break;
                case "snippets":
                    data.snippets = await this.readSnippets();
                    break;
                default:
                    break;
            }
        }

        return { profileName: "", data };
    }

    /** Write config based on enabled sync items (extensions handled by provider separately) */
    public async updateLocalProfile(profile: IProfile, syncItems: ISyncItem[]) {
        for (const item of syncItems.filter(i => i.enabled)) {
            switch (item.key) {
                case "settings": {
                    const settingsPath: string = this.context.globalState.get("settingsPath")!;
                    if (profile.data.settings) {
                        await this.writeConfigRaw(settingsPath, profile.data.settings);
                    }
                    break;
                }
                case "keybindings": {
                    const keybindingsPath: string = this.context.globalState.get("keybindingsPath")!;
                    if (profile.data.keybindings) {
                        await this.writeConfigRaw(keybindingsPath, profile.data.keybindings);
                    }
                    break;
                }
                case "snippets": {
                    if (profile.data.snippets) {
                        await this.writeSnippets(profile.data.snippets);
                    }
                    break;
                }
                // extensions handled by provider (via getExtensionDiff + applyExtensionSync)
                default:
                    break;
            }
        }
    }

    /** Read config file as base64 — preserves comments/whitespace */
    private async readConfigRaw(t: "keybindings" | "settings"): Promise<string | undefined> {
        let filePath: string;
        try {
            filePath = this.context.globalState.get(`${t}Path`)!;
        } catch {
            this.logger.error(`${t} path has not been set`, "SyncController.readConfigRaw", true);
            return undefined;
        }
        try {
            const buffer = await readFile(filePath);
            return buffer.toString("base64");
        } catch (error) {
            this.logger.error(`Failed to read ${t} file: ${filePath}`, "SyncController.readConfigRaw", true, error);
            return undefined;
        }
    }

    /** Write base64-encoded config file back to disk */
    private async writeConfigRaw(filePath: string, base64Content: string): Promise<void> {
        try {
            await workspace.fs.writeFile(
                Uri.file(filePath),
                Buffer.from(base64Content, "base64")
            );
            this.logger.info(`Configuration file updated: ${filePath}`);
        } catch (error) {
            this.logger.error(`Failed to write config file: ${filePath}`, "SyncController.writeConfigRaw", true, error);
            throw error;
        }
    }

    /** Get list of installed extensions (excluding built-in) */
    private getExtensions(): string[] {
        const excludeList =
            workspace
                .getConfiguration("antigravitysync")
                .get<string[]>("excludeExtensions") || [];
        return extensions.all
            .filter((ext: Extension<any>) => !ext.packageJSON.isBuiltin)
            .map((ext: Extension<any>) => ext.id)
            .filter((id) => !excludeList.includes(id));
    }

    // ===== Snippets helpers =====

    /** Try multiple possible paths to find a config directory */
    private static async findConfigDir(dir: string, logger: Logger): Promise<string | null> {
        const candidates = SyncController.getConfigPaths(dir);
        for (const p of candidates) {
            try {
                await workspace.fs.stat(Uri.file(p));
                return p;
            } catch {
                logger.info(`Not found: ${p}`);
            }
        }
        return null;
    }

    /** Read all snippet files → bundled object { fileName: base64content } */
    private async readSnippets(): Promise<Record<string, string>> {
        const dir = await SyncController.findConfigDir("snippets", this.logger);
        const bundle: Record<string, string> = {};
        if (!dir) { return bundle; }
        try {
            const entries = await readdir(dir);
            for (const entry of entries) {
                if (entry.endsWith(".json") || entry.endsWith(".code-snippets")) {
                    const filePath = path.join(dir, entry);
                    const raw = await readFile(filePath);
                    bundle[entry] = raw.toString("base64");
                }
            }
        } catch {
            // Directory doesn't exist or is empty
        }
        return bundle;
    }

    /** Write bundled snippets back to individual files */
    private async writeSnippets(bundle: Record<string, string>): Promise<void> {
        let dir = await SyncController.findConfigDir("snippets", this.logger);
        if (!dir) {
            // Fallback: create at first candidate path
            dir = SyncController.getConfigPaths("snippets")[0];
        }
        await mkdir(dir, { recursive: true });
        for (const [fileName, base64Content] of Object.entries(bundle)) {
            const filePath = path.join(dir, fileName);
            await writeFile(filePath, Buffer.from(base64Content, "base64"));
        }
        this.logger.info(`Snippets synced: ${Object.keys(bundle).length} file(s)`);
    }

    /** Compare local vs remote extensions — returns diff for provider confirmation */
    public getExtensionDiff(remoteList: string[]): { toInstall: string[]; toDelete: string[] } {
        const localList = this.getExtensions();
        const localSet = new Set(localList);
        const remoteSet = new Set(remoteList);

        return {
            toInstall: remoteList.filter((id) => !localSet.has(id)),
            toDelete: localList.filter((id) => !remoteSet.has(id)),
        };
    }

    /** Apply extension sync — install/uninstall without confirm (provider already confirmed) */
    public async applyExtensionSync(toInstall: string[], toDelete: string[]): Promise<boolean> {
        let needsReload = false;

        for (const id of toDelete) {
            try {
                await commands.executeCommand("workbench.extensions.uninstallExtension", id);
                needsReload = true;
            } catch (error) {
                this.logger.error(`Failed to uninstall ${id}`, "applyExtensionSync", false, error);
            }
        }

        for (const id of toInstall) {
            try {
                await commands.executeCommand("workbench.extensions.installExtension", id);
                needsReload = true;
            } catch (error) {
                this.logger.error(`Failed to install ${id}`, "applyExtensionSync", false, error);
            }
        }

        return needsReload;
    }
}
