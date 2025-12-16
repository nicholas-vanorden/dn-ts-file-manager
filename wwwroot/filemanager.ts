interface FileManagerOptions {
    triggerId: string;
    title?: string;
    allowUpload?: boolean;
    allowDelete?: boolean;
    allowRename?: boolean;
    allowCreateFolder?: boolean;
}

interface BrowseResult {
    path: string;
    fullPath: string;
    parent?: string | null;
    directories: string[];
    files: FileDetails[];
}

interface FileDetails {
    name: string;
    size: number;
    modified: string;
}

type UI = ReturnType<typeof bindUI>;

export function initFileManager(options: FileManagerOptions) {
    const trigger = document.getElementById(options.triggerId)! as HTMLElement;
    if (!trigger) {
        throw new Error(`Trigger element '${options.triggerId}' not found`);
    }

    const dialog = createDialog(options.title ?? "File Manager", options.allowUpload ?? false, options.allowCreateFolder ?? false);
    document.body.appendChild(dialog);

    const ui = bindUI(dialog);
    wireEvents(dialog, ui, options.allowRename ?? false, options.allowDelete ?? false);

    trigger.addEventListener("click", () => {
        dialog.showModal();
    });

    initializeFileManagerLogic(ui, options.allowRename ?? false, options.allowDelete ?? false);

    if (shouldOpenFromHash()) {
        dialog.showModal();
        loadDirectory(ui, getCurrentPath(), options.allowRename ?? false, options.allowDelete ?? false);
    }
}

function createDialog(title: string, canUpload: boolean, canCreateFolder: boolean): HTMLDialogElement {
    let actionsHtml = "";
    let uploadProgressHtml = "";
    if (canUpload || canCreateFolder) {
        const uploadHtml = canUpload ? `
            <input type="file" id="fileInput" />
            <button id="uploadBtn">Upload</button>
        ` : "";
        const newFolderHtml = canCreateFolder ? `
            <button id="newFolderBtn">New Folder</button>
        ` : "";
        actionsHtml = `
            <div id="actions">
                ${uploadHtml}
                ${newFolderHtml}
            </div>`;
        uploadProgressHtml = canUpload ? `
            <div id="uploadProgress" class="hidden">
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
            </div>` : "";
    }

    const dialog = document.createElement("dialog");
    dialog.className = "fm-dialog";

    dialog.innerHTML = `
        <div class="fm-dialog-container">
            <div class="fm-header">
                <h2>${title}</h2>
                <button class="fm-close" aria-label="Close">✕</button>
            </div>

            <div class="fm-body">
                <div id="breadcrumbs"></div>
                <div id="files"></div>
                ${actionsHtml}
                ${uploadProgressHtml}
            </div>
            <div class="fm-dialog-filler"></div>
        </div>
    `;

    return dialog;
}

function bindUI(dialog: HTMLDialogElement) {
    return {
        closeBtn: dialog.querySelector(".fm-close")! as HTMLButtonElement,
        filesDiv: dialog.querySelector("#files")! as HTMLElement,
        breadcrumbsDiv: dialog.querySelector("#breadcrumbs")! as HTMLElement,
        fileInput: dialog.querySelector("#fileInput") as HTMLInputElement,
        uploadBtn: dialog.querySelector("#uploadBtn") as HTMLButtonElement,
        newFolderBtn: dialog.querySelector("#newFolderBtn") as HTMLButtonElement,
        uploadProgress: dialog.querySelector("#uploadProgress") as HTMLElement,
        progressFill: dialog.querySelector(".progress-fill") as HTMLElement,
    };
}

function wireEvents(dialog: HTMLDialogElement, ui: UI, canRename: boolean, canDelete: boolean) {
    dialog.addEventListener("click", (e) => {
        if (e.target === dialog) {
            dialog.close();
        }
    });

    ui.closeBtn.addEventListener("click", () => {
        dialog.close();
    });

    ui.uploadBtn && ui.uploadBtn.addEventListener("click", async () => {
        if (!ui.fileInput.files?.length) {
            return;
        }   
        await uploadFileWithProgress(ui, ui.fileInput.files[0], canRename, canDelete);
    });

    ui.newFolderBtn && ui.newFolderBtn.addEventListener("click", async () => {
        const name = prompt("Folder name:", "New Folder");
        await createFolder(ui, name || "New Folder", canRename, canDelete);
    });
}

function initializeFileManagerLogic(ui: UI, canRename: boolean, canDelete: boolean) {
    window.addEventListener("hashchange", () => {
        loadDirectory(ui, getCurrentPath(), canRename, canDelete);
    });

    loadDirectory(ui, getCurrentPath(), canRename, canDelete);
}

function shouldOpenFromHash(): boolean {
    const path = location.hash.replace("#/", "");
    return path.length > 0;
}

function getCurrentPath(): string {
    return location.hash.replace("#/", "") || "";
}

async function loadDirectory(ui: UI, path: string, canRename: boolean, canDelete: boolean) {
    const response = await fetch(`/files?path=${encodeURIComponent(path)}`);
    const data: BrowseResult = await response.json();

    renderBreadcrumbs(ui, data.path, data.directories.length, data.files.length);
    renderFiles(ui, data, canRename, canDelete);
}

function renderBreadcrumbs(ui: UI, path: string, dirCount: number, fileCount: number) {
    const html: string[] = [];

    if (path) {
        html.push(`<a href="#/">home</a>`);

        const parts = path.split("/");
        let accumulatedPath = "#";

        for (let i = 0; i < parts.length; i++) {
            if (i === parts.length - 1) {
                html.push(`<span>${parts[i]}</span>`);
            } else {
                accumulatedPath += "/" + parts[i];
                html.push(`<a href="${accumulatedPath}">${parts[i]}</a>`);
            }
        }
        html.push();
    } else {
        html.push(`<span>home</span>`);
    }

    ui.breadcrumbsDiv.innerHTML = html.join(" / ") +
        `<span class="dir-info"><i>${dirCount} directories and ${fileCount} files</i></span>`;
}

function renderFiles(ui: UI, data: BrowseResult, canRename: boolean, canDelete: boolean) {
    const html: string[] = [];

    if (data.files.length === 0) {
        html.push("<table><thead><tr><th>Name</th><th></th><th></th></tr></thead>");
    } else {
        html.push("<table><thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead>");
    }

    html.push("<tbody>");

    if (data.parent) {
        html.push(`<tr class="item-row"><td colspan="3"><span class="icon-dir">📁 </span><span class="item linkDir" data-path="${data.parent}">..</span></td></tr>`);
    } else if (data.path) {
        html.push(`<tr class="item-row"><td colspan="3"><span class="icon-dir">📁 </span><span class="item linkDir" data-path="">..</td></tr>`);
    }

    for (const d of data.directories) {
        const fullPath = data.path ? `${data.path}/${d}` : d;
        html.push(`
            <tr class="item-row">
                <td colspan="3">
                    <div class="row">
                        <div class="row-left">
                            <span class="icon-dir">📁 </span><span class="item linkDir" data-path="${fullPath}">${d}</span>
                        </div>
                        <div class="row-actions">
                            ${canRename ? `<span class="icon rename" title="Rename" data-name="${d}" data-type="dir">✏️</span>` : ""}
                            ${canDelete ? `<span class="icon delete" title="Delete" data-name="${d}" data-type="dir">❌</span>` : ""}
                        </div>
                    </div>
                </td>
            </tr>
        `);
    }

    for (const f of data.files) {
        const fullPath = data.path ? `${data.path}/${f.name}` : f.name;
        html.push(`
            <tr class="item-row">
                <td>
                    <div class="row">
                        <div class="row-left">
                            <span class="icon-file">📄 </span><span class="item linkFile" title="Download" data-path="${fullPath}">${f.name}</span>
                        </div>
                        <div class="row-actions">
                            ${canRename ? `<span class="icon rename" title="Rename" data-name="${f.name}" data-type="file">✏️</span>` : ""}
                            ${canDelete ? `<span class="icon delete" title="Delete" data-name="${f.name}" data-type="file">❌</span>` : ""}
                        </div>
                    </div>
                </td>
                <td>${formatFileSize(f.size)}</td>
                <td>${formatRelativeTime(f.modified)}</td>
            </tr>
        `);
    }

    if (data.directories.length === 0 && data.files.length === 0) {
        html.push(`<tr><td colspan="3"><i>This directory is empty</i></td></tr>`);
    }

    html.push("</tbody></table>");

    ui.filesDiv.innerHTML = html.join("");

    for (const link of ui.filesDiv.querySelectorAll(".linkDir")) {
        link.addEventListener("click", () => {
            const dir = (link as HTMLElement).dataset.path!;
            location.hash = "#/" + dir;
        });
    }

    for (const link of ui.filesDiv.querySelectorAll(".linkFile")) {
        link.addEventListener("click", () => {
            const file = (link as HTMLElement).dataset.path!;
            const url = `/files/download?path=${encodeURIComponent(file)}`;
            window.location.href = url;
        });
    }

    if (canRename) {
        for (const btn of ui.filesDiv.querySelectorAll(".rename")) {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                renameItem(ui,
                    (btn as HTMLElement).dataset.name!,
                    canRename,
                    canDelete
                );
            });
        }
    }

    if (canDelete) {
        for (const btn of ui.filesDiv.querySelectorAll(".delete")) {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                deleteItem(ui,
                    (btn as HTMLElement).dataset.name!,
                    (btn as HTMLElement).dataset.type!,
                    canRename,
                    canDelete
                );
            });
        }
    }
}

async function uploadFileWithProgress(ui: UI, file: File, canRename: boolean, canDelete: boolean) {
    const path = getCurrentPath();
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open(
        "POST",
        `/files/upload?path=${encodeURIComponent(path)}`,
        true
    );

    ui.uploadProgress.classList.remove("hidden");
    ui.progressFill.style.width = "0%";

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            ui.progressFill.style.width = `${percent}%`;
        }
    };

    xhr.onload = async () => {
        ui.uploadProgress.classList.add("hidden");
        ui.progressFill.style.width = "0%";
        ui.fileInput.value = "";

        if (xhr.status >= 200 && xhr.status < 300) {
            await loadDirectory(ui, path, canRename, canDelete);
        } else {
            alert(`Upload failed: ${xhr.responseText}`);
        }
    };

    xhr.onerror = () => {
        ui.uploadProgress.classList.add("hidden");
        alert("Upload failed");
    };

    xhr.send(formData);
}

async function createFolder(ui: UI, name: string = "New Folder", canRename: boolean, canDelete: boolean) {
    const path = getCurrentPath();
    const response = await fetch(`/files/mkdir?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name || "New Folder")}`, {
        method: "POST"
    });

    if (!response.ok) {
        const errorText = await response.text();
        alert(`Failed to create folder: ${errorText}`);
        return;
    }

    await loadDirectory(ui, path, canRename, canDelete);
}

async function renameItem(ui: UI, name: string, canRename: boolean, canDelete: boolean) {
    const newName = prompt("New name:", name);
    if (!newName || newName === name) {
        return;
    }

    const path = getCurrentPath();

    const response = await fetch(
        `/files/rename?path=${encodeURIComponent(path)}&oldName=${encodeURIComponent(name)}&newName=${encodeURIComponent(newName)}`,
        { method: "POST" }
    );

    if (!response.ok) {
        alert(await response.text());
        return;
    }

    await loadDirectory(ui, path, canRename, canDelete);
}

async function deleteItem(ui: UI, name: string, type: string, canRename: boolean, canDelete: boolean) {
    if (!confirm(`Delete ${type} "${name}"? This cannot be undone.`)) {
        return;
    }

    const path = getCurrentPath();

    const response = await fetch(
        `/files/delete?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}&type=${type}`,
        { method: "POST" }
    );

    if (!response.ok) {
        alert(await response.text());
        return;
    }

    await loadDirectory(ui, path, canRename, canDelete);
}

function formatFileSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatRelativeTime(utcDate: string | Date): string {
    const date = typeof utcDate === "string"
        ? new Date(utcDate)
        : utcDate;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (diffMs < 0) {
        return "in the future";
    }

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours   = Math.floor(minutes / 60);
    const days    = Math.floor(hours / 24);
    const weeks   = Math.floor(days / 7);
    const months  = Math.floor(days / 30);
    const years   = Math.floor(days / 365);

    if (seconds < 30) return "just now";
    if (seconds < 60) return `${seconds} seconds ago`;
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    if (hours < 24)   return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    if (days === 1)   return "yesterday";
    if (days < 7)     return `${days} days ago`;
    if (weeks < 5)    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    if (months < 12)  return `${months} month${months === 1 ? "" : "s"} ago`;

    return `${years} year${years === 1 ? "" : "s"} ago`;
}
