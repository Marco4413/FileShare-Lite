/* MIT Copyright (c) 2024 [Marco4413](https://github.com/Marco4413) */

let _Loads = 0;
function LoadingStart() {
    if (_Loads++ > 0)
        return;
    const loading = document.getElementById("loading");
    if (!loading) {
        console.warn("No #loading element found.");
        return;
    }
    loading.classList.add("visible");
}

function LoadingEnd() {
    if (--_Loads > 0)
        return;
    const loading = document.getElementById("loading");
    if (!loading) {
        console.warn("No #loading element found.");
        return;
    }
    loading.classList.remove("visible");
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
function StartLoadingAttachedToPromise(promise) {
    LoadingStart();
    promise.then(LoadingEnd).catch(LoadingEnd);
    return promise;
}

/**
 * @param {string|URL|Request} input
 * @param {Request} [init]
 * @returns {Promise<Response>}
 */
function FetchWLoading(input, init) {
    return StartLoadingAttachedToPromise(fetch(input, init));
}
