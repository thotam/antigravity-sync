// SyncController — Read/write config, manage extensions
// Key change: detect Antigravity appName

import { readFile } from "fs/promises";
import JSON5 from "json5";
import {
	Extension,
	ExtensionContext,
	ProgressLocation,
	Uri,
	commands,
	env,
	extensions,
	window,
	workspace,
} from "vscode";
import { IKeybinds, IProfile, ISettings } from "../models/interfaces";
import { findConfigFile } from "../utils";
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
		const appName = SyncController.detectAppName();
		logger.info(`Detected editor: ${appName} (env.appName = "${env.appName}")`);

		// Find settings.json
		if (!context.globalState.get("settingsPath")) {
			try {
				const settingsPath = await findConfigFile(appName, "settings.json");
				context.globalState.update("settingsPath", settingsPath);
			} catch (error) {
				logger.error(
					"Failed to automatically find settings.json — opening file picker",
					"SyncController.initialize",
					true
				);
				try {
					const settingsPath = await SyncController.setManualPath("settings");
					context.globalState.update("settingsPath", settingsPath);
				} catch (error) {
					logger.error(
						"Configuration files are required for Antigravity Sync to work. Please reactivate the extension and select the correct files.",
						"SyncController.initialize",
						true
					);
					return undefined;
				}
			}
		}

		// Find keybindings.json
		if (!context.globalState.get("keybindingsPath")) {
			try {
				const keybindingsPath: string = await findConfigFile(
					appName,
					"keybindings.json"
				);
				context.globalState.update("keybindingsPath", keybindingsPath);
			} catch (error) {
				logger.error(
					"Failed to automatically find keybindings.json — opening file picker",
					"SyncController.initialize",
					true
				);
				try {
					const keybindingsPath: string = await SyncController.setManualPath("keybindings");
					context.globalState.update("keybindingsPath", keybindingsPath);
				} catch (error) {
					logger.error(
						"Configuration files are required for Antigravity Sync to work. Please reactivate the extension and select the correct files.",
						"SyncController.initialize",
						true
					);
					return undefined;
				}
			}
		}
		return new SyncController(logger, context);
	}

	/** Detect editor name — supports Antigravity, Code, Cursor */
	private static detectAppName(): string {
		const name = env.appName;
		if (name.includes('Antigravity')) { return 'Antigravity'; }
		if (name.includes('Code')) {
			return name.includes('Insiders') ? 'Code - Insiders' : 'Code';
		}
		if (name.includes('Cursor')) { return 'Cursor'; }
		return name;
	}

	/** Open file dialog for manual config file selection */
	public static async setManualPath(
		t: "keybindings" | "settings",
		title?: string
	): Promise<string> {
		try {
			const manualPath = (await window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: { "JSON files": ["json"] },
				title: title ? title : `Select ${t}.json file`,
			}))!;
			return manualPath[0].fsPath;
		} catch (error) {
			throw error;
		}
	}

	/** Read current settings + keybindings + extensions */
	public async getActiveProfile(): Promise<Partial<IProfile>> {
		const settings = (await this.readConfigFile<ISettings>("settings"))!;
		const keybinds = (await this.readConfigFile<IKeybinds[]>("keybindings"))!;
		const exts: string[] = this.getExtensions()!;

		return {
			settings: settings,
			extensions: exts,
			keybindings: keybinds,
		} as Partial<IProfile>;
	}

	/** Write settings/keybindings + install/uninstall extensions from remote profile */
	public async updateLocalProfile(profile: IProfile) {
		const settingsPath: string = this.context.globalState.get(`settingsPath`)!;
		await this.writeConfigFile(settingsPath, profile.settings);

		const keybindingsPath: string =
			this.context.globalState.get(`keybindingsPath`)!;
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
		} catch (error) {
			this.logger.error(
				`${t} path has not been set, cannot read from empty file path`,
				"SyncController.readConfigFile",
				true,
				error
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

		const confirmBeforeSync = workspace
			.getConfiguration("antigravitysync")
			.get<boolean>("confirmBeforeSync", true);

		if (confirmBeforeSync) {
			const action = await window.showWarningMessage(
				`Sync will:\n• Install ${toInstall.length} extensions\n• Remove ${toDelete.length} extensions\n\nContinue?`,
				{ modal: true },
				"Yes",
				"Show Details",
				"Cancel"
			);

			if (action === "Show Details") {
				const details = [
					toInstall.length > 0 ? `To Install:\n${toInstall.join("\n")}` : "",
					toDelete.length > 0 ? `To Remove:\n${toDelete.join("\n")}` : "",
				]
					.filter(Boolean)
					.join("\n\n");

				await window.showInformationMessage(details, {
					modal: true,
				});
				return;
			}

			if (action !== "Yes") {
				return;
			}
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

				// Process deletions first
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
						this.logger.info(`Uninstalled extension: ${id}`);
					} catch (error) {
						this.logger.error(
							`Failed to uninstall ${id}`,
							"SyncController.installExtensions",
							false,
							error
						);
					}
				}

				// Then installations
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
						this.logger.info(`Installed extension: ${id}`);
					} catch (error) {
						this.logger.error(
							`Failed to install ${id}`,
							"SyncController.installExtensions",
							false,
							error
						);
					}
				}
			}
		);

		if (needsReload) {
			const reload = await window.showInformationMessage(
				"Extension sync complete. Reload window to apply all changes?",
				"Reload",
				"Later"
			);
			if (reload === "Reload") {
				await commands.executeCommand("workbench.action.reloadWindow");
			}
		}
	}
}
