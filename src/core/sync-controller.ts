// SyncController — Read/write Antigravity config files
// Simplified: only supports Antigravity

import { readFile } from "fs/promises";
import * as os from "os";
import JSON5 from "json5";
import {
    Extension,
    ExtensionContext,
    Uri,
    commands,
    extensions,
    window,
    workspace,
} from "vscode";
import { IKeybinds, IProfile, ISettings, ISyncItem } from "../models/interfaces";
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

    /** Return possible config paths with fallbacks based on platform */
    private static getConfigPaths(file: string): string[] {
        const appName = "Antigravity";
        switch (os.platform()) {
            case "win32":
                return [
                    `${process.env.APPDATA}\\${appName}\\User\\${file}`,
                    `${process.env.USERPROFILE}\\AppData\\Roaming\\${appName}\\User\\${file}`,
                ];
            case "darwin":
                return [
                    `${process.env.HOME}/Library/Application Support/${appName}/User/${file}`,
                    `${os.homedir()}/Library/Application Support/${appName}/User/${file}`,
                ];
            default:
                return [
                    `${process.env.HOME}/.config/${appName}/User/${file}`,
                    `${process.env.XDG_CONFIG_HOME || `${os.homedir()}/.config`}/${appName}/User/${file}`,
                    `${os.homedir()}/.config/${appName}/User/${file}`,
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
                    data.settings = (await this.readConfigFile<ISettings>("settings")) ?? {};
                    break;
                case "keybindings":
                    data.keybindings = (await this.readConfigFile<IKeybinds[]>("keybindings")) ?? [];
                    break;
                case "extensions":
                    data.extensions = this.getExtensions();
                    break;
                default:
                    // Các data type mới sẽ thêm case ở đây
                    break;
            }
        }

        return { profileName: "", data };
    }

    /** Write config based on enabled sync items (không sync extension — provider xử lý riêng) */
    public async updateLocalProfile(profile: IProfile, syncItems: ISyncItem[]) {
        for (const item of syncItems.filter(i => i.enabled)) {
            switch (item.key) {
                case "settings": {
                    const settingsPath: string = this.context.globalState.get("settingsPath")!;
                    if (profile.data.settings) {
                        await this.writeConfigFile(settingsPath, profile.data.settings);
                    }
                    break;
                }
                case "keybindings": {
                    const keybindingsPath: string = this.context.globalState.get("keybindingsPath")!;
                    if (profile.data.keybindings) {
                        await this.writeConfigFile(keybindingsPath, profile.data.keybindings);
                    }
                    break;
                }
                // extensions xử lý bởi provider (qua getExtensionDiff + applyExtensionSync)
                default:
                    break;
            }
        }
    }

    /** Read config file (JSON5 — supports comments) */
    private async readConfigFile<T>(
        t: "keybindings" | "settings"
    ): Promise<T | undefined> {
        let path: string;
        try {
            path = this.context.globalState.get(`${t}Path`)!;
        } catch {
            this.logger.error(
                `${t} path has not been set`,
                "SyncController.readConfigFile",
                true
            );
            return undefined;
        }
        try {
            const buffer = await readFile(path, "utf-8");
            return JSON5.parse(buffer) as T;
        } catch (error) {
            this.logger.error(
                `Failed to read ${t} file: ${path}`,
                "SyncController.readConfigFile",
                true,
                error
            );
            return undefined;
        }
    }

    /** Write config file */
    private async writeConfigFile(path: string, data: string | any) {
        try {
            const content =
                typeof data === "string" ? data : JSON.stringify(data, null, 2);
            await workspace.fs.writeFile(
                Uri.file(path),
                Buffer.from(content, "utf8")
            );
            this.logger.info(`Configuration file updated: ${path}`);
        } catch (error) {
            this.logger.error(
                `Failed to write config file: ${path}`,
                "SyncController.writeConfigFile",
                true,
                error
            );
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

    /** Compare local vs remote extensions — trả về diff để provider confirm */
    public getExtensionDiff(remoteList: string[]): { toInstall: string[]; toDelete: string[] } {
        const localList = this.getExtensions();
        const localSet = new Set(localList);
        const remoteSet = new Set(remoteList);

        return {
            toInstall: remoteList.filter((id) => !localSet.has(id)),
            toDelete: localList.filter((id) => !remoteSet.has(id)),
        };
    }

    /** Apply extension sync — install/uninstall without confirm (provider đã confirm) */
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
