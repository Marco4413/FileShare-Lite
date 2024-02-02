import fs from "node:fs";

import mustache from "mustache";

declare global {
    namespace Mustache {
        interface Writer {
            templateCache?: mustache.TemplateCache;
        }
    }
}

type CacheEntry = {
    lastModified: number,
    template: any
};

export default (forceCache: boolean) => {
    const templateCache: Record<string, CacheEntry> = {};
    const writer = new mustache.Writer();
    writer.templateCache = undefined;

    return function(path: string, options: any, cb: (e: any, rendered?: string | undefined) => void) {
        fs.stat(path, (err, stats) => {
            if (err) {
                cb(err);
                return;
            }

            if (templateCache[path]) {
                const cacheEntry = templateCache[path];
                if (stats.mtimeMs <= cacheEntry.lastModified) {
                    const rendered = writer.renderTokens(cacheEntry.template, new mustache.Context(options), undefined);
                    cb(null, rendered);
                }
            }

            if (!stats.isFile()) {
                cb(new Error("View does not exist."));
                return;
            }

            fs.readFile(path, { "encoding": "utf8" }, (err, data) => {
                if (err) {
                    cb(err);
                    return;
                }
    
                const template = writer.parse(data);
                if (forceCache || options.cache)
                    templateCache[path] = { "lastModified": stats.mtimeMs, template };
                const rendered = writer.renderTokens(template, new mustache.Context(options), undefined);
                cb(null, rendered);
            });
        });
    };
}
