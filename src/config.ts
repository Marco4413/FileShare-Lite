import fs from "node:fs";

import uuid from "short-uuid";

const UUID = uuid();

function ShuffleArray(array: any[]) {
    const shuffled: any[] = [];
    while (array.length > 0) {
        shuffled.push(array.splice(
            Math.round(Math.random() * (array.length-1)), 1
        )[0]);
    }
    return shuffled;
}

export type Config = {
    admin?: {
        username: string,
        password: string
    },
    cookieSecrets: string[],
    port: number,
    key?: string,
    cert?: string,
    downloadCompressionLevel: number,
    maxFilesGetDepth: number,
    rmdirDelay: number,
    storageCacheTimeout: number
};

export function GetDefaultConfig(): Config {
    return {
        "admin": { "username": "admin", "password": UUID.generate() },
        "cookieSecrets": new Array("","","","","").map(() => UUID.generate() as string),
        "port": 443,
        "key": "data/private.key",
        "cert": "data/certificate.crt",
        "downloadCompressionLevel": 0,
        "maxFilesGetDepth": -1,
        "rmdirDelay": 5e3,
        "storageCacheTimeout": 60e3
    };
}

export function GetOrCreateConfig(): Config {
    try {
        const configText = fs.readFileSync("data/config.json", { "encoding": "utf8" });
        const config = JSON.parse(configText) as Config;
        config.cookieSecrets = ShuffleArray(config.cookieSecrets);
        return config;
    } catch (error) {
        const config = GetDefaultConfig();
        fs.writeFileSync("data/config.json", JSON.stringify(config, null, 4), { "encoding": "utf8" });
        return config;
    }
}

export default GetOrCreateConfig();
