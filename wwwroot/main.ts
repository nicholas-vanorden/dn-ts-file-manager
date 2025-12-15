import type { BrowseResult } from "./types";

const filesDiv = document.getElementById("files")! as HTMLElement;
const breadcrumbsDiv = document.getElementById("breadcrumbs")! as HTMLElement;
const fileInput = document.getElementById("fileInput")! as HTMLInputElement;
const uploadBtn = document.getElementById("uploadBtn")! as HTMLButtonElement;
const uploadProgress = document.getElementById("uploadProgress")! as HTMLElement;
const progressFill = uploadProgress.querySelector(".progress-fill")! as HTMLElement;
const newFolderBtn = document.getElementById("newFolderBtn")! as HTMLButtonElement;

function getCurrentPath(): string {
    return location.hash.replace("#/", "") || "";
}

async function loadDirectory(path: string) {
    const response = await fetch(`/files?path=${encodeURIComponent(path)}`);
    const data: BrowseResult = await response.json();

    renderBreadcrumbs(data.path, data.directories.length, data.files.length);
    renderFiles(data);
}

function renderFiles(data: BrowseResult) {
    const html: string[] = [];

    if (data.files.length === 0) {
        html.push("<table><thead><tr><th>Name</th><th></th><th></th></tr></thead>");
    } else {
        html.push("<table><thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead>");
    }

    html.push("<tbody>");

    if (data.parent) {
        html.push(`<tr class="item-row"><td colspan="3">📁 <span class="item linkDir" data-path="${data.parent}">..</span></td></tr>`);
    } else if (data.path) {
        html.push(`<tr class="item-row"><td colspan="3">📁 <span class="item linkDir" data-path="">..</td></tr>`);
    }

    for (const d of data.directories) {
        const fullPath = data.path ? `${data.path}/${d}` : d;
        html.push(`
            <tr class="item-row">
                <td colspan="3">
                    <div class="row">
                        <div class="row-left">
                            📁 <span class="item linkDir" data-path="${fullPath}">${d}</span>
                        </div>
                        <div class="row-actions">
                            <span class="icon rename" title="Rename" data-name="${d}" data-type="dir">✏️</span>
                            <span class="icon delete" title="Delete" data-name="${d}" data-type="dir">❌</span>
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
                            📄 <span class="item linkFile" data-path="${fullPath}">${f.name}</span>
                        </div>
                        <div class="row-actions">
                            <span class="icon rename" title="Rename" data-name="${f.name}" data-type="file">✏️</span>
                            <span class="icon delete" title="Delete" data-name="${f.name}" data-type="file">❌</span>
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

    filesDiv.innerHTML = html.join("");

    for (const link of filesDiv.querySelectorAll(".linkDir")) {
        link.addEventListener("click", () => {
            const dir = (link as HTMLElement).dataset.path!;
            location.hash = "#/" + dir;
        });
    }

    for (const link of filesDiv.querySelectorAll(".linkFile")) {
        link.addEventListener("click", () => {
            const file = (link as HTMLElement).dataset.path!;
            const url = `/files/download?path=${encodeURIComponent(file)}`;
            window.location.href = url;
        });
    }

    for (const btn of filesDiv.querySelectorAll(".rename")) {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            renameItem((btn as HTMLElement).dataset.name!);
        });
    }

    for (const btn of filesDiv.querySelectorAll(".delete")) {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteItem(
                (btn as HTMLElement).dataset.name!,
                (btn as HTMLElement).dataset.type!
            );
        });
    }
}

function renderBreadcrumbs(path: string, dirCount: number, fileCount: number) {
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

    breadcrumbsDiv.innerHTML = html.join(" / ") +
        `<span class="dir-info"><i>${dirCount} directories and ${fileCount} files</i></span>`;
}

async function uploadFileWithProgress() {
    if (!fileInput.files || fileInput.files.length === 0) {
        return;
    }

    const file = fileInput.files[0];
    const path = getCurrentPath();

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open(
        "POST",
        `/files/upload?path=${encodeURIComponent(path)}`,
        true
    );

    uploadProgress.classList.remove("hidden");
    progressFill.style.width = "0%";

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = `${percent}%`;
        }
    };

    xhr.onload = async () => {
        uploadProgress.classList.add("hidden");
        progressFill.style.width = "0%";
        fileInput.value = "";

        if (xhr.status >= 200 && xhr.status < 300) {
            await loadDirectory(path);
        } else {
            alert(`Upload failed: ${xhr.responseText}`);
        }
    };

    xhr.onerror = () => {
        uploadProgress.classList.add("hidden");
        alert("Upload failed");
    };

    xhr.send(formData);
}

async function createFolder() {
    const name = prompt("Folder name:", "New Folder");

    const path = getCurrentPath();
    const response = await fetch(`/files/mkdir?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name || "New Folder")}`, {
        method: "POST"
    });

    if (!response.ok) {
        const errorText = await response.text();
        alert(`Failed to create folder: ${errorText}`);
        return;
    }

    await loadDirectory(path);
}

async function renameItem(name: string) {
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

    await loadDirectory(path);
}

async function deleteItem(name: string, type: string) {
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

    await loadDirectory(path);
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

uploadBtn.addEventListener("click", uploadFileWithProgress);
newFolderBtn.addEventListener("click", createFolder);
window.addEventListener("hashchange", () => {
    loadDirectory(getCurrentPath());
});

// Initial load
loadDirectory(getCurrentPath());