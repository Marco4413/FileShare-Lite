import fs from "node:fs/promises";
import path from "node:path";

import archiver from "archiver";
import express from "express";

export type File = {
    size: number,
    createdAt: number,
    lastModified: number
};

export type Directory = { [index: string]: [File]|Directory|null };

export async function DirectoryToJSON(basePath: string, depth: number = -1): Promise<Directory|null> {
    if (depth === 0) return null;
    const dir: Directory = {};
    for (const file of await fs.readdir(basePath)) {
        const stat = await fs.stat(path.join(basePath, file));
        if (stat.isFile()) {
            dir[file] = [{
                "size": stat.size,
                "createdAt": stat.ctimeMs,
                "lastModified": stat.mtimeMs
            }];
        } else if (stat.isDirectory()) {
            dir[file] = await DirectoryToJSON(path.join(basePath, file), depth-1);
        }
    }
    return dir;
}

/**
 * Retrieves the size of the folder in MB.
 * @param path The path to the directory.
 * @returns < 0 if any error occurred. >= 0 the size of the folder in MB.
 */
export async function DirectorySize(dirPath: string): Promise<number> {
    let folderSize = 0;
    const files = (await fs.readdir(dirPath))
        .map(fileName => path.join(dirPath, fileName));
    while (files.length > 0) {
        const filePath = files.pop() as string;
        const fileStat = await fs.stat(filePath);
        if (fileStat.isDirectory()) {
            for (const fileName of await fs.readdir(filePath))
                files.push(path.join(filePath, fileName));
        } else if (fileStat.isFile()) {
            folderSize += fileStat.size/1e6;
        } else {
            return -1;
        }
    }
    return folderSize;
}

export function TrimLeadingSlashes(str: string): string {
    return str.replace(/^[\/\\]*(.*)/g, "$1")
}

export function ToSharePath(pt: string): string {
    return path.posix.normalize(TrimLeadingSlashes(pt));
}

export enum DownloadResult { Downloaded, InvalidFileType };
export async function DownloadPath(res: express.Response, pt: string, compressionLevel: number = 0, onDownload?: () => Promise<void>): Promise<DownloadResult> {
    const stat = await fs.stat(pt);
    if (stat.isDirectory()) {
        if (onDownload) onDownload();
        const dirName = path.basename(pt);
        res.attachment(`${dirName}.zip`);
        const archive = archiver("zip", { "zlib": { "level": compressionLevel } })
            .directory(pt, path.basename(dirName));
        archive.pipe(res);
        await archive.finalize();
        return DownloadResult.Downloaded;
    } else if (stat.isFile()) {
        if (onDownload) onDownload();
        res.download(pt);
        return DownloadResult.Downloaded;
    }
    return DownloadResult.InvalidFileType;
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
