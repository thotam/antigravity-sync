// GoogleDriveService — CRUD operations for Google Drive API v3
// Uses appDataFolder with folder-based profile storage

import * as https from "https";
import { IProfile, IProfileMeta, ISyncItem, ISyncMeta } from "../models/interfaces";
import GoogleAuth from "./google-auth";
import Logger from "./logger";

const DRIVE_API = "https://www.googleapis.com";
const DRIVE_FILES = "/drive/v3/files";
const DRIVE_UPLOAD = "/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime?: string;
}

interface DriveFileList {
    files: DriveFile[];
}

/** File/folder metadata for App Data Explorer */
export interface AppDataFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime?: string;
    createdTime?: string;
}

/** Profile folder info returned from listProfiles */
export interface ProfileFolder {
    id: string;
    name: string;
    modifiedTime?: string;
    syncKeys?: string[];  // Từ meta.json
}

/** Progress callback for sync operations */
export type ProgressCallback = (step: string, current: number, total: number, status: "pending" | "active" | "done") => void;

export default class GoogleDriveService {
    private auth: GoogleAuth;
    private logger: Logger;

    constructor(auth: GoogleAuth, logger: Logger) {
        this.auth = auth;
        this.logger = logger;
    }

    // ===== Profile CRUD (Folder-based) =====

    /** List all profile folders in appDataFolder */
    public async listProfiles(): Promise<ProfileFolder[]> {
        const token = await this.auth.getAccessToken();
        const params = new URLSearchParams({
            spaces: "appDataFolder",
            fields: "files(id, name, mimeType, modifiedTime)",
            q: `mimeType = '${FOLDER_MIME}' and trashed = false`,
        });

        const data = await this.httpsGet(
            `${DRIVE_API}${DRIVE_FILES}?${params.toString()}`,
            token
        );
        const result = JSON.parse(data) as DriveFileList;
        const folders = (result.files || []).map(f => ({
            id: f.id,
            name: f.name,
            modifiedTime: f.modifiedTime,
        }));

        // Đọc sync-meta.json từ root (1 API call thay vì N)
        const syncMeta = await this.getSyncMeta();
        return folders.map(f => ({
            ...f,
            syncKeys: syncMeta[f.name],
        }));
    }

    /** Get a profile by folder name — downloads files based on syncItems */
    public async getProfile(profileName: string, syncItems: ISyncItem[], onProgress?: ProgressCallback): Promise<IProfile | null> {
        const enabledItems = syncItems.filter(i => i.enabled);
        const steps = ["Finding Profile", ...enabledItems.map(i => `Downloading ${i.label}`)];
        let stepIdx = 0;

        // Emit tất cả steps pending trước
        if (onProgress) {
            for (let i = 0; i < steps.length; i++) {
                onProgress(steps[i], i, steps.length, "pending");
            }
        }

        onProgress?.(steps[0], stepIdx, steps.length, "active");
        const folder = await this.findFolder(profileName);
        if (!folder) { return null; }
        onProgress?.(steps[0], stepIdx++, steps.length, "done");

        const files = await this.listFolderContents(folder.id);
        const profile: IProfile = { profileName, data: {} };

        for (const item of enabledItems) {
            const stepLabel = `Downloading ${item.label}`;
            onProgress?.(stepLabel, stepIdx, steps.length, "active");

            const file = files.find(f => f.name === item.fileName);
            if (file) {
                try {
                    const content = await this.downloadFileContent(file.id);
                    profile.data[item.key] = JSON.parse(content);
                } catch {
                    this.logger.error(`Failed to parse ${item.fileName} in ${profileName}`, "getProfile", false);
                }
            }
            onProgress?.(stepLabel, stepIdx++, steps.length, "done");
        }

        return profile;
    }

    /** Save profile — create or update folder + files based on syncItems */
    public async saveProfile(profile: IProfile, syncItems: ISyncItem[], onProgress?: ProgressCallback): Promise<void> {
        let folder = await this.findFolder(profile.profileName);
        const now = new Date().toISOString();
        const isNew = !folder;
        const enabledItems = syncItems.filter(i => i.enabled);

        const steps = isNew
            ? ["Creating Folder", ...enabledItems.map(i => `Uploading ${i.label}`), "Saving Metadata"]
            : [...enabledItems.map(i => `Uploading ${i.label}`), "Updating Metadata"];
        let stepIdx = 0;

        // Emit tất cả steps pending trước
        if (onProgress) {
            for (let i = 0; i < steps.length; i++) {
                onProgress(steps[i], i, steps.length, "pending");
            }
        }

        if (isNew) {
            onProgress?.("Creating Folder", stepIdx, steps.length, "active");
            folder = await this.createFolder(profile.profileName);
            onProgress?.("Creating Folder", stepIdx++, steps.length, "done");

            for (const item of enabledItems) {
                const label = `Uploading ${item.label}`;
                onProgress?.(label, stepIdx, steps.length, "active");
                const content = JSON.stringify(profile.data[item.key] ?? {}, null, 2);
                await this.createFileInFolder(folder!.id, item.fileName, content);
                onProgress?.(label, stepIdx++, steps.length, "done");
            }

            // meta.json
            const syncKeys = enabledItems.map(i => i.key);
            const metaLabel = "Saving Metadata";
            onProgress?.(metaLabel, stepIdx, steps.length, "active");
            await this.createFileInFolder(folder!.id, "meta.json", JSON.stringify({
                name: profile.profileName, createdAt: now, updatedAt: now, syncKeys,
            } as IProfileMeta, null, 2));
            onProgress?.(metaLabel, stepIdx++, steps.length, "done");

            // Cập nhật sync-meta.json ở root
            await this.updateSyncMeta(profile.profileName, syncKeys);
            this.logger.info(`Profile created: ${profile.profileName}`);
        } else {
            const files = await this.listFolderContents(folder!.id);
            const fileMap = new Map(files.map(f => [f.name, f.id]));

            for (const item of enabledItems) {
                const label = `Uploading ${item.label}`;
                onProgress?.(label, stepIdx, steps.length, "active");
                const content = JSON.stringify(profile.data[item.key] ?? {}, null, 2);
                const existingId = fileMap.get(item.fileName);
                if (existingId) {
                    await this.updateFile(existingId, content);
                } else {
                    await this.createFileInFolder(folder!.id, item.fileName, content);
                }
                onProgress?.(label, stepIdx++, steps.length, "done");
            }

            // Update meta.json
            const metaLabel = "Updating Metadata";
            onProgress?.(metaLabel, stepIdx, steps.length, "active");
            const metaId = fileMap.get("meta.json");
            const syncKeys = enabledItems.map(i => i.key);
            const metaContent = JSON.stringify({
                name: profile.profileName, createdAt: now, updatedAt: now, syncKeys,
            } as IProfileMeta, null, 2);

            if (metaId) {
                try {
                    const metaRaw = await this.downloadFileContent(metaId);
                    const meta = JSON.parse(metaRaw) as IProfileMeta;
                    meta.updatedAt = now;
                    meta.syncKeys = syncKeys;
                    await this.updateFile(metaId, JSON.stringify(meta, null, 2));
                } catch {
                    await this.updateFile(metaId, metaContent);
                }
            } else {
                await this.createFileInFolder(folder!.id, "meta.json", metaContent);
            }
            onProgress?.(metaLabel, stepIdx++, steps.length, "done");

            // Cập nhật sync-meta.json ở root
            await this.updateSyncMeta(profile.profileName, syncKeys);
            this.logger.info(`Profile updated: ${profile.profileName}`);
        }
    }

    /** Delete a profile folder (and all its children) */
    public async deleteProfile(profileName: string): Promise<void> {
        const folder = await this.findFolder(profileName);
        if (!folder) {
            throw new Error(`Profile "${profileName}" not found`);
        }
        await this.deleteFile(folder.id);
        // Cập nhật sync-meta.json: xóa entry
        await this.updateSyncMeta(profileName);
        this.logger.info(`Profile deleted: ${profileName}`);
    }

    // ===== App Data Explorer =====

    /** List files/folders in appDataFolder — single page */
    public async listAppDataFiles(parentId?: string, pageToken?: string): Promise<{ files: AppDataFile[]; nextPageToken?: string }> {
        const token = await this.auth.getAccessToken();
        const PAGE_SIZE = 20;

        const q = parentId
            ? `'${parentId}' in parents and trashed = false`
            : "'appDataFolder' in parents and trashed = false";
        const params = new URLSearchParams({
            spaces: "appDataFolder",
            fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime, createdTime)",
            q,
            pageSize: String(PAGE_SIZE),
        });
        if (pageToken) { params.set("pageToken", pageToken); }

        const data = await this.httpsGet(
            `${DRIVE_API}${DRIVE_FILES}?${params.toString()}`,
            token
        );
        const result = JSON.parse(data);
        const files: AppDataFile[] = result.files || [];
        const hasMore = files.length >= PAGE_SIZE && result.nextPageToken;

        return {
            files,
            nextPageToken: hasMore ? result.nextPageToken : undefined,
        };
    }

    /** Download raw file content by ID */
    public async downloadFileContent(fileId: string): Promise<string> {
        const token = await this.auth.getAccessToken();
        return this.httpsGet(
            `${DRIVE_API}${DRIVE_FILES}/${fileId}?alt=media`,
            token
        );
    }

    // ===== Sync Meta (root-level) =====

    /** Tìm file theo tên ở root appDataFolder */
    private async findRootFile(name: string): Promise<DriveFile | null> {
        const token = await this.auth.getAccessToken();
        const params = new URLSearchParams({
            spaces: "appDataFolder",
            fields: "files(id, name)",
            q: `name = '${name}' and 'appDataFolder' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`,
        });
        const data = await this.httpsGet(`${DRIVE_API}${DRIVE_FILES}?${params.toString()}`, token);
        const result = JSON.parse(data) as DriveFileList;
        return result.files?.[0] || null;
    }

    /** Đọc sync-meta.json từ root */
    private async getSyncMeta(): Promise<ISyncMeta> {
        try {
            const file = await this.findRootFile("sync-meta.json");
            if (!file) { return {}; }
            const raw = await this.downloadFileContent(file.id);
            return JSON.parse(raw) as ISyncMeta;
        } catch {
            return {};
        }
    }

    /** Cập nhật hoặc xóa entry trong sync-meta.json */
    private async updateSyncMeta(profileName: string, syncKeys?: string[]): Promise<void> {
        try {
            const meta = await this.getSyncMeta();
            if (syncKeys) {
                meta[profileName] = syncKeys;
            } else {
                delete meta[profileName];
            }
            const content = JSON.stringify(meta, null, 2);
            const file = await this.findRootFile("sync-meta.json");
            if (file) {
                await this.updateFile(file.id, content);
            } else {
                // Tạo mới sync-meta.json ở root
                const token = await this.auth.getAccessToken();
                const metadata = JSON.stringify({ name: "sync-meta.json", parents: ["appDataFolder"] });
                const boundary = "sync_meta_boundary";
                const body = [
                    `--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", metadata,
                    `--${boundary}`, "Content-Type: application/json", "", content,
                    `--${boundary}--`,
                ].join("\r\n");
                await this.httpsRequest(
                    `${DRIVE_API}${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name`,
                    "POST", token, body, `multipart/related; boundary=${boundary}`
                );
            }
        } catch (err) {
            this.logger.error("Failed to update sync-meta.json", "updateSyncMeta", false, err);
        }
    }

    // ===== Folder helpers =====

    /** Find a folder by name in appDataFolder root */
    private async findFolder(name: string): Promise<DriveFile | null> {
        const token = await this.auth.getAccessToken();
        const params = new URLSearchParams({
            spaces: "appDataFolder",
            fields: "files(id, name, mimeType)",
            q: `mimeType = '${FOLDER_MIME}' and name = '${name}' and trashed = false`,
        });

        const data = await this.httpsGet(
            `${DRIVE_API}${DRIVE_FILES}?${params.toString()}`,
            token
        );
        const result = JSON.parse(data) as DriveFileList;
        return result.files?.[0] || null;
    }

    /** Create a folder in appDataFolder */
    private async createFolder(name: string): Promise<DriveFile> {
        const token = await this.auth.getAccessToken();
        const metadata = JSON.stringify({
            name,
            mimeType: FOLDER_MIME,
            parents: ["appDataFolder"],
        });

        const data = await this.httpsRequest(
            `${DRIVE_API}${DRIVE_FILES}?fields=id,name,mimeType`,
            "POST",
            token,
            metadata,
            "application/json"
        );
        return JSON.parse(data) as DriveFile;
    }

    /** Create a file inside a specific folder */
    private async createFileInFolder(folderId: string, name: string, content: string): Promise<DriveFile> {
        const token = await this.auth.getAccessToken();
        const metadata = JSON.stringify({
            name,
            parents: [folderId],
        });

        const boundary = "antigravity_sync_boundary";
        const body = [
            `--${boundary}`,
            "Content-Type: application/json; charset=UTF-8",
            "",
            metadata,
            `--${boundary}`,
            "Content-Type: application/json",
            "",
            content,
            `--${boundary}--`,
        ].join("\r\n");

        const data = await this.httpsRequest(
            `${DRIVE_API}${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name`,
            "POST",
            token,
            body,
            `multipart/related; boundary=${boundary}`
        );
        return JSON.parse(data) as DriveFile;
    }

    /** List files inside a folder */
    private async listFolderContents(folderId: string): Promise<DriveFile[]> {
        const token = await this.auth.getAccessToken();
        const params = new URLSearchParams({
            spaces: "appDataFolder",
            fields: "files(id, name, mimeType)",
            q: `'${folderId}' in parents and trashed = false`,
        });

        const data = await this.httpsGet(
            `${DRIVE_API}${DRIVE_FILES}?${params.toString()}`,
            token
        );
        const result = JSON.parse(data) as DriveFileList;
        return result.files || [];
    }

    // ===== Private CRUD =====

    /** Update existing file content */
    private async updateFile(fileId: string, content: string): Promise<void> {
        const token = await this.auth.getAccessToken();
        await this.httpsRequest(
            `${DRIVE_API}${DRIVE_UPLOAD}/${fileId}?uploadType=media`,
            "PATCH",
            token,
            content,
            "application/json"
        );
    }

    /** Delete file/folder by ID */
    private async deleteFile(fileId: string): Promise<void> {
        const token = await this.auth.getAccessToken();
        await this.httpsRequest(
            `${DRIVE_API}${DRIVE_FILES}/${fileId}`,
            "DELETE",
            token,
            "",
            "application/json"
        );
    }

    // ===== HTTP helpers =====

    private httpsGet(url: string, token: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const options = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
            };
            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(
                            new Error(
                                `Drive API error ${res.statusCode}: ${data}`
                            )
                        );
                    } else {
                        resolve(data);
                    }
                });
            });
            req.on("error", reject);
            req.end();
        });
    }

    private httpsRequest(
        url: string,
        method: string,
        token: string,
        body: string,
        contentType: string
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const options = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": contentType,
                    "Content-Length": Buffer.byteLength(body),
                },
            };
            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(
                            new Error(
                                `Drive API error ${res.statusCode}: ${data}`
                            )
                        );
                    } else {
                        resolve(data);
                    }
                });
            });
            req.on("error", reject);
            req.write(body);
            req.end();
        });
    }
}
