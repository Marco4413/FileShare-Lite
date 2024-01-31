function WrapWithTD(content) {
    const td = document.createElement("td");
    if (content instanceof HTMLElement)
        td.appendChild(content);
    else td.innerText = content;
    return td;
}

async function ReloadShares() {
    /** @type {HTMLTableElement} */
    const sharesTable = document.getElementById("shares");
    await LoadShares(sharesTable);
}

async function ReloadFS() {
    /** @type {HTMLUListElement} */
    const fsList = document.getElementById("fs");
    await LoadFSFromPath(fsList);
}

/** @param {HTMLTableElement} sharesTable */
async function LoadShares(sharesTable) {
    const res = await FetchWLoading("/api/share/all", { "credentials": "include" })
    sharesTable.innerHTML = "";
    const shares = await res.json();
    for (const share of shares) {
        const shareRow = document.createElement("tr");
        shareRow.classList.add("share-item");

        const shareDelete = document.createElement("button");
        shareDelete.classList.add("delete");
        shareDelete.innerText = "X";
        shareDelete.addEventListener("click", async () => {
            const res = await FetchWLoading(`/api/share/${share.id}`, { "method": "DELETE", "credentials": "include" });
            if (!res.ok)
                window.alert(await res.text());
            LoadShares(sharesTable);
        });
        shareRow.appendChild(WrapWithTD(shareDelete));

        const shareInfo = document.createElement("div");
        shareInfo.classList.add("share-info");

        const shareInfoDownloads = document.createElement("div")
        if (share.maxDownloads > 0) {
            shareInfoDownloads.innerText = `D|${share.downloads}/${share.maxDownloads}`;
        } else shareInfoDownloads.innerText = `D|${share.downloads}`;
        shareInfo.appendChild(shareInfoDownloads);

        if (share.expiryDate > 0) {
            const shareInfoRemaining = document.createElement("div");
            const updateRemainingTime = () => {
                let desiredTimeout = 0;
                const remaining = Math.max(0, share.expiryDate - Date.now());
                if (remaining >= 3600_000) {
                    shareInfoRemaining.innerText = `R|${Math.ceil(remaining/3600_000)}h`;
                    desiredTimeout = Math.min(remaining - 3600_000, 3600_000);
                } else if (remaining >= 60_000) {
                    shareInfoRemaining.innerText = `R|${Math.ceil(remaining/180_000)}min`;
                    desiredTimeout = Math.min(remaining - 60_000, 30_000);
                } else if (remaining > 0) {
                    shareInfoRemaining.innerText = `R|${Math.ceil(remaining/1000)}s`;
                    desiredTimeout = 1_000;
                } else shareInfoRemaining.innerText = "[EXPIRED]";
                if (shareInfoRemaining.isConnected && desiredTimeout > 0)
                    return setTimeout(updateRemainingTime, desiredTimeout);
                return null;
            };
            // The first call to `updateRemainingTime` should not create any timer
            //   since `shareInfoRemaining` is not connected to the DOM.
            if (!updateRemainingTime())
                // 5 seconds is overkill, but it was chosen just to be sure.
                setTimeout(updateRemainingTime, 5_000);
            shareInfo.appendChild(shareInfoRemaining);
        }

        shareRow.appendChild(WrapWithTD(shareInfo));
        const shareURL = document.createElement("a");
        shareURL.id = share.id;
        shareURL.href = `${location.origin}/share/${share.id}`;
        shareURL.target = "_blank";
        shareURL.innerText = share.path;
        shareURL.classList.add("share");
        shareRow.appendChild(WrapWithTD(shareURL));
        sharesTable.appendChild(shareRow);
    }
}

/** @type {HTMLLIElement} */
let SelectedFolder;
function LoadFSFromDirTree(rootList, dirTree, path = "", sorted = true) {
    rootList.innerHTML = "";
    rootList.setAttribute("path", path);
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

    const isRoot = !(path.length > 0);
    for (const [name, data] of entries) {
        const entryPath = path + name;
        const entryHolder = document.createElement("li");

        const entryControls = document.createElement("div");
        entryControls.classList.add("entry-controls");

        const entryHead = document.createElement("div");
        entryHead.classList.add("entry-head");
        
        entryHead.appendChild(entryControls);
        entryHolder.appendChild(entryHead);
        rootList.appendChild(entryHolder);

        if (!isRoot) {
            const shareButton = document.createElement("button");
            shareButton.classList.add("share");
            shareButton.addEventListener("click", async ev => {
                let extraParams = "";
                if (!ev.shiftKey) {
                    const maxDownloads = window.prompt("Max Downloads:", 0);
                    if (!maxDownloads) return;
                    const maxAgeStr = window.prompt("Max Age (s):", 0);
                    if (!maxAgeStr) return;
                    const maxAge = Number.parseFloat(maxAgeStr) * 1000;
                    extraParams = `&maxDownloads=${encodeURIComponent(maxDownloads)}&maxAge=${encodeURIComponent(maxAge.toString())}`;
                }

                const res = await FetchWLoading("/api/share", {
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
                const res = await FetchWLoading("/api/files", {
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
                }
                else window.alert(await res.text());
            });
    
            entryControls.appendChild(deleteButton);
            entryControls.appendChild(shareButton);
        }

        const entryName = document.createElement(isRoot ? "span" : "a");
        entryName.classList.add("entry-name");
        entryName.innerText = name;
        if (!isRoot) {
            entryName.href = `/api/files/download?path=${encodeURIComponent(path + name)}`;
            entryName.target = "_blank";
        }
        entryHead.appendChild(entryName);

        if (Array.isArray(data)) {
            entryHolder.classList.add("file");
            const [file] = data;
            const lastModified = new Date(file.lastModified);
            const entryInfo = document.createElement("span");
            entryInfo.classList.add("entry-info");
            entryInfo.innerText = ` ${file.size}B ${lastModified.toLocaleDateString()} ${lastModified.toLocaleTimeString()}`;
            entryHead.appendChild(entryInfo);
        } else {
            entryHolder.classList.add("directory");
            entryHolder.addEventListener("click", ev => {
                ev.stopPropagation();
                if (SelectedFolder)
                    SelectedFolder.classList.remove("selected");
                SelectedFolder = entryHolder;
                SelectedFolder.classList.add("selected");
            });

            const entryChildrenHolder = document.createElement("ul");
            entryChildrenHolder.classList.add("fs-tree", "collapsed");

            const entryExpander = document.createElement("button");
            entryExpander.classList.add("collapsible", "control");
            entryExpander.innerText = ">";
            entryExpander.addEventListener("click", () => {
                if (entryChildrenHolder.classList.toggle("collapsed"))
                    entryExpander.innerText = ">";
                else entryExpander.innerText = "|";
            });

            entryControls.appendChild(entryExpander);
            entryHolder.appendChild(entryChildrenHolder);
            LoadFSFromDirTree(entryChildrenHolder, data, entryPath + "/");
        }
    }
}

async function LoadFSFromPath(fsList, path) {
    const res = await FetchWLoading(`/api/files?path=${path ?? ""}`, { "credentials": "include" });
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
            req.addEventListener("loadend", () => {
                if (req.status < 200 || req.status > 299)
                    rej(req.responseText);
                else res();
            });
            req.addEventListener("abort", rej);
            req.addEventListener("error", rej);
            req.open("POST", "/api/files/upload");
            req.send(data);
        })));
    }
    return StartLoadingAttachedToPromise(Promise.all(uploads).catch(err => window.alert(err)));
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

    const profReq = await FetchWLoading("/api/profile");
    const profile = await profReq.json();

    const adminPanel = document.getElementById("admin-panel");
    if (profile.isAdmin)
        adminPanel.classList.remove("hidden");

    const changePassword = document.getElementById("change-password");
    if (HasPermissions(profile.permissions, Permissions_ChangePassword, profile.isAdmin))
        changePassword.classList.remove("hidden");
});
