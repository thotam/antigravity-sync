// Entry point — Antigravity Sync Extension (Google Drive)
// Commands, StatusBar, initialize controller & Google Drive service

import * as vscode from "vscode";
import Logger from "./core/logger";
import GoogleAuth from "./core/google-auth";
import GoogleDriveService from "./core/google-drive";
import { IProfile } from "./models/interfaces";
import SyncController from "./core/sync-controller";

export let logger: Logger;
let statusBarItem: vscode.StatusBarItem;

export async function activate(ctx: vscode.ExtensionContext) {
    try {
        // Initialize Logger
        logger = new Logger();
        logger.info("Extension activation started");

        // Only support Antigravity IDE
        if (vscode.env.appName !== "Antigravity") {
            vscode.window.showWarningMessage(
                `Antigravity Sync is designed exclusively for Antigravity IDE. ` +
                `You are currently using "${vscode.env.appName}". ` +
                `Some features may not work correctly.`,
                "Continue Anyway",
                "Dismiss"
            ).then((choice) => {
                if (choice !== "Continue Anyway") {
                    deactivate(true);
                }
            });
            logger.warn(`Non-Antigravity IDE detected: ${vscode.env.appName}`);
        }

        // Initialize StatusBar
        statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        statusBarItem.command = "antigravitysync.showmenu";
        statusBarItem.show();

        // Initialize SyncController
        const controller = await SyncController.initialize(logger, ctx);
        if (!controller) {
            logger.error(
                "Failed to initialize Antigravity Sync",
                "activate",
                true
            );
            deactivate(true);
            return;
        }

        // Initialize Google Auth
        const auth = new GoogleAuth(logger, ctx);

        // Initialize Google Drive Service
        const drive = new GoogleDriveService(auth, logger);

        // Update StatusBar based on auth state
        async function updateStatusBar() {
            const authenticated = await auth.isAuthenticated();
            if (authenticated) {
                const info = await auth.getAccountInfo();
                statusBarItem.text = `$(sync) ${info?.email || "Antigravity Sync"}`;
                statusBarItem.tooltip = `Antigravity Sync: Logged in as ${info?.email || "Google"}`;
            } else {
                statusBarItem.text = "$(sync~spin) Antigravity Sync — Login Required";
                statusBarItem.tooltip =
                    "Click to login with Google";
            }
        }
        await updateStatusBar();

        // ===== Commands =====

        const Login = vscode.commands.registerCommand(
            "antigravitysync.login",
            async () => {
                try {
                    await auth.login();
                    await updateStatusBar();
                } catch (error: any) {
                    logger.error(
                        `Login failed: ${error?.message}`,
                        "Login",
                        true,
                        error
                    );
                }
            }
        );

        const Logout = vscode.commands.registerCommand(
            "antigravitysync.logout",
            async () => {
                const confirm = await vscode.window.showWarningMessage(
                    "Are you sure you want to logout from Google?",
                    "Yes",
                    "Cancel"
                );
                if (confirm === "Yes") {
                    await auth.logout();
                    await updateStatusBar();
                }
            }
        );

        const CreateProfile = vscode.commands.registerCommand(
            "antigravitysync.createprofile",
            async () => {
                if (!(await ensureAuth(auth))) { return; }
                try {
                    const profileName = await vscode.window.showInputBox({
                        prompt: "Enter profile name",
                        validateInput: (value) => {
                            if (!value || value.trim().length === 0) {
                                return "Profile name cannot be empty";
                            }
                            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                                return "Only letters, numbers, hyphens, and underscores";
                            }
                            return null;
                        },
                    });
                    if (!profileName) { return; }

                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `Creating profile "${profileName}"...`,
                            cancellable: false,
                        },
                        async (progress) => {
                            progress.report({ message: "Reading current config..." });
                            const current = await controller.getActiveProfile();
                            const profile: IProfile = {
                                profileName,
                                settings: current.settings!,
                                extensions: current.extensions!,
                                keybindings: current.keybindings!,
                            };

                            progress.report({ message: "Uploading to Google Drive..." });
                            await drive.saveProfile(profile);

                            vscode.window.showInformationMessage(
                                `Profile "${profileName}" created successfully!`
                            );
                        }
                    );
                } catch (error) {
                    logger.error("Failed to create profile", "CreateProfile", true, error);
                }
            }
        );

        const PullProfile = vscode.commands.registerCommand(
            "antigravitysync.pullprofile",
            async () => {
                if (!(await ensureAuth(auth))) { return; }
                try {
                    const files = await drive.listProfiles();
                    if (files.length === 0) {
                        vscode.window.showInformationMessage("No profiles found");
                        return;
                    }

                    const selected = await vscode.window.showQuickPick(
                        files.map((f) => ({
                            label: f.name.replace(".json", ""),
                            description: f.modifiedTime
                                ? `Last modified: ${new Date(f.modifiedTime).toLocaleString()}`
                                : "",
                            fileName: f.name,
                        })),
                        { placeHolder: "Select a profile to pull" }
                    );
                    if (!selected) { return; }

                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `Pulling profile "${selected.label}"...`,
                            cancellable: false,
                        },
                        async (progress) => {
                            progress.report({ message: "Downloading from Google Drive..." });
                            const profile = await drive.getProfile(selected.fileName);
                            if (!profile) {
                                throw new Error("Profile data is empty");
                            }

                            progress.report({ message: "Applying locally..." });
                            await controller.updateLocalProfile(profile);
                        }
                    );

                    const reload = await vscode.window.showInformationMessage(
                        `Profile "${selected.label}" applied! Reload to see all changes?`,
                        "Reload Now",
                        "Later"
                    );
                    if (reload === "Reload Now") {
                        await vscode.commands.executeCommand(
                            "workbench.action.reloadWindow"
                        );
                    }
                } catch (error) {
                    logger.error("Failed to pull profile", "PullProfile", true, error);
                }
            }
        );

        const UpdateProfile = vscode.commands.registerCommand(
            "antigravitysync.updateprofile",
            async () => {
                if (!(await ensureAuth(auth))) { return; }
                try {
                    const files = await drive.listProfiles();
                    if (files.length === 0) {
                        vscode.window.showInformationMessage("No profiles found to update");
                        return;
                    }

                    const selected = await vscode.window.showQuickPick(
                        files.map((f) => ({
                            label: f.name.replace(".json", ""),
                            fileName: f.name,
                        })),
                        { placeHolder: "Select a profile to update" }
                    );
                    if (!selected) { return; }

                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `Updating profile "${selected.label}"...`,
                            cancellable: false,
                        },
                        async (progress) => {
                            progress.report({ message: "Reading current config..." });
                            const current = await controller.getActiveProfile();
                            const profile: IProfile = {
                                profileName: selected.label,
                                settings: current.settings!,
                                extensions: current.extensions!,
                                keybindings: current.keybindings!,
                            };

                            progress.report({ message: "Uploading to Google Drive..." });
                            await drive.saveProfile(profile);

                            vscode.window.showInformationMessage(
                                `Profile "${selected.label}" updated successfully!`
                            );
                        }
                    );
                } catch (error) {
                    logger.error("Failed to update profile", "UpdateProfile", true, error);
                }
            }
        );

        const DeleteProfile = vscode.commands.registerCommand(
            "antigravitysync.deleteprofile",
            async () => {
                if (!(await ensureAuth(auth))) { return; }
                try {
                    const files = await drive.listProfiles();
                    if (files.length === 0) {
                        vscode.window.showInformationMessage("No profiles found to delete");
                        return;
                    }

                    const selected = await vscode.window.showQuickPick(
                        files.map((f) => ({
                            label: f.name.replace(".json", ""),
                            fileName: f.name,
                        })),
                        { placeHolder: "Select a profile to delete" }
                    );
                    if (!selected) { return; }

                    const confirm = await vscode.window.showWarningMessage(
                        `Delete profile "${selected.label}"?`,
                        { modal: true },
                        "Delete",
                        "Cancel"
                    );
                    if (confirm !== "Delete") { return; }

                    await drive.deleteProfile(selected.label);
                    vscode.window.showInformationMessage(
                        `Profile "${selected.label}" deleted.`
                    );
                } catch (error) {
                    logger.error("Failed to delete profile", "DeleteProfile", true, error);
                }
            }
        );

        const ShowMenu = vscode.commands.registerCommand(
            "antigravitysync.showmenu",
            async () => {
                const isAuth = await auth.isAuthenticated();
                const options = isAuth
                    ? [
                          { label: "$(plus) Create Profile", command: "antigravitysync.createprofile" },
                          { label: "$(cloud-download) Pull Profile", command: "antigravitysync.pullprofile" },
                          { label: "$(sync) Update Profile", command: "antigravitysync.updateprofile" },
                          { label: "$(trash) Delete Profile", command: "antigravitysync.deleteprofile" },
                          { label: "$(output) Show Logs", command: "antigravitysync.showlogs" },
                          { label: "$(file-symlink-directory) Set Paths Manually", command: "antigravitysync.setpathsmanually" },
                          { label: "$(sign-out) Logout", command: "antigravitysync.logout" },
                      ]
                    : [
                          { label: "$(sign-in) Login with Google", command: "antigravitysync.login" },
                          { label: "$(output) Show Logs", command: "antigravitysync.showlogs" },
                      ];

                const selected = await vscode.window.showQuickPick(options, {
                    placeHolder: isAuth ? "Choose an action" : "Login to get started",
                });
                if (selected) {
                    await vscode.commands.executeCommand(selected.command);
                }
            }
        );

        const SetManualPath = vscode.commands.registerCommand(
            "antigravitysync.setpathsmanually",
            async () => {
                const options = [
                    { label: "$(settings) Set Settings Path", type: "settings" as const },
                    { label: "$(keyboard) Set Keybindings Path", type: "keybindings" as const },
                ];
                const selected = await vscode.window.showQuickPick(options, {
                    placeHolder: "Choose configuration file to set",
                });
                if (selected) {
                    try {
                        const path = await SyncController.setManualPath(selected.type);
                        ctx.globalState.update(`${selected.type}Path`, path);
                        vscode.window.showInformationMessage(
                            `${selected.type} path updated!`
                        );
                    } catch (error) {
                        logger.error(
                            `Failed to set ${selected.type} path`,
                            "SetManualPath",
                            true,
                            error
                        );
                    }
                }
            }
        );

        const ShowLogs = vscode.commands.registerCommand(
            "antigravitysync.showlogs",
            () => { logger.show(); }
        );

        // Register all commands
        ctx.subscriptions.push(
            Login, Logout,
            CreateProfile, PullProfile, UpdateProfile, DeleteProfile,
            ShowMenu, SetManualPath, ShowLogs,
            statusBarItem, logger
        );

        logger.info("Extension activated successfully", false, "activate");
    } catch (error) {
        logger.error(`${error}`, "activate", false, error);
    }
}

/** Helper — ensure user is logged in before action */
async function ensureAuth(auth: GoogleAuth): Promise<boolean> {
    if (await auth.isAuthenticated()) {
        return true;
    }
    const action = await vscode.window.showWarningMessage(
        "Please login with Google to use Antigravity Sync.",
        "Login Now",
        "Cancel"
    );
    if (action === "Login Now") {
        await vscode.commands.executeCommand("antigravitysync.login");
        return auth.isAuthenticated();
    }
    return false;
}

export function deactivate(preserveLogger: boolean = false) {
    logger?.info("Extension deactivated");
    statusBarItem?.dispose();
    if (!preserveLogger) {
        logger?.dispose();
    }
}
