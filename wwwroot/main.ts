import type { BrowseResult } from "./types";

const filesDiv = document.getElementById("files")!;
const breadcrumbsDiv = document.getElementById("breadcrumbs")!;

const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement;

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
        html.push(`<tr class="item-row"><td colspan="3">📁 <span class="item linkDir" data-path="${fullPath}">${d}</span></td></tr>`);
    }

    for (const f of data.files) {
        const fullPath = data.path ? `${data.path}/${f.name}` : f.name;
        html.push(`<tr class="item-row">`);
        html.push(`<td>📄 <span class="item linkFile" data-path="${fullPath}">${f.name}</span></td>`);
        html.push(`<td>${formatFileSize(f.size)}</td>`);
        html.push(`<td>${formatRelativeTime(f.modified)}</td></tr>`);
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

    breadcrumbsDiv.innerHTML = html.join(" / ") + `<span class="dir-info"><i>${dirCount} directories and ${fileCount} files</i></span>`;
}

async function uploadFile() {
    if (!fileInput.files || fileInput.files.length === 0) {
        return;
    }

    const file = fileInput.files[0];
    const path = getCurrentPath();

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
        `/files/upload?path=${encodeURIComponent(path)}`,
        {
            method: "POST",
            body: formData
        }
    );

    if (!response.ok) {
        const text = await response.text();
        alert(`Upload failed: ${text}`);
        return;
    }

    fileInput.value = ""; // reset
    await loadDirectory(path); // refresh listing
}

uploadBtn.addEventListener("click", uploadFile);

const xhr = new XMLHttpRequest();
xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
        console.log(Math.round((e.loaded / e.total) * 100));
    }
};

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

window.addEventListener("hashchange", () => {
    loadDirectory(getCurrentPath());
});

// Initial load
loadDirectory(getCurrentPath());