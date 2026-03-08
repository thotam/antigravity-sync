// Google OAuth 2.0 — Self-managed flow for desktop app
// Uses localhost HTTP server to receive callback, SecretStorage for token persistence

import * as http from "http";
import * as https from "https";
import * as crypto from "crypto";
import { ExtensionContext, Uri, env, window } from "vscode";
import Logger from "./logger";

// OAuth config — injected from .env at build time via webpack DefinePlugin
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const SCOPES = [
    "https://www.googleapis.com/auth/drive.appdata",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const TOKEN_KEY = "antigravitysync.google.tokens";

export interface TokenData {
    access_token: string;
    refresh_token: string;
    expires_at: number; // Unix timestamp (ms)
}

export default class GoogleAuth {
    private context: ExtensionContext;
    private logger: Logger;
    private tokens: TokenData | null = null;

    constructor(logger: Logger, context: ExtensionContext) {
        this.logger = logger;
        this.context = context;
    }

    /** Check if user is authenticated and token is valid */
    public async isAuthenticated(): Promise<boolean> {
        if (!this.tokens) {
            await this.restoreTokens();
        }
        if (!this.tokens) {
            return false;
        }
        // Refresh if expiring within 5 minutes
        if (Date.now() > this.tokens.expires_at - 5 * 60 * 1000) {
            try {
                await this.refreshAccessToken();
                return true;
            } catch {
                return false;
            }
        }
        return true;
    }

    /** Get valid access token (auto-refresh if needed) */
    public async getAccessToken(): Promise<string> {
        if (!this.tokens) {
            await this.restoreTokens();
        }
        if (!this.tokens) {
            throw new Error(
                "Not authenticated. Please login with Google first."
            );
        }
        // Refresh if expiring within 5 minutes
        if (Date.now() > this.tokens.expires_at - 5 * 60 * 1000) {
            await this.refreshAccessToken();
        }
        return this.tokens!.access_token;
    }

    /** Start OAuth login flow — opens browser, waits for callback */
    public async login(): Promise<void> {
        const state = crypto.randomBytes(16).toString("hex");

        // Start localhost server to catch callback
        const { port, codePromise } = await this.startCallbackServer(state);
        const redirectUri = `http://localhost:${port}/callback`;

        // Build OAuth URL
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: SCOPES.join(" "),
            state: state,
            access_type: "offline", // Get refresh_token
            prompt: "consent", // Force consent screen (ensures refresh_token)
        });

        const authUrl = `${AUTH_URL}?${params.toString()}`;
        this.logger.info("Opening browser for Google login...");

        // Open browser
        const opened = await env.openExternal(Uri.parse(authUrl));
        if (!opened) {
            throw new Error(
                "Failed to open browser for Google login. Please try again."
            );
        }

        // Wait for callback (30s timeout)
        const code = await codePromise;
        this.logger.info("Authorization code received, exchanging for tokens...");

        // Exchange code for tokens
        const tokenData = await this.exchangeCodeForTokens(code, redirectUri);
        this.tokens = tokenData;
        await this.saveTokens();

        this.logger.info("Google login successful!", true);
    }

    /** Logout — clear tokens */
    public async logout(): Promise<void> {
        this.tokens = null;
        await this.context.secrets.delete(TOKEN_KEY);
        this.logger.info("Logged out from Google", true);
    }

    /** Get logged-in account info */
    public async getAccountInfo(): Promise<{
        email: string;
        name: string;
        picture?: string;
    } | null> {
        try {
            const token = await this.getAccessToken();
            const data = await this.httpsGet(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                token
            );
            const info = JSON.parse(data);
            return { email: info.email, name: info.name, picture: info.picture };
        } catch {
            return null;
        }
    }

    // ===== Private methods =====

    /** Start localhost HTTP server to receive OAuth callback */
    private startCallbackServer(
        expectedState: string
    ): Promise<{ port: number; codePromise: Promise<string> }> {
        return new Promise((resolve, reject) => {
            const server = http.createServer();
            const timeout = setTimeout(() => {
                server.close();
                reject(new Error("Login timed out. Please try again."));
            }, 120_000); // 2 minute timeout

            const codePromise = new Promise<string>((resolveCode, rejectCode) => {
                server.on("request", (req, res) => {
                    const url = new URL(
                        req.url || "/",
                        `http://localhost`
                    );

                    if (url.pathname !== "/callback") {
                        res.writeHead(404);
                        res.end("Not found");
                        return;
                    }

                    const code = url.searchParams.get("code");
                    const state = url.searchParams.get("state");
                    const error = url.searchParams.get("error");

                    if (error) {
                        res.writeHead(200, { "Content-Type": "text/html" });
                        res.end(this.getErrorHtml(error));
                        clearTimeout(timeout);
                        server.close();
                        rejectCode(
                            new Error(`Google login denied: ${error}`)
                        );
                        return;
                    }

                    if (state !== expectedState) {
                        res.writeHead(400, { "Content-Type": "text/html" });
                        res.end(this.getErrorHtml("Invalid state parameter"));
                        clearTimeout(timeout);
                        server.close();
                        rejectCode(
                            new Error("OAuth state mismatch — possible CSRF attack")
                        );
                        return;
                    }

                    if (!code) {
                        res.writeHead(400, { "Content-Type": "text/html" });
                        res.end(this.getErrorHtml("No authorization code"));
                        clearTimeout(timeout);
                        server.close();
                        rejectCode(new Error("No authorization code received"));
                        return;
                    }

                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end(this.getSuccessHtml());
                    clearTimeout(timeout);
                    server.close();
                    resolveCode(code);
                });
            });

            server.listen(0, "127.0.0.1", () => {
                const addr = server.address();
                if (addr && typeof addr !== "string") {
                    resolve({ port: addr.port, codePromise });
                } else {
                    reject(new Error("Failed to start callback server"));
                }
            });

            server.on("error", (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    /** Exchange authorization code for tokens */
    private async exchangeCodeForTokens(
        code: string,
        redirectUri: string
    ): Promise<TokenData> {
        const params = new URLSearchParams({
            code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        });

        const data = await this.httpsPost(TOKEN_URL, params.toString());
        const response = JSON.parse(data);

        if (response.error) {
            throw new Error(
                `Token exchange failed: ${response.error_description || response.error}`
            );
        }

        return {
            access_token: response.access_token,
            refresh_token: response.refresh_token,
            expires_at: Date.now() + response.expires_in * 1000,
        };
    }

    /** Refresh access token using refresh_token */
    private async refreshAccessToken(): Promise<void> {
        if (!this.tokens?.refresh_token) {
            throw new Error("No refresh token available");
        }

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: this.tokens.refresh_token,
            grant_type: "refresh_token",
        });

        try {
            const data = await this.httpsPost(TOKEN_URL, params.toString());
            const response = JSON.parse(data);

            if (response.error) {
                // Refresh token invalid/revoked — need re-login
                this.logger.warn(
                    "Google session expired. Please login again.",
                    true
                );
                this.tokens = null;
                await this.context.secrets.delete(TOKEN_KEY);
                throw new Error(
                    `Refresh failed: ${response.error_description || response.error}`
                );
            }

            this.tokens.access_token = response.access_token;
            this.tokens.expires_at =
                Date.now() + response.expires_in * 1000;
            // Refresh token is only returned on first auth, keep existing
            if (response.refresh_token) {
                this.tokens.refresh_token = response.refresh_token;
            }
            await this.saveTokens();
            this.logger.info("Access token refreshed successfully");
        } catch (error: any) {
            if (error.message?.includes("Refresh failed")) {
                throw error;
            }
            this.logger.error(
                "Failed to refresh token",
                "GoogleAuth.refreshAccessToken",
                true,
                error
            );
            throw error;
        }
    }

    /** Save tokens to SecretStorage */
    private async saveTokens(): Promise<void> {
        if (this.tokens) {
            await this.context.secrets.store(
                TOKEN_KEY,
                JSON.stringify(this.tokens)
            );
        }
    }

    /** Restore tokens from SecretStorage */
    private async restoreTokens(): Promise<void> {
        const stored = await this.context.secrets.get(TOKEN_KEY);
        if (stored) {
            try {
                this.tokens = JSON.parse(stored) as TokenData;
                this.logger.info("Tokens restored from secure storage");
            } catch {
                this.tokens = null;
            }
        }
    }

    /** HTTPS GET request */
    private httpsGet(url: string, token: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const options = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            };

            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => resolve(data));
            });
            req.on("error", reject);
            req.end();
        });
    }

    /** HTTPS POST request (form-urlencoded) */
    private httpsPost(url: string, body: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const options = {
                hostname: parsed.hostname,
                path: parsed.pathname,
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(body),
                },
            };

            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => resolve(data));
            });
            req.on("error", reject);
            req.write(body);
            req.end();
        });
    }

    /** Success HTML page */
    private getSuccessHtml(): string {
        return `<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:60px;background:#1e1e2e;color:#cdd6f4">
<h1 style="color:#a6e3a1">✅ Login Successful!</h1>
<p>You can close this tab and return to Antigravity.</p>
<script>setTimeout(()=>window.close(),3000)</script>
</body></html>`;
    }

    /** Error HTML page */
    private getErrorHtml(error: string): string {
        return `<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:60px;background:#1e1e2e;color:#cdd6f4">
<h1 style="color:#f38ba8">❌ Login Failed</h1>
<p>${error}</p>
<p>Please close this tab and try again in Antigravity.</p>
</body></html>`;
    }
}
