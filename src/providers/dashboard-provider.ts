// DashboardProvider — Manages Full Webview Panel Dashboard
// Creates an editor tab containing the dashboard UI for Antigravity Sync

import * as vscode from "vscode";
import GoogleAuth from "../core/google-auth";
import GoogleDriveService from "../core/google-drive";
import SyncController from "../core/sync-controller";
import Logger from "../core/logger";

/** Dashboard state sent to webview */
interface DashboardState {
    isAuthenticated: boolean;
    email?: string;
    picture?: string;
    profiles: Array<{ name: string; fileName: string; modifiedTime?: string }>;
}

/** Message from webview to extension */
interface WebviewMessage {
    command: string;
    name?: string;
    fileName?: string;
    type?: "settings" | "keybindings";
    folderId?: string;
    folderName?: string;
    fileId?: string;
    pageToken?: string;
}

export default class DashboardProvider {
    private panel: vscode.WebviewPanel | undefined;
    private readonly extensionUri: vscode.Uri;
    private readonly auth: GoogleAuth;
    private readonly drive: GoogleDriveService;
    private readonly controller: SyncController;
    private readonly logger: Logger;
    private readonly context: vscode.ExtensionContext;

    constructor(
        context: vscode.ExtensionContext,
        auth: GoogleAuth,
        drive: GoogleDriveService,
        controller: SyncController,
        logger: Logger
    ) {
        this.context = context;
        this.extensionUri = context.extensionUri;
        this.auth = auth;
        this.drive = drive;
        this.controller = controller;
        this.logger = logger;
    }

    /** Open or focus the dashboard panel */
    public show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            this.refreshState();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            "antigravitysync.dashboard",
            "Antigravity Sync",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
                ],
            }
        );

        this.panel.iconPath = vscode.Uri.joinPath(
            this.extensionUri,
            "images",
            "icon.png"
        );

        this.panel.webview.html = this.getHtmlContent(this.panel.webview);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            (message: WebviewMessage) => this.handleMessage(message),
            undefined,
            this.context.subscriptions
        );

        // Cleanup when panel is closed
        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            undefined,
            this.context.subscriptions
        );

        // Send initial state when webview is ready
        this.refreshState();
    }

    /** Send updated state to webview */
    public async refreshState() {
        if (!this.panel) { return; }

        try {
            const isAuthenticated = await this.auth.isAuthenticated();
            let email: string | undefined;
            let picture: string | undefined;
            let profiles: DashboardState["profiles"] = [];

            if (isAuthenticated) {
                try {
                    const info = await this.auth.getAccountInfo();
                    email = info?.email;
                    picture = info?.picture;
                } catch (error) {
                    this.logger.error(
                        "Failed to fetch account info",
                        "DashboardProvider.refreshState",
                        false,
                        error
                    );
                }

                try {
                    const files = await this.drive.listProfiles();
                    profiles = files.map((f) => ({
                        name: f.name.replace(".json", ""),
                        fileName: f.name,
                        modifiedTime: f.modifiedTime,
                    }));
                } catch (error) {
                    this.logger.error(
                        "Failed to load profiles list",
                        "DashboardProvider.refreshState",
                        false,
                        error
                    );
                }
            }

            const state: DashboardState = { isAuthenticated, email, picture, profiles };
            this.panel.webview.postMessage({ type: "state", data: state });
        } catch (error) {
            this.logger.error(
                "Failed to update dashboard state",
                "DashboardProvider.refreshState",
                false,
                error
            );
        }
    }

    /** Handle messages from webview */
    private async handleMessage(message: WebviewMessage) {
        const sendLoading = (action: string, loading: boolean) => {
            this.panel?.webview.postMessage({ type: "loading", action, loading });
        };
        const sendToast = (level: "info" | "success" | "error", text: string) => {
            this.panel?.webview.postMessage({ type: "toast", level, message: text });
        };

        try {
            switch (message.command) {
                case "getState":
                    await this.refreshState();
                    break;

                case "login":
                    sendLoading("login", true);
                    try {
                        await this.auth.login();
                        sendToast("success", "Signed in successfully!");
                    } catch (loginErr: any) {
                        sendToast("error", loginErr?.message || "Login failed");
                    }
                    await this.refreshState();
                    sendLoading("login", false);
                    break;

                case "logout":
                    await this.auth.logout();
                    await this.refreshState();
                    sendToast("info", "Signed out");
                    break;

                case "createProfile": {
                    if (!message.name) { return; }
                    sendLoading("createProfile", true);
                    const current = await this.controller.getActiveProfile();
                    await this.drive.saveProfile({
                        profileName: message.name,
                        settings: current.settings!,
                        extensions: current.extensions!,
                        keybindings: current.keybindings!,
                    });
                    await this.refreshState();
                    sendLoading("createProfile", false);
                    sendToast("success", `Profile "${message.name}" created`);
                    break;
                }

                case "pullProfile": {
                    if (!message.fileName) { return; }
                    sendLoading(`pull-${message.fileName}`, true);
                    const profile = await this.drive.getProfile(message.fileName);
                    if (!profile) {
                        sendToast("error", "Profile data is empty");
                        sendLoading(`pull-${message.fileName}`, false);
                        return;
                    }
                    await this.controller.updateLocalProfile(profile);
                    sendLoading(`pull-${message.fileName}`, false);
                    sendToast("success", `Profile "${message.fileName.replace(".json", "")}" pulled`);

                    // Ask user to reload via webview modal
                    this.panel?.webview.postMessage({ type: "askReload" });
                    break;
                }

                case "updateProfile": {
                    if (!message.fileName) { return; }
                    const profileName = message.fileName.replace(".json", "");
                    sendLoading(`push-${message.fileName}`, true);
                    const current = await this.controller.getActiveProfile();
                    await this.drive.saveProfile({
                        profileName,
                        settings: current.settings!,
                        extensions: current.extensions!,
                        keybindings: current.keybindings!,
                    });
                    await this.refreshState();
                    sendLoading(`push-${message.fileName}`, false);
                    sendToast("success", `Profile "${profileName}" updated`);
                    break;
                }

                case "deleteProfile": {
                    if (!message.fileName) { return; }
                    const profileName = message.fileName.replace(".json", "");
                    sendLoading(`delete-${message.fileName}`, true);
                    await this.drive.deleteProfile(profileName);
                    await this.refreshState();
                    sendLoading(`delete-${message.fileName}`, false);
                    sendToast("success", `Profile "${profileName}" deleted`);
                    break;
                }

                case "showLogs":
                    this.logger.show();
                    break;

                case "setPaths": {
                    const pathType = message.type || "settings";
                    try {
                        const filePath = await SyncController.setManualPath(pathType);
                        this.context.globalState.update(`${pathType}Path`, filePath);
                        sendToast("success", `${pathType} path updated`);
                    } catch (err: any) {
                        // TypeError = user cancelled dialog (undefined[0].fsPath)
                        if (!(err instanceof TypeError)) {
                            this.logger.error(`Failed to set ${pathType} path`, "setPaths", false, err);
                            sendToast("error", `Failed to set ${pathType} path`);
                        }
                    }
                    break;
                }

                case "reloadWindow":
                    await vscode.commands.executeCommand("workbench.action.reloadWindow");
                    break;

                case "refresh":
                    await this.refreshState();
                    break;

                case "listAppData": {
                    sendLoading("listAppData", true);
                    try {
                        const result = await this.drive.listAppDataFiles(message.folderId, message.pageToken);
                        this.panel?.webview.postMessage({
                            type: "appDataFiles",
                            files: result.files,
                            nextPageToken: result.nextPageToken || null,
                            folderId: message.folderId || null,
                            folderName: message.folderName || "Root",
                        });
                    } catch (err: any) {
                        sendToast("error", err?.message || "Failed to list app data files");
                    }
                    sendLoading("listAppData", false);
                    break;
                }

                case "previewFile": {
                    if (!message.fileId) { return; }
                    sendLoading("previewFile", true);
                    try {
                        const content = await this.drive.downloadFileContent(message.fileId);
                        this.panel?.webview.postMessage({
                            type: "filePreview",
                            content,
                            fileName: message.fileName || "file",
                        });
                    } catch (err: any) {
                        sendToast("error", err?.message || "Failed to preview file");
                    }
                    sendLoading("previewFile", false);
                    break;
                }
            }
        } catch (error: any) {
            this.logger.error(
                `Dashboard action failed: ${error?.message}`,
                "DashboardProvider.handleMessage",
                true,
                error
            );
            sendLoading(message.command, false);
            sendToast("error", error?.message || "An error occurred");
        }
    }

    /** Generate HTML content for webview */
    private getHtmlContent(webview: vscode.Webview): string {
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "dashboard.css")
        );
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "dashboard.js")
        );
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.extensionUri,
                "dist",
                "webview",
                "codicons",
                "codicon.css"
            )
        );

        const nonce = getNonce();

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none';
                   style-src ${webview.cspSource} 'unsafe-inline';
                   script-src 'nonce-${nonce}';
                   font-src ${webview.cspSource};
                   img-src ${webview.cspSource} https:;">
    <link href="${codiconsUri}" rel="stylesheet" />
    <link href="${cssUri}" rel="stylesheet" />
    <title>Antigravity Sync</title>
</head>
<body>
    <!-- Header -->
    <header class="header">
        <div class="header-left">
            <span class="codicon codicon-sync header-icon"></span>
            <h1 class="header-title">Antigravity Sync</h1>
        </div>
        <div class="header-right" id="header-user"></div>
    </header>

    <!-- Main Content -->
    <main class="main">
        <!-- Not signed in -->
        <div id="login-section" class="section login-section" style="display:none;">
            <div class="login-card">
                <span class="codicon codicon-account login-icon"></span>
                <h2>Welcome to Antigravity Sync</h2>
                <p class="login-desc">Sync your settings, extensions, and keybindings across devices via Google Drive.</p>
                <button class="btn btn-primary btn-lg" id="btn-login">
                    <span class="codicon codicon-sign-in"></span>
                    Sign in with Google
                </button>
            </div>
        </div>

        <!-- Dashboard (signed in) -->
        <div id="dashboard-section" style="display:none;">
            <!-- Account + Quick Actions row -->
            <div class="grid-row">
                <div class="card">
                    <div class="card-header">
                        <span class="codicon codicon-account"></span>
                        <span>Account</span>
                    </div>
                    <div class="card-body">
                        <div class="account-info">
                            <span class="status-dot status-online"></span>
                            <span id="account-email" class="account-email">--</span>
                        </div>
                        <button class="btn btn-secondary btn-sm" id="btn-logout">
                            <span class="codicon codicon-sign-out"></span>
                            Sign Out
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <span class="codicon codicon-tools"></span>
                        <span>Quick Actions</span>
                    </div>
                    <div class="card-body actions-grid">
                        <button class="btn btn-accent" id="btn-create-profile">
                            <span class="codicon codicon-add"></span>
                            Create Profile
                        </button>
                        <button class="btn btn-secondary" id="btn-set-settings-path">
                            <span class="codicon codicon-settings-gear"></span>
                            Settings Path
                        </button>
                        <button class="btn btn-secondary" id="btn-set-keybindings-path">
                            <span class="codicon codicon-keyboard"></span>
                            Keybindings Path
                        </button>
                        <button class="btn btn-secondary" id="btn-show-logs">
                            <span class="codicon codicon-output"></span>
                            View Logs
                        </button>
                    </div>
                </div>
            </div>

            <!-- Profiles Section -->
            <div class="card profiles-card">
                <div class="card-header">
                    <div class="card-header-left">
                        <span class="codicon codicon-cloud"></span>
                        <span>Profiles on Google Drive</span>
                        <span class="badge" id="profile-count">0</span>
                    </div>
                    <button class="btn-icon" id="btn-refresh" title="Refresh">
                        <span class="codicon codicon-refresh"></span>
                    </button>
                </div>
                <div class="card-body">
                    <div id="profiles-empty" class="empty-state" style="display:none;">
                        <span class="codicon codicon-cloud-upload empty-icon"></span>
                        <p>No profiles yet</p>
                        <p class="empty-hint">Create your first profile to start syncing.</p>
                    </div>
                    <div id="profiles-list" class="profiles-grid"></div>
                </div>
            </div>
        </div>

        <!-- App Data Explorer (signed in) -->
        <div id="appdata-section" style="display:none;">
            <div class="card appdata-card">
                <div class="card-header">
                    <div class="card-header-left">
                        <span class="codicon codicon-folder-opened"></span>
                        <span>App Data Explorer</span>
                    </div>
                    <div class="appdata-header-actions">
                        <button class="btn-icon" id="btn-back-appdata" title="Go Back" style="display:none;">
                            <span class="codicon codicon-arrow-left"></span>
                        </button>
                        <button class="btn-icon" id="btn-refresh-appdata" title="Refresh">
                            <span class="codicon codicon-refresh"></span>
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="breadcrumb" id="appdata-breadcrumb">
                        <span class="breadcrumb-item active">Root</span>
                    </div>
                    <div id="appdata-empty" class="empty-state" style="display:none;">
                        <span class="codicon codicon-folder empty-icon"></span>
                        <p>This folder is empty</p>
                    </div>
                    <div id="appdata-table-wrapper" class="appdata-table-wrapper">
                        <table class="appdata-table" id="appdata-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Size</th>
                                    <th>Modified</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="appdata-list"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <!-- Toast container -->
    <div id="toast-container" class="toast-container"></div>

    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }

    public dispose() {
        this.panel?.dispose();
    }
}

/** Generate random nonce for CSP */
function getNonce(): string {
    let text = "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
