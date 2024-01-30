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
    const res = await FetchWLoading("/api/admin/users", { "credentials": "include" })
    usersTable.innerHTML = "";
    const users = await res.json();
    for (const user of users) {
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

        const adminTd = document.createElement("td");

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
        userRow.appendChild(WrapWithTD(adminTd));
        userRow.appendChild(WrapWithTD(createBtn));
        usersTable.appendChild(userRow);
    }
}

window.addEventListener("load", () => {
    ReloadUsers();
});
