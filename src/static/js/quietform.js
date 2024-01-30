/* MIT Copyright (c) 2024 [Marco4413](https://github.com/Marco4413) */

function GetURLEncodedForm(form) {
    const data = new FormData(form);
    let urlencoded = "";
    data.forEach((v, k) => urlencoded += `&${encodeURI(k)}=${encodeURIComponent(v)}`);
    return urlencoded.substring(1);
}

/** @param {HTMLFormElement} form */
function QuietForm(form) {
    form.classList.add("quietform");
    form.addEventListener("submit", ev => {
        ev.preventDefault();
        if (!form.reportValidity())
            return;
        let action = form.action;
        let okredirect = form.getAttribute("okredirect");
        if (ev.submitter) {
            const formaction = ev.submitter.getAttribute("formaction");
            if (formaction)
                action = formaction;
            const sokredirect = ev.submitter.getAttribute("okredirect");
            if (sokredirect)
                okredirect = sokredirect;
        }
        const method = form.getAttribute("_method") ?? form.method;
        fetch(action, {
            "credentials": "same-origin",
            "method": method.toUpperCase(),
            "headers": { "Content-Type": "application/x-www-form-urlencoded" },
            "body": GetURLEncodedForm(form)
        }).then(async res => {
            if (res.ok) {
                if (okredirect)
                    window.location.href = okredirect;
            } else window.alert(await res.text());
            form.reset();
        });
    });
}

window.addEventListener("load", () => {
    document.querySelectorAll(".quietform")
        .forEach(QuietForm);
});
