let PermsTable;

async function ReloadUsers() {
    /** @type {HTMLUListElement} */
    const usersTable = document.getElementById("users");
    await LoadUsers(usersTable);
}

function WrapWithTD(content) {
    const td = document.createElement("td");
    if (content instanceof HTMLElement)
        td.appendChild(content);
    else td.innerText = content;
    return td;
}

function AddEnterKeyPressListener(input, listener) {
    input.addEventListener("keypress", ev => {
        if (ev.key === "Enter")
            listener(ev);
    });
}

/** @param {HTMLTableSectionElement} usersTable */
async function LoadUsers(usersTable) {
    const permsSelUserId = PermsTable.GetUID();
    PermsTable.Set(null);

    const res = await FetchWLoading("/api/admin/users", { "credentials": "include" })
    usersTable.innerHTML = "";
    const users = await res.json();
    users.sort((a, b) => {
        if (a.isAdmin === b.isAdmin)
            return a.username.localeCompare(b.username);
        return a.isAdmin && !b.isAdmin ? 0 : 1;
    });

    for (const user of users) {
        if (user.id === permsSelUserId)
            PermsTable.Set(user.permissions, user.id);

        const userRow = document.createElement("tr");
        const updateBtn = document.createElement("button");

        const idTd = document.createElement("td");
        idTd.innerText = user.id;

        const unameInp = document.createElement("input");
        unameInp.type = "text";
        unameInp.value = user.username;
        unameInp.placeholder = "Username";
        AddEnterKeyPressListener(unameInp, () => updateBtn.click());

        const passwInp = document.createElement("input");
        passwInp.type = "password";
        passwInp.placeholder = "Password";
        AddEnterKeyPressListener(passwInp, () => updateBtn.click());

        const permsBtn = document.createElement("button");
        permsBtn.innerText = "Edit";
        permsBtn.addEventListener("click", async () => {
            console.log(PermsTable.GetUID() === user.id);
            if (PermsTable.GetUID() === user.id)
                PermsTable.Set(null);
            else PermsTable.Set(user.permissions, user.id);
        });

        const adminInp = document.createElement("input");
        adminInp.type = "checkbox";
        adminInp.checked = user.isAdmin;

        updateBtn.innerText = "Update";
        updateBtn.addEventListener("click", async () => {
            let extraParams = "";
            if (unameInp.value !== user.username)
                extraParams += `&uname=${encodeURIComponent(unameInp.value)}`;
            if (passwInp.value.length > 0)
                extraParams += `&passw=${encodeURIComponent(passwInp.value)}`;
            if (PermsTable.GetUID() === user.id)
                extraParams += `&perms=${encodeURIComponent(PermsTable.Get())}`;
            if (adminInp.checked !== user.isAdmin)
                extraParams += `&admin=${encodeURIComponent(adminInp.checked ? "true" : "false")}`;
            const res = await FetchWLoading("/api/admin/users", {
                "credentials": "include",
                "method": "PATCH",
                "headers": { "Content-Type": "application/x-www-form-urlencoded" },
                "body": `id=${encodeURIComponent(user.id)}${extraParams}`
            });
            if (!res.ok)
                window.alert(await res.text());
            await ReloadUsers();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.innerText = "Delete";
        deleteBtn.addEventListener("click", async () => {
            const res = await FetchWLoading("/api/admin/users", {
                "credentials": "include",
                "method": "DELETE",
                "headers": { "Content-Type": "application/x-www-form-urlencoded" },
                "body": `id=${encodeURIComponent(user.id)}`
            });
            if (!res.ok)
                window.alert(await res.text());
            await ReloadUsers();
        });

        userRow.appendChild(idTd);
        userRow.appendChild(WrapWithTD(unameInp));
        userRow.appendChild(WrapWithTD(passwInp));
        userRow.appendChild(WrapWithTD(permsBtn));
        userRow.appendChild(WrapWithTD(adminInp));
        userRow.appendChild(WrapWithTD(updateBtn));
        userRow.appendChild(WrapWithTD(deleteBtn));
        usersTable.appendChild(userRow);
    }
    {
        const userRow = document.createElement("tr");
        const createBtn = document.createElement("button");

        const idTd = document.createElement("td");

        const unameInp = document.createElement("input");
        unameInp.type = "text";
        unameInp.placeholder = "Username";
        AddEnterKeyPressListener(unameInp, () => createBtn.click());

        const passwInp = document.createElement("input");
        passwInp.type = "password";
        passwInp.placeholder = "Password";
        AddEnterKeyPressListener(passwInp, () => createBtn.click());

        const padTd = document.createElement("td");
        padTd.colSpan = 2;

        createBtn.innerText = "Create";
        createBtn.addEventListener("click", async () => {
            if (unameInp.value.length > 0 && passwInp.value.length > 0) {
                const res = await FetchWLoading("/api/admin/users", {
                    "credentials": "include",
                    "method": "POST",
                    "headers": { "Content-Type": "application/x-www-form-urlencoded" },
                    "body": `uname=${encodeURIComponent(unameInp.value)}&passw=${encodeURIComponent(passwInp.value)}`
                });
                if (res.ok) {
                    await ReloadUsers();
                    return;
                }
                window.alert(await res.text());
            }
            window.alert("Username and/or password not provided.");
        });

        userRow.appendChild(idTd);
        userRow.appendChild(WrapWithTD(unameInp));
        userRow.appendChild(WrapWithTD(passwInp));
        userRow.appendChild(padTd);
        userRow.appendChild(WrapWithTD(createBtn));
        usersTable.appendChild(userRow);
    }
}

class EditPermsTable {
    /** @param {HTMLTableElement} tbl */
    constructor(tbl) {
        tbl.innerHTML = "";

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        thead.appendChild(headRow);
        tbl.appendChild(thead);

        const tbody = document.createElement("tbody");
        const bodyRow = document.createElement("tr");
        tbody.appendChild(bodyRow);
        tbl.appendChild(tbody);

        const uidCaption = document.createElement("td");
        uidCaption.innerText = "User ID";
        headRow.appendChild(uidCaption);
        const uidLabel = document.createElement("td");
        bodyRow.appendChild(uidLabel);

        const permInputs = [];
        for (const [name, perm] of Object.entries(Permissions)) {
            const caption = document.createElement("td");
            caption.innerText = name;
            headRow.appendChild(caption);

            const check = document.createElement("input");
            check.type = "checkbox";
            bodyRow.appendChild(WrapWithTD(check));
            permInputs.push({ check, perm });
        }

        this.GetUID = function () { return tbl.getAttribute("uid"); };
        this.Get = function () {
            let perms = Permissions_None;
            for (const inp of permInputs) {
                if (inp.check.checked)
                    perms |= inp.perm;
            }
            return perms;
        };
        this.Set = function (perms, uid) {
            if (tbl.classList.toggle("collapsed", perms == null)) {
                tbl.removeAttribute("uid");
                uidLabel.innerText = "none";
                return;
            }

            tbl.setAttribute("uid", uid);
            uidLabel.innerText = uid;
            for (const inp of permInputs)
                inp.check.checked = HasPermissions(perms, inp.perm);
        };
    }
}

window.addEventListener("load", async () => {
    PermsTable = new EditPermsTable(document.getElementById("edit-perms"));
    await ReloadUsers();
});
