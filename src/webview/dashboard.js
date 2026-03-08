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
                    <div class="modal-body">
                        ${escapeHtml(opts.message || "Are you sure?")}
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
                close(input.value.trim());
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
        const name = await showInput({
            title: "Create Profile",
            message: "Enter a name for the new sync profile.",
            icon: "add",
            placeholder: "e.g. work, home, laptop",
            confirmLabel: "Create",
            validate: (val) => {
                if (!val) return "Profile name is required";
                if (!/^[a-zA-Z0-9_-]+$/.test(val)) return "Only letters, numbers, hyphens, underscores";
                return null;
            },
        });
        if (name) {
            vscode.postMessage({ command: "createProfile", name });
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
        setTimeout(() => btnRefresh.classList.remove("spinning"), 800);
    });

    // === Profile Actions (Event Delegation) ===
    profilesList.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;

        const action = btn.dataset.action;
        const fileName = btn.dataset.file;
        const profileName = fileName.replace(".json", "");

        switch (action) {
            case "pull":
                vscode.postMessage({ command: "pullProfile", fileName });
                break;
            case "push":
                vscode.postMessage({ command: "updateProfile", fileName });
                break;
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
            headerUser.innerHTML = "";
            return;
        }

        loginSection.style.display = "none";
        dashboardSection.style.display = "";

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

        // Profiles
        renderProfiles(state.profiles || []);
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
            });
        } catch {
            return isoString;
        }
    }

    // === Initialize ===
    vscode.postMessage({ command: "getState" });
})();
