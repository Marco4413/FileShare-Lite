async function ReloadShares() {
    /** @type {HTMLUListElement} */
    const sharesList = document.getElementById("shares");
    await LoadShares(sharesList);
}

async function ReloadFS() {
    /** @type {HTMLUListElement} */
    const fsList = document.getElementById("fs");
    await LoadFSFromPath(fsList);
}

/** @param {HTMLUListElement} sharesList */
async function LoadShares(sharesList) {
    const res = await fetch("/api/share/all", { "credentials": "include" })
    sharesList.innerHTML = "";
    const shares = await res.json();
    for (const share of shares) {
        const shareListItem = document.createElement("li");
        shareListItem.classList.add("share-item");
        const shareDelete = document.createElement("button");
        shareDelete.classList.add("delete");
        shareDelete.innerText = "X";
        shareDelete.addEventListener("click", async () => {
            const res = await fetch(`/api/share/${share.id}`, { "method": "DELETE", "credentials": "include" });
            if (!res.ok)
                window.alert(await res.text());
            LoadShares(sharesList);
        });
        shareListItem.appendChild(shareDelete);
        const shareInfo = document.createElement("span");
        if (share.maxDownloads > 0)
            shareInfo.innerText = `D|${share.downloads}/${share.maxDownloads}`;
        else shareInfo.innerText = `D|${share.downloads}`;
        if (share.expiryDate > 0) {
            const remaining = Math.max(0, share.expiryDate - Date.now());
            if (remaining >= 3600_000)
                shareInfo.innerText += ` R|${Math.round(remaining/3600_000)}h`;
            else shareInfo.innerText += ` R|${Math.round(remaining/1000)}s`;
        }
        shareListItem.appendChild(shareInfo);
        const shareURL = document.createElement("a");
        shareURL.id = share.id;
        shareURL.href = `${location.origin}/share/${share.id}`;
        shareURL.innerText = share.path;
        shareURL.classList.add("share");
        shareListItem.appendChild(shareURL);
        sharesList.appendChild(shareListItem);
    }
}

/** @type {HTMLLIElement} */
let SelectedFolder;
function LoadFSFromDirTree(rootList, dirTree, path = "", sorted = true) {
    rootList.innerHTML = "";
    rootList.setAttribute("path", path);
    let hasFiles = false;
    const entries = Object.entries(dirTree);
    if (sorted) {
        entries.sort((a, b) => {
            const aIsFile = Array.isArray(a[1]);
            const bIsFile = Array.isArray(b[1]);
            if (aIsFile === bIsFile)
                return a[0].localeCompare(b[0]);
            return aIsFile && !bIsFile ? 1 : 0;
        });
    }
    for (const [name, data] of entries) {
        hasFiles = true;
        const entryPath = path + name;
        const entryHolder = document.createElement("li");
        if (path.length > 0) {
            const shareButton = document.createElement("button");
            shareButton.classList.add("share");
            shareButton.innerText = "S";
            shareButton.addEventListener("click", async ev => {
                let extraParams = "";
                if (!ev.shiftKey) {
                    const maxDownloads = window.prompt("Max Downloads:", 0);
                    if (!maxDownloads) return;
                    const maxAge = window.prompt("Max Age (ms):", 0);
                    if (!maxAge) return;
                    extraParams = `&maxDownloads=${encodeURIComponent(maxDownloads)}&maxAge=${encodeURIComponent(maxAge)}`;
                }

                const res = await fetch("/api/share", {
                    "credentials": "include",
                    "method": "POST",
                    "headers": { "Content-Type": "application/x-www-form-urlencoded" },
                    "body": `path=${encodeURIComponent(entryPath)}${extraParams}`
                });
                if (!res.ok)
                    window.alert(await res.text());
                await ReloadShares();
            });
            
            const deleteButton = document.createElement("button");
            deleteButton.classList.add("delete");
            deleteButton.innerText = "X";
            deleteButton.addEventListener("click", async () => {
                const res = await fetch("/api/files", {
                    "credentials": "include",
                    "method": "DELETE",
                    "headers": { "Content-Type": "application/x-www-form-urlencoded" },
                    "body": `path=${encodeURIComponent(entryPath)}`
                });
                if (res.ok) {
                    const parent = entryHolder.parentElement;
                    if (SelectedFolder && (entryHolder === SelectedFolder || entryHolder.contains(SelectedFolder))) {
                        SelectedFolder = parent.parentElement; // The root node can't be deleted so this should be safe
                        SelectedFolder.classList.add("selected");
                    }
                    entryHolder.remove();
                    if (parent.children.length <= 0)
                        parent.innerText = "<EMPTY>";
                }
                else window.alert(await res.text());
            });
    
            entryHolder.appendChild(deleteButton);
            entryHolder.appendChild(shareButton);
        }

        if (Array.isArray(data)) {
            entryHolder.classList.add("file");
            const [file] = data;
            const entryName = document.createElement("span");
            const lastModified = new Date(file.lastModified);
            entryName.innerText = `${name} ${file.size}B ${lastModified.toLocaleDateString()} ${lastModified.toLocaleTimeString()}`;
            entryHolder.appendChild(entryName);
        } else {
            const empty = Object.keys(data).length > 0 ? "" : " <EMPTY>";
            const entryChildrenHolder = document.createElement("ul");
            entryChildrenHolder.classList.add("fs-tree", "collapsed");
            const entryName = document.createElement("span");
            entryName.classList.add("directory", "collapsible");
            entryName.innerText = `> ${name}${empty}`;
            entryName.addEventListener("click", () => {
                if (SelectedFolder)
                    SelectedFolder.classList.remove("selected");
                SelectedFolder = entryHolder;
                SelectedFolder.classList.add("selected");
                if (entryChildrenHolder.classList.toggle("collapsed"))
                    entryName.innerText = `> ${name}${empty}`;
                else entryName.innerText = `| ${name}`;
            });
            entryHolder.appendChild(entryName);
            entryHolder.appendChild(entryChildrenHolder);
            LoadFSFromDirTree(entryChildrenHolder, data, entryPath + "/");
        }
        rootList.appendChild(entryHolder);
    }

    if (!hasFiles) {
        const span = document.createElement("span");
        span.innerText = "<EMPTY>";
        rootList.appendChild(span);
    }
}

async function LoadFSFromPath(fsList, path) {
    const res = await fetch(`/api/files?path=${path ?? ""}`, { "credentials": "include" });
    const dirTree = await res.json();
    if (res.ok) {
        if (path)
            LoadFSFromDirTree(fsList, dirTree, path);
        else LoadFSFromDirTree(fsList, { "/": dirTree });
    }
    else window.alert(await res.text());
}

/** @param {FileList} fileList */
async function UploadFiles(fileList) {
    const uploads = [];
    for (const file of fileList) {
        let basePath = "/";
        if (SelectedFolder) {
            const targetFolder = SelectedFolder.querySelector("ul");
            if (targetFolder) {
                const targetPath = targetFolder.getAttribute("path");
                if (targetPath) basePath = targetPath;
            }
        }

        uploads.push(new Promise(((res, rej) => {
            const data = new FormData();
            data.append(
                "path",
                file.webkitRelativePath.length > 0
                    ? `${basePath}/${file.webkitRelativePath}`
                    : `${basePath}/${file.name}`
            );
            data.append("file", file);

            const req = new XMLHttpRequest();
            req.addEventListener("loadend", res);
            req.addEventListener("abort", rej);
            req.addEventListener("error", rej);
            req.open("POST", "/api/files/upload");
            req.send(data);
        })));
    }
    return Promise.all(uploads);
}

/** @param {HTMLInputElement} inputFile */
async function UploadInputFile(inputFile) {
    await UploadFiles(inputFile.files);
    if (SelectedFolder) {
        const modifiedFolder = SelectedFolder.querySelector("ul");
        if (modifiedFolder) {
            const path = modifiedFolder.getAttribute("path");
            await LoadFSFromPath(modifiedFolder, path)
        } else await ReloadFS();
    } else await ReloadFS();
}

window.addEventListener("load", async () => {
    await ReloadShares();
    await ReloadFS();
    const profReq = await fetch("/api/profile");
    const profile = await profReq.json();
    const adminPanel = document.getElementById("admin-panel");
    if (profile.isAdmin)
        adminPanel.classList.remove("collapsed");
});
