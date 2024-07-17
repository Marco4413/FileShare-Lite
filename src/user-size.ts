import fs from "node:fs";
import path from "node:path";

import Config from "./config";
import { DirectorySize } from "./utils";

type CachedUserSize = {
    usedStorage: number,
    lastUpdatedAt: number
};

const _MAX_CACHE_TIME = Config.storageCacheTimeout ?? 60e3;
const _UserSizeCache: Record<string, CachedUserSize> = {};

export async function GetUserSize(userId: string, invalidateCache: boolean = false): Promise<number> {
    if (!invalidateCache) {
        const cachedValue = _UserSizeCache[userId];
        if (cachedValue) {
            const now = performance.now();
            if (now <= cachedValue.lastUpdatedAt+_MAX_CACHE_TIME)
                return cachedValue.usedStorage;
        }
    }

    const fullPath = path.resolve("data/uploads", userId);
    if (!fs.existsSync(fullPath))
        return -1;

    const usedStorage = await DirectorySize(fullPath);
    if (usedStorage < 0)
        return usedStorage;

    _UserSizeCache[userId] = {
        usedStorage,
        lastUpdatedAt: performance.now()
    };
    
    return usedStorage;
}
