// SyncController — Read/write Antigravity config files
// Simplified: only supports Antigravity

import { readFile } from "fs/promises";
import * as os from "os";
import JSON5 from "json5";
import {
    Extension,
    ExtensionContext,
    ProgressLocation,
    Uri,
    commands,
    extensions,
    window,
    workspace,
} from "vscode";
import { IKeybinds, IProfile, ISettings } from "../models/interfaces";
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

    /** Read current settings + keybindings + extensions */
    public async getActiveProfile(): Promise<Partial<IProfile>> {
        const settings = (await this.readConfigFile<ISettings>("settings"))!;
        const keybinds = (await this.readConfigFile<IKeybinds[]>("keybindings"))!;
        const exts: string[] = this.getExtensions()!;

        return {
            settings,
            extensions: exts,
            keybindings: keybinds,
        } as Partial<IProfile>;
    }

    /** Write settings/keybindings + install/uninstall extensions from remote profile */
    public async updateLocalProfile(profile: IProfile) {
        const settingsPath: string = this.context.globalState.get("settingsPath")!;
        await this.writeConfigFile(settingsPath, profile.settings);

        const keybindingsPath: string =
            this.context.globalState.get("keybindingsPath")!;
        await this.writeConfigFile(keybindingsPath, profile.keybindings);

        await this.installExtensions(profile.extensions);
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

    /** Install/uninstall extensions — compare local vs remote */
    private async installExtensions(remoteList: string[]) {
        const localList: string[] = this.getExtensions();
        const localSet = new Set(localList);
        const remoteSet = new Set(remoteList);

        const toInstall = remoteList.filter((id) => !localSet.has(id));
        const toDelete = localList.filter((id) => !remoteSet.has(id));

        if (toInstall.length === 0 && toDelete.length === 0) {
            window.showInformationMessage("Extensions are already in sync");
            return;
        }

        const confirm = await window.showWarningMessage(
            `Sync will install ${toInstall.length} and remove ${toDelete.length} extensions. Continue?`,
            { modal: true },
            "Yes",
            "Cancel"
        );

        if (confirm !== "Yes") {
            return;
        }

        let needsReload = false;

        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: "Syncing Extensions",
                cancellable: false,
            },
            async (progress) => {
                const total = toInstall.length + toDelete.length;
                let completed = 0;

                for (const id of toDelete) {
                    try {
                        progress.report({
                            message: `Uninstalling ${id}...`,
                            increment: (++completed / total) * 100,
                        });
                        await commands.executeCommand(
                            "workbench.extensions.uninstallExtension",
                            id
                        );
                        needsReload = true;
                    } catch (error) {
                        this.logger.error(
                            `Failed to uninstall ${id}`,
                            "installExtensions",
                            false,
                            error
                        );
                    }
                }

                for (const id of toInstall) {
                    try {
                        progress.report({
                            message: `Installing ${id}...`,
                            increment: (++completed / total) * 100,
                        });
                        await commands.executeCommand(
                            "workbench.extensions.installExtension",
                            id
                        );
                        needsReload = true;
                    } catch (error) {
                        this.logger.error(
                            `Failed to install ${id}`,
                            "installExtensions",
                            false,
                            error
                        );
                    }
                }
            }
        );

        if (needsReload) {
            const reload = await window.showInformationMessage(
                "Extension sync complete. Reload to apply?",
                "Reload",
                "Later"
            );
            if (reload === "Reload") {
                await commands.executeCommand("workbench.action.reloadWindow");
            }
        }
    }
}
