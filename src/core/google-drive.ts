// GoogleDriveService — CRUD operations for Google Drive API v3
// Uses appDataFolder (hidden, app-specific) for profile storage

import * as https from "https";
import { IProfile } from "../models/interfaces";
import GoogleAuth from "./google-auth";
import Logger from "./logger";

const DRIVE_API = "https://www.googleapis.com";
const DRIVE_FILES = "/drive/v3/files";
const DRIVE_UPLOAD = "/upload/drive/v3/files";

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

const FOLDER_MIME = "application/vnd.google-apps.folder";

export default class GoogleDriveService {
    private auth: GoogleAuth;
    private logger: Logger;

    constructor(auth: GoogleAuth, logger: Logger) {
        this.auth = auth;
        this.logger = logger;
    }

    /** List all profile files in appDataFolder */
    public async listProfiles(): Promise<DriveFile[]> {
        const token = await this.auth.getAccessToken();
        const params = new URLSearchParams({
            spaces: "appDataFolder",
            fields: "files(id, name, mimeType, modifiedTime)",
            q: "name contains '.json' and trashed = false",
        });

        const data = await this.httpsGet(
            `${DRIVE_API}${DRIVE_FILES}?${params.toString()}`,
            token
        );
        const result = JSON.parse(data) as DriveFileList;
        return result.files || [];
    }

    /** List files/folders in appDataFolder — single page */
    public async listAppDataFiles(parentId?: string, pageToken?: string): Promise<{ files: AppDataFile[]; nextPageToken?: string }> {
        const token = await this.auth.getAccessToken();
        const PAGE_SIZE = 20;

        const q = parentId
            ? `'${parentId}' in parents and trashed = false`
            : "trashed = false";
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

        // Google Drive API may return nextPageToken even when next page is empty.
        // If fewer files than pageSize → no more pages.
        const hasMore = files.length >= PAGE_SIZE && result.nextPageToken;

        return {
            files,
            nextPageToken: hasMore ? result.nextPageToken : undefined,
        };
    }

    /** Download raw file content by ID (for preview) */
    public async downloadFileContent(fileId: string): Promise<string> {
        const token = await this.auth.getAccessToken();
        return this.httpsGet(
            `${DRIVE_API}${DRIVE_FILES}/${fileId}?alt=media`,
            token
        );
    }

    /** Get a profile by name */
    public async getProfile(fileName: string): Promise<IProfile | null> {
        const files = await this.listProfiles();
        const file = files.find((f) => f.name === fileName);
        if (!file) {
            return null;
        }
        return this.downloadFile(file.id);
    }

    /** Save profile — create or update */
    public async saveProfile(profile: IProfile): Promise<void> {
        const fileName = `${profile.profileName}.json`;
        const content = JSON.stringify(profile, null, 2);

        // Check if file already exists
        const files = await this.listProfiles();
        const existing = files.find((f) => f.name === fileName);

        if (existing) {
            await this.updateFile(existing.id, content);
            this.logger.info(`Profile updated: ${profile.profileName}`);
        } else {
            await this.createFile(fileName, content);
            this.logger.info(`Profile created: ${profile.profileName}`);
        }
    }

    /** Delete a profile by name */
    public async deleteProfile(profileName: string): Promise<void> {
        const fileName = `${profileName}.json`;
        const files = await this.listProfiles();
        const file = files.find((f) => f.name === fileName);

        if (!file) {
            throw new Error(`Profile "${profileName}" not found`);
        }

        await this.deleteFile(file.id);
        this.logger.info(`Profile deleted: ${profileName}`);
    }

    // ===== Private CRUD =====

    /** Create a new file in appDataFolder */
    private async createFile(name: string, content: string): Promise<DriveFile> {
        const token = await this.auth.getAccessToken();
        const metadata = JSON.stringify({
            name,
            parents: ["appDataFolder"],
        });

        // Use multipart upload
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

    /** Download file content by ID */
    private async downloadFile(fileId: string): Promise<IProfile> {
        const token = await this.auth.getAccessToken();
        const data = await this.httpsGet(
            `${DRIVE_API}${DRIVE_FILES}/${fileId}?alt=media`,
            token
        );
        return JSON.parse(data) as IProfile;
    }

    /** Delete file by ID */
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
