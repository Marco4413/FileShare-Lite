import fs from "node:fs";
import path from "node:path";

import archiver from "archiver";
import express from "express";

export type File = {
    size: number,
    createdAt: number,
    lastModified: number
};

export type Directory = { [index: string]: [File]|Directory };

export function DirectoryToJSON(basePath: string): Directory {
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
            dir[file] = DirectoryToJSON(path.join(basePath, file));
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
                res.status(404).send("Invalid file type.");
                resolve(DownloadResult.InvalidFileType);
            }
        });
    });
}
