// Dashboard JS — Runs inside webview
// Modal system, toast notifications, state-driven rendering

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // === DOM Elements ===
    const loginSection = document.getElementById("login-section");
    const dashboardSection = document.getElementById("dashboard-section");
    const headerUser = document.getElementById("header-user");
    const profilesList = document.getElementById("profiles-list");
    const profilesEmpty = document.getElementById("profiles-empty");
    const profileCount = document.getElementById("profile-count");
    const toastContainer = document.getElementById("toast-container");

    // === Buttons ===
    const btnLogin = document.getElementById("btn-login");
    const btnLogout = document.getElementById("btn-logout");
    const btnCreateProfile = document.getElementById("btn-create-profile");
    const btnSetSettingsPath = document.getElementById("btn-set-settings-path");
    const btnSetKeybindingsPath = document.getElementById("btn-set-keybindings-path");
    const btnShowLogs = document.getElementById("btn-show-logs");
    const btnRefresh = document.getElementById("btn-refresh");

    // === State ===
    let currentState = null;
    let syncItemsConfig = [];  // Từ backend DEFAULT_SYNC_ITEMS

    // ========================================
    // MODAL SYSTEM
    // ========================================

    /**
     * Show a confirm modal dialog
     * @param {object} opts - { title, message, icon, confirmLabel, cancelLabel, variant }
     * @returns {Promise<boolean>}
     */
    function showConfirm(opts) {
        return new Promise((resolve) => {
            const variant = opts.variant || "accent"; // "accent" | "danger"
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay";
            overlay.innerHTML = `
                <div class="modal">
                    <div class="modal-header modal-header-${variant}">
                        <span class="codicon codicon-${opts.icon || "question"}"></span>
                        <span>${escapeHtml(opts.title || "Confirm")}</span>
                    </div>
                    <div class="modal-body" style="white-space: pre-wrap;">${escapeHtml(opts.message || "Are you sure?")}</div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-modal="cancel">
                            ${escapeHtml(opts.cancelLabel || "Cancel")}
                        </button>
                        <button class="btn ${variant === "danger" ? "btn-danger" : "btn-accent"}" data-modal="confirm">
                            ${escapeHtml(opts.confirmLabel || "Confirm")}
                        </button>
                    </div>
                </div>
            `;

            function close(result) {
                overlay.classList.add("modal-out");
                setTimeout(() => { overlay.remove(); resolve(result); }, 200);
            }

            overlay.querySelector("[data-modal='confirm']").addEventListener("click", () => close(true));
            overlay.querySelector("[data-modal='cancel']").addEventListener("click", () => close(false));
            overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
            document.addEventListener("keydown", function onKey(e) {
                if (e.key === "Escape") { document.removeEventListener("keydown", onKey); close(false); }
                if (e.key === "Enter") { document.removeEventListener("keydown", onKey); close(true); }
            });

            document.body.appendChild(overlay);
            overlay.querySelector("[data-modal='confirm']").focus();
        });
    }

    /**
     * Show an input modal dialog
     * @param {object} opts - { title, message, icon, placeholder, confirmLabel, cancelLabel, validate }
     * @returns {Promise<string|null>} - input value or null if cancelled
     */
    function showInput(opts) {
        return new Promise((resolve) => {
            const hasSyncItems = opts.syncItems && opts.syncItems.length > 0;
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay";
            overlay.innerHTML = `
                <div class="modal">
                    <div class="modal-header modal-header-accent">
                        <span class="codicon codicon-${opts.icon || "edit"}"></span>
                        <span>${escapeHtml(opts.title || "Input")}</span>
                    </div>
                    <div class="modal-body">
                        ${escapeHtml(opts.message || "")}
                        <input class="modal-input" type="text"
                               placeholder="${escapeAttr(opts.placeholder || "")}"
                               autocomplete="off" spellcheck="false" />
                        <div class="modal-input-error" id="modal-input-error"></div>
                        ${hasSyncItems ? `
                        <div class="sync-item-list">
                            <div class="sync-item-label">Sync Items</div>
                            ${opts.syncItems.map(item => `
                                <label class="sync-item">
                                    <input type="checkbox" value="${escapeAttr(item.key)}" ${item.enabled !== false ? 'checked' : ''} />
                                    <span class="codicon codicon-${item.icon}"></span>
                                    <span>${escapeHtml(item.label)}</span>
                                </label>
                            `).join('')}
                        </div>` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-modal="cancel">
                            ${escapeHtml(opts.cancelLabel || "Cancel")}
                        </button>
                        <button class="btn btn-accent" data-modal="confirm">
                            ${escapeHtml(opts.confirmLabel || "Create")}
                        </button>
                    </div>
                </div>
            `;

            const input = overlay.querySelector(".modal-input");
            const errorEl = overlay.querySelector("#modal-input-error");
            const confirmBtn = overlay.querySelector("[data-modal='confirm']");

            function validate() {
                const val = input.value.trim();
                if (opts.validate) {
                    const err = opts.validate(val);
                    errorEl.textContent = err || "";
                    return !err;
                }
                return val.length > 0;
            }

            function close(result) {
                overlay.classList.add("modal-out");
                setTimeout(() => { overlay.remove(); resolve(result); }, 200);
            }

            function submit() {
                if (!validate()) return;
                if (hasSyncItems) {
                    const checkedKeys = Array.from(overlay.querySelectorAll('.sync-item input[type="checkbox"]:checked'))
                        .map(cb => cb.value);
                    if (checkedKeys.length === 0) {
                        const listEl = overlay.querySelector('.sync-item-list');
                        let errEl = listEl.querySelector('.sync-item-error');
                        if (!errEl) {
                            errEl = document.createElement('div');
                            errEl.className = 'sync-item-error';
                            listEl.appendChild(errEl);
                        }
                        errEl.textContent = 'Please select at least one item';
                        return;
                    }
                    close({ value: input.value.trim(), syncKeys: checkedKeys });
                } else {
                    close(input.value.trim());
                }
            }

            confirmBtn.addEventListener("click", submit);
            overlay.querySelector("[data-modal='cancel']").addEventListener("click", () => close(null));
            overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
            input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
            input.addEventListener("input", validate);
            document.addEventListener("keydown", function onKey(e) {
                if (e.key === "Escape") { document.removeEventListener("keydown", onKey); close(null); }
            });

            document.body.appendChild(overlay);
            input.focus();
        });
    }

    /**
     * Sync Select Modal — confirm with checkbox selection for push/pull
     * @param {object} opts - { title, message, icon, syncItems, confirmLabel, cancelLabel, variant }
     * @returns {Promise<string[]|null>} - selected sync keys or null if cancelled
     */
    function showSyncSelect(opts) {
        return new Promise((resolve) => {
            const variant = opts.variant || "accent";
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay";
            overlay.innerHTML = `
                <div class="modal">
                    <div class="modal-header modal-header-${variant}">
                        <span class="codicon codicon-${opts.icon || "sync"}"></span>
                        <span>${escapeHtml(opts.title || "Sync")}</span>
                    </div>
                    <div class="modal-body">
                        <p style="margin:0 0 4px">${escapeHtml(opts.message || "")}</p>
                        <div class="sync-item-list">
                            <div class="sync-item-label">Sync Items</div>
                            ${(opts.syncItems || []).map(item => `<label class="sync-item">
                                    <input type="checkbox" value="${escapeAttr(item.key)}" ${item.enabled !== false ? 'checked' : ''} />
                                    <span class="codicon codicon-${item.icon}"></span>
                                    <span>${escapeHtml(item.label)}</span>
                                </label>`).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-modal="cancel">
                            ${escapeHtml(opts.cancelLabel || "Cancel")}
                        </button>
                        <button class="btn ${variant === "danger" ? "btn-danger" : "btn-accent"}" data-modal="confirm">
                            ${escapeHtml(opts.confirmLabel || "Confirm")}
                        </button>
                    </div>
                </div>
            `;

            function close(result) {
                overlay.classList.add("modal-out");
                setTimeout(() => { overlay.remove(); resolve(result); }, 200);
            }

            function submit() {
                const checkedKeys = Array.from(overlay.querySelectorAll('.sync-item input[type="checkbox"]:checked'))
                    .map(cb => cb.value);
                if (checkedKeys.length === 0) {
                    const listEl = overlay.querySelector('.sync-item-list');
                    let errEl = listEl.querySelector('.sync-item-error');
                    if (!errEl) {
                        errEl = document.createElement('div');
                        errEl.className = 'sync-item-error';
                        listEl.appendChild(errEl);
                    }
                    errEl.textContent = 'Please select at least one item';
                    return;
                }
                close(checkedKeys);
            }

            overlay.querySelector("[data-modal='confirm']").addEventListener("click", submit);
            overlay.querySelector("[data-modal='cancel']").addEventListener("click", () => close(null));
            overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
            document.addEventListener("keydown", function onKey(e) {
                if (e.key === "Escape") { document.removeEventListener("keydown", onKey); close(null); }
                if (e.key === "Enter") { document.removeEventListener("keydown", onKey); submit(); }
            });

            document.body.appendChild(overlay);
        });
    }

    // ========================================
    // TOAST SYSTEM (upgraded)
    // ========================================

    function showToast(level, message, duration) {
        duration = duration || 4000;
        const toast = document.createElement("div");
        toast.className = `toast toast-${level}`;

        const iconMap = { success: "check", error: "error", info: "info" };
        const icon = iconMap[level] || "info";

        toast.innerHTML = `
            <div class="toast-content">
                <span class="codicon codicon-${icon}"></span>
                <span>${escapeHtml(message)}</span>
            </div>
            <button class="toast-close" title="Dismiss">
                <span class="codicon codicon-close"></span>
            </button>
            <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
        `;

        // Close button
        toast.querySelector(".toast-close").addEventListener("click", () => dismissToast(toast));

        toastContainer.appendChild(toast);

        // Auto-dismiss
        const timer = setTimeout(() => dismissToast(toast), duration);
        toast._timer = timer;
    }

    function dismissToast(toast) {
        if (toast._dismissed) return;
        toast._dismissed = true;
        clearTimeout(toast._timer);
        toast.classList.add("toast-out");
        setTimeout(() => toast.remove(), 300);
    }

    // ========================================
    // EVENT LISTENERS
    // ========================================

    btnLogin.addEventListener("click", () => {
        vscode.postMessage({ command: "login" });
    });

    btnLogout.addEventListener("click", async () => {
        const confirmed = await showConfirm({
            title: "Sign Out",
            message: "Are you sure you want to sign out from Google?",
            icon: "sign-out",
            confirmLabel: "Sign Out",
            variant: "danger",
        });
        if (confirmed) {
            vscode.postMessage({ command: "logout" });
        }
    });

    btnCreateProfile.addEventListener("click", async () => {
        const result = await showInput({
            title: "Create Profile",
            message: "Enter a name for the new sync profile.",
            icon: "add",
            placeholder: "e.g. work, home, laptop",
            confirmLabel: "Create",
            syncItems: syncItemsConfig,
            validate: (val) => {
                if (!val) return "Profile name is required";
                if (!/^[a-zA-Z0-9_-]+$/.test(val)) return "Only letters, numbers, hyphens, underscores";
                return null;
            },
        });
        if (result && result.value) {
            vscode.postMessage({ command: "createProfile", name: result.value, syncKeys: result.syncKeys });
        }
    });

    btnSetSettingsPath.addEventListener("click", () => {
        vscode.postMessage({ command: "setPaths", type: "settings" });
    });

    btnSetKeybindingsPath.addEventListener("click", () => {
        vscode.postMessage({ command: "setPaths", type: "keybindings" });
    });

    btnShowLogs.addEventListener("click", () => {
        vscode.postMessage({ command: "showLogs" });
    });

    btnRefresh.addEventListener("click", () => {
        btnRefresh.classList.add("spinning");
        vscode.postMessage({ command: "refresh" });
    });

    // === Profile Actions (Event Delegation) ===
    profilesList.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;

        const action = btn.dataset.action;
        const fileName = btn.dataset.file;
        const profileName = fileName.replace(".json", "");

        switch (action) {
            case "pull": {
                // Chỉ hiện items có trong meta.syncKeys của profile
                const profile = currentState?.profiles?.find(p => p.fileName === fileName);
                const metaKeys = profile?.syncKeys;
                const items = metaKeys
                    ? syncItemsConfig.filter(i => metaKeys.includes(i.key))
                    : syncItemsConfig;
                const syncKeys = await showSyncSelect({
                    title: "Pull Profile",
                    message: `Pull settings from "${profileName}" to local?`,
                    icon: "cloud-download",
                    syncItems: items,
                    confirmLabel: "Pull",
                });
                if (syncKeys) {
                    vscode.postMessage({ command: "pullProfile", fileName, syncKeys });
                }
                break;
            }
            case "push": {
                // Pre-check checkboxes match với meta.syncKeys
                const profile = currentState?.profiles?.find(p => p.fileName === fileName);
                const metaKeys = profile?.syncKeys;
                const items = syncItemsConfig.map(i => ({
                    ...i,
                    enabled: metaKeys ? metaKeys.includes(i.key) : i.enabled,
                }));
                const syncKeys = await showSyncSelect({
                    title: "Push Profile",
                    message: `Push current settings to "${profileName}"?`,
                    icon: "cloud-upload",
                    syncItems: items,
                    confirmLabel: "Push",
                });
                if (syncKeys) {
                    vscode.postMessage({ command: "updateProfile", fileName, syncKeys });
                }
                break;
            }
            case "delete": {
                const confirmed = await showConfirm({
                    title: "Delete Profile",
                    message: `This will permanently delete "${profileName}" from Google Drive. This action cannot be undone.`,
                    icon: "trash",
                    confirmLabel: "Delete",
                    variant: "danger",
                });
                if (confirmed) {
                    vscode.postMessage({ command: "deleteProfile", fileName });
                }
                break;
            }
        }
    });

    // ========================================
    // APP DATA EXPLORER
    // ========================================

    const appdataSection = document.getElementById("appdata-section");
    const appdataList = document.getElementById("appdata-list");
    const appdataEmpty = document.getElementById("appdata-empty");
    const appdataBreadcrumb = document.getElementById("appdata-breadcrumb");
    const appdataTableWrapper = document.getElementById("appdata-table-wrapper");
    const btnRefreshAppdata = document.getElementById("btn-refresh-appdata");
    const btnBackAppdata = document.getElementById("btn-back-appdata");

    // Folder navigation state
    let currentFolderId = null;
    let folderStack = []; // [{ id, name }, ...]
    let previewPending = false; // Prevent double preview

    // Pagination state
    let pageTokenStack = []; // previous page tokens
    let currentPageToken = null;
    let nextPageToken = null;
    let currentPage = 1;

    function fetchAppDataFiles(folderId, folderName, pageToken) {
        // Hiện loading state
        btnRefreshAppdata.classList.add("spinning");
        appdataEmpty.style.display = "none";
        appdataTableWrapper.style.display = "none";
        // Hiện loading placeholder
        let loadingEl = appdataTableWrapper.parentNode.querySelector(".appdata-loading");
        if (!loadingEl) {
            loadingEl = document.createElement("div");
            loadingEl.className = "appdata-loading profiles-loading";
            loadingEl.innerHTML = `<span class="spinner"></span><span>Loading files...</span>`;
            appdataTableWrapper.parentNode.insertBefore(loadingEl, appdataTableWrapper);
        }
        loadingEl.style.display = "";
        vscode.postMessage({ command: "listAppData", folderId, folderName, pageToken: pageToken || undefined });
    }

    function navigateToFolder(folderId, folderName) {
        if (currentFolderId) {
            // Find existing entry or push current
            const existingIdx = folderStack.findIndex((f) => f.id === currentFolderId);
            if (existingIdx === -1) {
                // Don't push if we're navigating from breadcrumb
            }
        }
        folderStack.push({ id: currentFolderId, name: getCurrentFolderName() });
        currentFolderId = folderId;
        btnBackAppdata.style.display = "";
        // Reset pagination on folder change
        pageTokenStack = []; currentPageToken = null; nextPageToken = null; currentPage = 1;
        fetchAppDataFiles(folderId, folderName, null);
    }

    function navigateBack() {
        if (folderStack.length === 0) return;
        const prev = folderStack.pop();
        currentFolderId = prev.id;
        btnBackAppdata.style.display = folderStack.length > 0 ? "" : "none";
        pageTokenStack = []; currentPageToken = null; nextPageToken = null; currentPage = 1;
        fetchAppDataFiles(currentFolderId, prev.name, null);
    }

    function navigateToBreadcrumb(index) {
        // index 0 = Root, 1 = first folder, etc.
        if (index === 0) {
            currentFolderId = null;
            folderStack = [];
            btnBackAppdata.style.display = "none";
            pageTokenStack = []; currentPageToken = null; nextPageToken = null; currentPage = 1;
            fetchAppDataFiles(null, "Root", null);
        } else {
            const target = folderStack[index];
            if (!target) return;
            currentFolderId = target.id;
            folderStack = folderStack.slice(0, index);
            btnBackAppdata.style.display = folderStack.length > 0 ? "" : "none";
            pageTokenStack = []; currentPageToken = null; nextPageToken = null; currentPage = 1;
            fetchAppDataFiles(currentFolderId, target.name, null);
        }
    }

    function getCurrentFolderName() {
        if (!currentFolderId) return "Root";
        if (folderStack.length > 0) {
            const last = folderStack[folderStack.length - 1];
            // The current name is actually what we navigated into
            return "Folder";
        }
        return "Root";
    }

    // Render breadcrumb
    function renderBreadcrumb(currentName) {
        let html = `<span class="breadcrumb-item" data-bc-index="0">Root</span>`;
        folderStack.forEach((f, i) => {
            if (f.id !== null) {
                html += `<span class="breadcrumb-sep codicon codicon-chevron-right"></span>`;
                html += `<span class="breadcrumb-item" data-bc-index="${i + 1}">${escapeHtml(f.name || "Folder")}</span>`;
            }
        });
        if (currentFolderId) {
            html += `<span class="breadcrumb-sep codicon codicon-chevron-right"></span>`;
            html += `<span class="breadcrumb-item active">${escapeHtml(currentName)}</span>`;
        } else {
            // Root is active
            const rootSpan = html.split("data-bc-index=\"0\">")[0];
            html = `<span class="breadcrumb-item active" data-bc-index="0">Root</span>`;
            folderStack.forEach((f, i) => {
                if (f.id !== null) {
                    html += `<span class="breadcrumb-sep codicon codicon-chevron-right"></span>`;
                    html += `<span class="breadcrumb-item" data-bc-index="${i + 1}">${escapeHtml(f.name || "Folder")}</span>`;
                }
            });
        }
        appdataBreadcrumb.innerHTML = html;
    }

    // MimeType → codicon
    function mimeIcon(mime) {
        if (mime === "application/vnd.google-apps.folder") return "folder";
        if (mime === "application/json" || (mime && mime.includes("json"))) return "json";
        if (mime && mime.startsWith("text/")) return "file-text";
        return "file";
    }

    // MimeType → human-readable label
    function mimeLabel(mime) {
        if (mime === "application/vnd.google-apps.folder") return "Folder";
        if (mime === "application/json" || (mime && mime.includes("json"))) return "JSON";
        if (mime && mime.startsWith("text/")) return "Text";
        if (mime && mime.startsWith("image/")) return "Image";
        return "File";
    }

    // MimeType → badge class
    function mimeBadgeClass(mime) {
        if (mime === "application/vnd.google-apps.folder") return "type-badge-folder";
        if (mime === "application/json" || (mime && mime.includes("json"))) return "type-badge-json";
        if (mime && mime.startsWith("text/")) return "type-badge-text";
        return "type-badge-default";
    }

    // Format file size
    function formatSize(bytes) {
        if (!bytes) return "—";
        const num = parseInt(bytes, 10);
        if (isNaN(num)) return "—";
        if (num < 1024) return `${num} B`;
        if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
        return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    }

    // Check if file is previewable
    function isPreviewable(mime) {
        return mime !== "application/vnd.google-apps.folder" &&
               !mime.startsWith("image/") &&
               !mime.startsWith("video/") &&
               !mime.startsWith("audio/");
    }

    // Render app data files table
    function renderAppDataFiles(files, folderName, newNextPageToken) {
        btnRefreshAppdata.classList.remove("spinning");
        // Ẩn loading placeholder
        const loadingEl = appdataTableWrapper.parentNode.querySelector(".appdata-loading");
        if (loadingEl) { loadingEl.style.display = "none"; }
        nextPageToken = newNextPageToken || null;
        renderBreadcrumb(folderName);

        // Google Drive API may return empty page even with valid nextPageToken.
        // Auto-go back if empty and not on page 1.
        if (files.length === 0 && currentPage > 1) {
            nextPageToken = null;
            currentPage--;
            const prevToken = pageTokenStack.pop();
            currentPageToken = prevToken || null;
            fetchAppDataFiles(currentFolderId, null, currentPageToken);
            return;
        }

        if (files.length === 0) {
            appdataEmpty.style.display = "";
            appdataTableWrapper.style.display = "none";
            return;
        }

        appdataEmpty.style.display = "none";
        appdataTableWrapper.style.display = "";

        // Sort: folders first, then by name
        const sorted = [...files].sort((a, b) => {
            const aFolder = a.mimeType === "application/vnd.google-apps.folder" ? 0 : 1;
            const bFolder = b.mimeType === "application/vnd.google-apps.folder" ? 0 : 1;
            if (aFolder !== bFolder) return aFolder - bFolder;
            return a.name.localeCompare(b.name);
        });

        appdataList.innerHTML = sorted.map((f) => {
            const isFolder = f.mimeType === "application/vnd.google-apps.folder";
            const modified = f.modifiedTime ? formatDate(f.modifiedTime) : "—";
            const icon = mimeIcon(f.mimeType);
            const label = mimeLabel(f.mimeType);
            const badgeClass = mimeBadgeClass(f.mimeType);

            return `
                <tr class="appdata-row ${isFolder ? "appdata-row-folder" : ""}"
                    ${isFolder ? `data-folder-id="${escapeAttr(f.id)}" data-folder-name="${escapeAttr(f.name)}"` : ""}>
                    <td class="appdata-name">
                        <span class="codicon codicon-${icon}"></span>
                        ${escapeHtml(f.name)}
                    </td>
                    <td><span class="type-badge ${badgeClass}">${label}</span></td>
                    <td class="appdata-size">${isFolder ? "—" : formatSize(f.size)}</td>
                    <td class="appdata-date">${modified}</td>
                    <td class="appdata-actions">
                        ${!isFolder && isPreviewable(f.mimeType) ? `
                            <button class="btn-icon" data-preview-id="${escapeAttr(f.id)}" data-preview-name="${escapeAttr(f.name)}" title="Preview">
                                <span class="codicon codicon-eye"></span>
                            </button>
                        ` : ""}
                    </td>
                </tr>
            `;
        }).join("");

        // Render pagination bar
        renderPagination();
    }

    // Preview modal
    function showFilePreview(fileName, content) {
        previewPending = false;
        // Close existing preview modal if any
        const existing = document.querySelector(".file-preview-modal");
        if (existing) { existing.closest(".modal-overlay")?.remove(); }
        let formatted = content;
        try {
            const parsed = JSON.parse(content);
            formatted = JSON.stringify(parsed, null, 2);
        } catch { /* not JSON, keep as-is */ }

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal file-preview-modal">
                <div class="modal-header modal-header-accent">
                    <span class="codicon codicon-eye"></span>
                    <span>${escapeHtml(fileName)}</span>
                </div>
                <div class="modal-body file-preview-body">
                    <pre class="file-preview-content"><code>${escapeHtml(formatted)}</code></pre>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-modal="cancel">Close</button>
                </div>
            </div>
        `;

        function close() {
            overlay.classList.add("modal-out");
            setTimeout(() => overlay.remove(), 200);
        }

        overlay.querySelector("[data-modal='cancel']").addEventListener("click", close);

        document.body.appendChild(overlay);
    }

    // Render pagination controls
    function renderPagination() {
        let paginationBar = document.getElementById("appdata-pagination");
        if (!paginationBar) {
            paginationBar = document.createElement("div");
            paginationBar.id = "appdata-pagination";
            paginationBar.className = "pagination-bar";
            appdataTableWrapper.parentNode.appendChild(paginationBar);
        }

        // Hide if first page and no next
        if (currentPage === 1 && !nextPageToken) {
            paginationBar.style.display = "none";
            return;
        }

        paginationBar.style.display = "";
        const hasPrev = currentPage > 1;

        paginationBar.innerHTML = `
            <button class="btn btn-secondary btn-sm" id="btn-page-prev" ${!hasPrev ? "disabled" : ""}>
                <span class="codicon codicon-chevron-left"></span> Prev
            </button>
            <span class="page-indicator">Page ${currentPage}</span>
            <button class="btn btn-secondary btn-sm" id="btn-page-next" ${!nextPageToken ? "disabled" : ""}>
                Next <span class="codicon codicon-chevron-right"></span>
            </button>
        `;

        document.getElementById("btn-page-prev")?.addEventListener("click", () => {
            if (currentPage <= 1) return;
            currentPage--;
            const prevToken = pageTokenStack.pop();
            currentPageToken = prevToken || null;
            fetchAppDataFiles(currentFolderId, null, currentPageToken);
        });

        document.getElementById("btn-page-next")?.addEventListener("click", () => {
            if (!nextPageToken) return;
            pageTokenStack.push(currentPageToken);
            currentPageToken = nextPageToken;
            currentPage++;
            fetchAppDataFiles(currentFolderId, null, currentPageToken);
        });
    }

    // Event: Refresh app data
    btnRefreshAppdata.addEventListener("click", () => {
        btnRefreshAppdata.classList.add("spinning");
        pageTokenStack = []; currentPageToken = null; nextPageToken = null; currentPage = 1;
        fetchAppDataFiles(currentFolderId, null, null);
        setTimeout(() => btnRefreshAppdata.classList.remove("spinning"), 800);
    });

    // Event: Back button
    btnBackAppdata.addEventListener("click", () => {
        navigateBack();
    });

    // Event: Breadcrumb click
    appdataBreadcrumb.addEventListener("click", (e) => {
        const item = e.target.closest("[data-bc-index]");
        if (!item || item.classList.contains("active")) return;
        const idx = parseInt(item.dataset.bcIndex, 10);
        navigateToBreadcrumb(idx);
    });

    // Event: Table delegation (dblclick folder, click preview)
    appdataList.addEventListener("dblclick", (e) => {
        const row = e.target.closest("[data-folder-id]");
        if (row) {
            navigateToFolder(row.dataset.folderId, row.dataset.folderName);
        }
    });

    appdataList.addEventListener("click", (e) => {
        const previewBtn = e.target.closest("[data-preview-id]");
        if (previewBtn && !previewPending) {
            previewPending = true;
            vscode.postMessage({
                command: "previewFile",
                fileId: previewBtn.dataset.previewId,
                fileName: previewBtn.dataset.previewName,
            });
        }
    });

    // ========================================
    // MESSAGE HANDLER
    // ========================================
    // SYNC PROGRESS MODAL
    // ========================================

    let syncModal = null;
    let syncSteps = [];
    let syncTotal = 0;
    let syncCompleted = false;

    /** Show sync progress modal */
    function showSyncProgress(title) {
        closeSyncProgress();
        syncSteps = [];
        syncTotal = 0;
        syncCompleted = false;

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay sync-progress-overlay";
        overlay.innerHTML = `
            <div class="modal sync-progress-modal">
                <div class="modal-header">
                    <div class="modal-icon codicon codicon-sync sync-spin"></div>
                    <h3 class="modal-title">${escapeHtml(title)}</h3>
                </div>
                <div class="sync-steps" id="sync-steps-container"></div>
                <div class="sync-progress-bar-container">
                    <div class="sync-progress-bar" id="sync-progress-bar"></div>
                </div>
                <div class="sync-progress-text" id="sync-progress-text">Đang chuẩn bị...</div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener("click", (e) => {
            // Chỉ cho đóng khi sync đã hoàn thành
            if (e.target === overlay && syncCompleted) { closeSyncProgress(); }
        });
        requestAnimationFrame(() => overlay.classList.add("visible"));
        syncModal = overlay;
    }

    /** Update a sync step */
    function updateSyncStep(step, current, total, status) {
        if (!syncModal) { return; }
        syncTotal = total;

        // Đảm bảo step tồn tại
        if (!syncSteps.find(s => s.name === step)) {
            syncSteps.push({ name: step, status: "pending" });
        }

        // Cập nhật status
        const s = syncSteps.find(s => s.name === step);
        if (s) { s.status = status; }

        renderSyncSteps();
    }

    /** Render sync steps UI */
    function renderSyncSteps() {
        if (!syncModal) { return; }

        const container = syncModal.querySelector("#sync-steps-container");
        if (container) {
            container.innerHTML = syncSteps.map(s => {
                const icon = s.status === "done" ? "codicon-check"
                    : s.status === "active" ? "codicon-loading sync-spin"
                    : "codicon-circle-outline";
                const cls = `sync-step sync-step-${s.status}`;
                return `<div class="${cls}">
                    <span class="codicon ${icon}"></span>
                    <span>${escapeHtml(s.name)}</span>
                </div>`;
            }).join("");
        }

        // Progress bar
        const done = syncSteps.filter(s => s.status === "done").length;
        const total = syncTotal || syncSteps.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const bar = syncModal.querySelector("#sync-progress-bar");
        if (bar) { bar.style.width = `${pct}%`; }

        const text = syncModal.querySelector("#sync-progress-text");
        if (text) { text.textContent = `${done} / ${total} hoàn thành`; }
    }

    /** Mark sync as complete — show done state */
    function markSyncDone() {
        syncCompleted = true;
        if (!syncModal) { return; }

        // Đổi icon header thành check
        const icon = syncModal.querySelector(".modal-icon");
        if (icon) {
            icon.className = "modal-icon codicon codicon-check";
            icon.style.color = "var(--ag-accent)";
        }

        // Tự đóng sau 800ms
        setTimeout(() => closeSyncProgress(), 800);
    }

    /** Close sync progress modal */
    function closeSyncProgress() {
        if (syncModal) {
            const el = syncModal;
            el.classList.remove("visible");
            setTimeout(() => el.remove(), 200);
            syncModal = null;
            syncSteps = [];
            syncCompleted = false;
        }
    }

    // ========================================
    // MESSAGE HANDLER
    // ========================================

    window.addEventListener("message", (event) => {
        const msg = event.data;
        switch (msg.type) {
            case "state":
                currentState = msg.data;
                renderState(msg.data);
                break;
            case "loading":
                handleLoading(msg.action, msg.loading);
                break;
            case "toast":
                showToast(msg.level, msg.message);
                break;
            case "syncStart":
                showSyncProgress(msg.title);
                break;
            case "syncProgress":
                updateSyncStep(msg.step, msg.current, msg.total, msg.status);
                break;
            case "syncDone":
                markSyncDone();
                break;
            case "askExtensionSync": {
                const installList = (msg.toInstall || []);
                const deleteList = (msg.toDelete || []);
                let details = `Sync sẽ cài ${installList.length} và gỡ ${deleteList.length} extensions.\n\n`;
                if (installList.length > 0) {
                    details += `📥 Cài đặt:\n${installList.map(id => `  • ${id}`).join("\n")}\n\n`;
                }
                if (deleteList.length > 0) {
                    details += `🗑️ Gỡ bỏ:\n${deleteList.map(id => `  • ${id}`).join("\n")}`;
                }
                showConfirm({
                    title: "Extension Sync",
                    message: details,
                    icon: "extensions",
                    confirmLabel: "Đồng ý",
                    cancelLabel: "Bỏ qua",
                    variant: "accent",
                }).then((confirmed) => {
                    if (confirmed) {
                        vscode.postMessage({
                            command: "applyExtensionSync",
                            toInstall: installList,
                            toDelete: deleteList,
                        });
                    } else {
                        // Bỏ qua extension sync — vẫn hỏi reload cho settings/keybindings
                        vscode.postMessage({ command: "reloadWindow" });
                    }
                });
                break;
            }
            case "askReload":
                showConfirm({
                    title: "Reload Required",
                    message: "Profile applied! Reload the window to see all changes?",
                    icon: "refresh",
                    confirmLabel: "Reload Now",
                    cancelLabel: "Later",
                    variant: "accent",
                }).then((confirmed) => {
                    if (confirmed) {
                        vscode.postMessage({ command: "reloadWindow" });
                    }
                });
                break;
            case "appDataFiles":
                renderAppDataFiles(msg.files || [], msg.folderName || "Root", msg.nextPageToken);
                break;
            case "filePreview":
                showFilePreview(msg.fileName, msg.content);
                break;
            case "profiles":
                // Pha 2: Cập nhật profiles sau khi load xong
                if (currentState) {
                    currentState.profiles = msg.data || [];
                }
                renderProfiles(msg.data || []);
                btnRefresh.classList.remove("spinning");
                break;
        }
    });

    // ========================================
    // RENDER FUNCTIONS
    // ========================================

    /** Render entire UI based on state */
    function renderState(state) {
        if (!state.isAuthenticated) {
            loginSection.style.display = "";
            dashboardSection.style.display = "none";
            appdataSection.style.display = "none";
            headerUser.innerHTML = "";
            return;
        }

        loginSection.style.display = "none";
        dashboardSection.style.display = "";
        appdataSection.style.display = "";

        // Lưu sync items config từ backend
        syncItemsConfig = state.syncItems || [];

        // Header user info
        const avatarHtml = state.picture
            ? `<img class="avatar avatar-sm" src="${escapeAttr(state.picture)}" alt="" />`
            : `<span class="codicon codicon-account"></span>`;
        headerUser.innerHTML = `
            ${avatarHtml}
            <span>${escapeHtml(state.email || "Google")}</span>
        `;

        // Account info with avatar
        const accountCard = document.querySelector(".account-info");
        if (accountCard) {
            const acctAvatar = state.picture
                ? `<img class="avatar" src="${escapeAttr(state.picture)}" alt="" />`
                : `<span class="status-dot status-online"></span>`;
            accountCard.innerHTML = `
                ${acctAvatar}
                <span class="account-email">${escapeHtml(state.email || "--")}</span>
            `;
        }

        // Profiles: null = đang loading, [] = rỗng, [...] = có data
        if (state.profiles === null) {
            // Hiện loading spinner + xoay nút refresh
            profileCount.textContent = "...";
            profilesList.innerHTML = `
                <div class="profiles-loading">
                    <span class="spinner"></span>
                    <span>Loading profiles...</span>
                </div>
            `;
            profilesEmpty.style.display = "none";
            btnRefresh.classList.add("spinning");
        } else {
            renderProfiles(state.profiles || []);
        }

        // Auto-load app data files on first state
        btnRefreshAppdata.classList.add("spinning");
        pageTokenStack = []; currentPageToken = null; nextPageToken = null; currentPage = 1;
        fetchAppDataFiles(currentFolderId, null, null);
    }

    /** Render profile cards list */
    function renderProfiles(profiles) {
        profileCount.textContent = profiles.length;

        if (profiles.length === 0) {
            profilesEmpty.style.display = "";
            profilesList.innerHTML = "";
            return;
        }

        profilesEmpty.style.display = "none";

        profilesList.innerHTML = profiles
            .map((p) => {
                const modified = p.modifiedTime ? formatDate(p.modifiedTime) : "Unknown";
                return `
                <div class="profile-card">
                    <div class="profile-name">
                        <span class="codicon codicon-file-code"></span>
                        ${escapeHtml(p.name)}
                    </div>
                    <div class="profile-meta">
                        <span class="codicon codicon-calendar" style="font-size:11px;"></span>
                        ${modified}
                    </div>
                    <div class="profile-actions">
                        <button class="btn btn-primary btn-sm"
                                data-action="pull" data-file="${escapeAttr(p.fileName)}"
                                title="Download profile to this device">
                            <span class="codicon codicon-cloud-download"></span>
                            Pull
                        </button>
                        <button class="btn btn-secondary btn-sm"
                                data-action="push" data-file="${escapeAttr(p.fileName)}"
                                title="Upload current config to this profile">
                            <span class="codicon codicon-cloud-upload"></span>
                            Push
                        </button>
                        <button class="btn btn-danger btn-sm"
                                data-action="delete" data-file="${escapeAttr(p.fileName)}"
                                title="Delete profile">
                            <span class="codicon codicon-trash"></span>
                        </button>
                    </div>
                </div>
            `;
            })
            .join("");
    }

    // === Loading Handler ===
    function handleLoading(action, loading) {
        const btns = document.querySelectorAll("[data-action]");
        btns.forEach((btn) => {
            const key = `${btn.dataset.action}-${btn.dataset.file}`;
            if (action === key) {
                btn.disabled = loading;
                if (loading) {
                    btn.dataset.originalHtml = btn.innerHTML;
                    btn.innerHTML = '<span class="spinner"></span>';
                } else if (btn.dataset.originalHtml) {
                    btn.innerHTML = btn.dataset.originalHtml;
                    delete btn.dataset.originalHtml;
                }
            }
        });

        if (action === "login") {
            btnLogin.disabled = loading;
            if (loading) {
                btnLogin.innerHTML = '<span class="spinner"></span> Signing in...';
            } else {
                btnLogin.innerHTML = '<span class="codicon codicon-sign-in"></span> Sign in with Google';
            }
        }

        if (action === "createProfile") {
            btnCreateProfile.disabled = loading;
        }
    }

    // ========================================
    // UTILITIES
    // ========================================

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function formatDate(isoString) {
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString("en-US", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
        } catch {
            return isoString;
        }
    }

    // === Initialize ===
    vscode.postMessage({ command: "getState" });
})();

