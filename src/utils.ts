import fs from "node:fs";
import path from "node:path";

import archiver from "archiver";
import express from "express";

export type File = {
    size: number,
    createdAt: number,
    lastModified: number
};

export type Directory = { [index: string]: [File]|Directory|null };

export function DirectoryToJSON(basePath: string, depth: number = -1): Directory|null {
    if (depth === 0) return null;
    const dir: Directory = {};
    for (const file of fs.readdirSync(basePath)) {
        const stat = fs.statSync(path.join(basePath, file));
        if (stat.isFile()) {
            dir[file] = [{
                "size": stat.size,
                "createdAt": stat.ctimeMs,
                "lastModified": stat.mtimeMs
            }];
        } else if (stat.isDirectory()) {
            dir[file] = DirectoryToJSON(path.join(basePath, file), depth-1);
        }
    }
    return dir;
}

export function TrimLeadingSlashes(str: string): string {
    return str.replace(/^[\/\\]*(.*)/g, "$1")
}

export function ToSharePath(pt: string): string {
    return path.posix.normalize(TrimLeadingSlashes(pt));
}

export enum DownloadResult { Downloaded, InvalidFileType };
export function DownloadPath(res: express.Response, pt: string, onDownload?: () => Promise<void>): Promise<DownloadResult> {
    return new Promise<DownloadResult>((resolve, reject) => {
        fs.stat(pt, async (err, stat) => {
            if (err) {
                reject(err);
            } else if (stat.isDirectory()) {
                if (onDownload) onDownload();
                const dirName = path.basename(pt);
                res.attachment(`${dirName}.zip`);
                const archive = archiver("zip", { "zlib": { "level": 0 } })
                    .directory(pt, path.basename(dirName));
                archive.pipe(res);
                await archive.finalize();
                resolve(DownloadResult.Downloaded);
            } else if (stat.isFile()) {
                if (onDownload) onDownload();
                res.download(pt);
                resolve(DownloadResult.Downloaded);
            } else {
                resolve(DownloadResult.InvalidFileType);
            }
        });
    });
}

export async function JustRender(res: express.Response, view: string, options?: object) {
    return new Promise<void>((resolve, reject) => {
        res.render(view, options, (err, html) => {
            if (err) {
                res.sendStatus(500);
                reject(err);
                return;
            }
            res.write(html);
            res.end();
            resolve();
        });
    });
}
