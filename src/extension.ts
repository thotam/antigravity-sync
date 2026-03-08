// Entry point — Antigravity Sync Extension (Google Drive)
// Dashboard-only UI, StatusBar, initialize controller & Google Drive service

import * as vscode from "vscode";
import Logger from "./core/logger";
import GoogleAuth from "./core/google-auth";
import GoogleDriveService from "./core/google-drive";
import SyncController from "./core/sync-controller";
import DashboardProvider from "./providers/dashboard-provider";

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
        statusBarItem.command = "antigravitysync.showDashboard";
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

        // Initialize Dashboard Provider
        const dashboard = new DashboardProvider(ctx, auth, drive, controller, logger);

        // Update StatusBar based on auth state
        async function updateStatusBar() {
            const authenticated = await auth.isAuthenticated();
            if (authenticated) {
                const info = await auth.getAccountInfo();
                statusBarItem.text = `$(sync) ${info?.email || "Antigravity Sync"}`;
                statusBarItem.tooltip = `Antigravity Sync: Logged in — Click to open Dashboard`;
            } else {
                statusBarItem.text = "$(sync~spin) Antigravity Sync — Login Required";
                statusBarItem.tooltip = "Click to open Dashboard and sign in";
            }
        }
        await updateStatusBar();

        // ===== Commands =====

        const ShowDashboard = vscode.commands.registerCommand(
            "antigravitysync.showDashboard",
            () => { dashboard.show(); }
        );

        // Register all commands
        ctx.subscriptions.push(
            ShowDashboard,
            statusBarItem, logger
        );

        logger.info("Extension activated successfully", false, "activate");
    } catch (error) {
        logger.error(`${error}`, "activate", false, error);
    }
}

/** Helper — ensure user is logged in before action */
export async function ensureAuth(auth: GoogleAuth): Promise<boolean> {
    if (await auth.isAuthenticated()) {
        return true;
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
