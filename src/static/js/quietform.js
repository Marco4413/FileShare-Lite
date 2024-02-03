/* MIT Copyright (c) 2024 [Marco4413](https://github.com/Marco4413) */

function GetURLEncodedForm(form) {
    const data = new FormData(form);
    let urlencoded = "";
    data.forEach((v, k) => urlencoded += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return urlencoded.substring(1);
}

/** @param {HTMLFormElement} form */
function QuietForm(form) {
    form.classList.add("quietform");
    form.addEventListener("submit", ev => {
        ev.preventDefault();
        let action = form.action;
        let method = form.getAttribute("_method") ?? form.method;
        let okredirect = form.getAttribute("okredirect");
        let noValidate = form.noValidate;

        if (ev.submitter) {
            /** @type {HTMLInputElement} */
            const input = ev.submitter;
            const sokredirect = input.getAttribute("okredirect");
            if (sokredirect) okredirect = sokredirect;

            const sformmethod = input.getAttribute("_formmethod") ?? input.formMethod;
            if (sformmethod.length > 0) method = sformmethod;
            
            if (input.formAction) action = input.formAction;
            noValidate = noValidate || input.formNoValidate;
        }

        if (!noValidate && !form.reportValidity())
            return;

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
