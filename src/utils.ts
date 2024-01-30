import fs from "node:fs";
import path from "node:path";

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
