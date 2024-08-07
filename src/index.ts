import fs from "node:fs";
import https from "node:https";
import path from "node:path";

import cookieparser from "cookie-parser";
import express from "express";
import multer from "multer";

import Config from "./config";
import * as Database from "./database";
import Logger from "./logger";
import * as Permissions from "./permissions";
import { Session, Admin } from "./session";
import { GetUserSize } from "./user";
import { DirectoryToJSON, DownloadPath, DownloadResult, JustRender, ToSharePath, TrimLeadingSlashes } from "./utils";
import Views from "./views";

(async () => {
    if (Config.admin)
        await Database.CreateUser(Config.admin.username, Config.admin.password, true);
})();

const UploadUserFile = multer({
    "storage": multer.diskStorage({
        "destination": async (req, file, cb) => {
            if (!req.user) {
                cb(new Error("Invalid user."), "");
                return;
            } else if (!req.body.path) {
                cb(new Error("No path provided."), "");
                return;
            }

            const basePath = path.resolve("data/uploads");
            const fullPath = path.resolve(basePath, req.user.id, TrimLeadingSlashes(req.body.path));
            const dirPath = path.dirname(fullPath);
            if (!dirPath.startsWith(basePath)) {
                cb(new Error("Trying to create folder outside of sandbox."), "");
                return;
            }

            // If the user uploads a lot of files this is bad
            // TODO: Find some better solution.
            if (req.user.maxStorage >= 0 && await GetUserSize(req.user.id, true) >= req.user.maxStorage) {
                cb(new Error(`User has exceeded its storage.`), "");
                return;
            }

            fs.mkdir(dirPath, { "recursive": true }, err => {
                if (err)
                    cb(err, "");
                else cb(null, dirPath);
            });
        },
        "filename": (req, file, cb) => {
            cb(null, file.originalname);
        }
    }),
    "preservePath": false // It is provided as part of req.body.path
});

const App = express();
App.engine("html", Views(true));
App.set("view engine", "html");
App.set('views', path.join(__dirname, "views"));
App.use(express.urlencoded({"extended": true}),
        cookieparser(Config.cookieSecrets));
App.use("/api", Session());
App.use("/dashboard", Session("/login"));
App.use("/api/admin", Admin());
App.use("/dashboard/admin", Admin("/dashboard"));
App.use(express.static(path.join(__dirname, "static"), { "fallthrough": true }));

App.post("/login", async (req, res) => {
    if (!(
        req.body &&
        req.body.uname &&
        req.body.passw &&
        await Database.MatchUserCredentials(req.body.uname, req.body.passw)
    )) {
        res.status(403).send("Invalid credentials.");
        return;
    }

    const maxAge = 24 * 3600 * 1000;
    const sessionId = await Database.GenerateUserSessionId(req.body.uname, maxAge);
    res.cookie("sessionId", sessionId, { maxAge, "signed": true, "secure": true, "sameSite": "strict" });
    res.sendStatus(200);
});

App.get("/logout", (req, res) => {
    res.clearCookie("sessionId", { "sameSite": "strict" });
    res.redirect("/login");
});

App.post("/logout", (req, res) => {
    res.clearCookie("sessionId", { "sameSite": "strict" });
    res.sendStatus(200);
});

App.get("/api/admin/users", async (req, res) => {
    const users = await Database.GetAllUsers();
    if (req.query.includeStorage === "true") {
        res.send(await Promise.all(users.map(async user => {
            (user as any).usedStorage = await GetUserSize(user.id, false);
            return user;
        })));
        return;
    }

    res.send(users);
});

App.post("/api/admin/users", async (req, res) => {
    if (!(req.body.uname && req.body.passw)) {
        res.status(400).send("No credentials provided.");
        return;
    } else if (await Database.HasUserByUsername(req.body.uname)) {
        res.status(400).send("Username already taken.");
        return;
    }

    const userId = await Database.CreateUser(req.body.uname, req.body.passw, false, -1);
    if (!userId) {
        res.sendStatus(500);
        return;
    }

    res.status(200).send(userId);
});

App.patch("/api/admin/users", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    } else if (!req.body.id) {
        res.status(400).send("No id provided.");
        return;
    } else if (req.body.id === req.user.id) {
        res.status(400).send("Can't edit yourself.");
        return;
    } else if (req.body.uname && await Database.HasUserByUsername(req.body.uname)) {
        res.status(400).send("Username already taken.");
        return;
    }

    if (req.body.perms) {
        const permissions = Number.parseInt(req.body.perms, 10);
        if (!Number.isNaN(permissions))
            await Database.SetUserPermissionsById(req.body.id, permissions);
    }

    if (req.body.admin)
        await Database.SetUserAdminById(req.body.id, req.body.admin === "true");
    if (req.body.uname)
        await Database.SetUserUsernameById(req.body.id, req.body.uname);
    if (req.body.passw)
        await Database.SetUserPasswordById(req.body.id, req.body.passw);
    if (req.body.maxStorage) {
        const maxStorage = Number.parseFloat(req.body.maxStorage);
        if (!Number.isNaN(maxStorage)) {
            await Database.SetUserMaxStorageById(req.body.id, maxStorage);
        }
    }
    res.sendStatus(200);
});

App.delete("/api/admin/users", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    } else if (!req.body.id) {
        res.status(400).send("No id provided.");
        return;
    } else if (req.body.id === req.user.id) {
        res.status(400).send("Can't delete yourself!");
        return;
    }
    await Database.DeleteUserById(req.body.id);
    res.sendStatus(200);
});

App.get("/api/profile", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    }

    res.status(200).send({
        "username": req.user.username,
        "sessionExpiryDate": req.user.sessionExpiryDate,
        "isAdmin": req.user.isAdmin
    });
});

App.get("/api/profile/size", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    }

    res.send({
        "usedStorage": await GetUserSize(req.user.id),
        "maxStorage": req.user.maxStorage
    });
});

App.patch("/api/profile", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    } else if (!Permissions.Has(req.user.permissions, Permissions.ChangePassword, req.user.isAdmin)) {
        res.status(403).send("Missing 'ChangePassword' permission.");
        return;
    } else if (!req.body.passw) {
        res.status(400).send("No password provided.");
        return;
    } else if (!await Database.MatchUserCredentials(req.user.username, req.body.passw)) {
        res.status(403).send("Invalid credentials.");
        return;
    }

    if (req.body.newpassw)
        await Database.SetUserPasswordById(req.user.id, req.body.newpassw);
    res.sendStatus(200);
});

App.get("/api/share/all", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    }

    const shares = await Database.GetUserShares(req.user.username);
    res.send(shares);
});

App.post("/api/share", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    } else if (!Permissions.Has(req.user.permissions, Permissions.CreateShare, req.user.isAdmin)) {
        res.status(403).send("Missing 'CreateShare' permission.");
        return;
    } else if (!req.body.path) {
        res.status(400).send("No path for new share provided.");
        return;
    }

    const sharePath = ToSharePath(req.body.path);
    if (sharePath === ".") {
        res.status(400).send("Can't share user folder.");
        return;
    } else if (await Database.HasShareByPath(req.user.id, sharePath)) {
        res.status(400).send("Share already exists.");
        return;
    }

    let maxDownloads: number|undefined,
        maxAge: number|undefined;
    if (req.body.maxDownloads) {
        maxDownloads = Number.parseFloat(req.body.maxDownloads);
        if (Number.isNaN(maxDownloads) || !Number.isFinite(maxDownloads)) {
            res.status(400).send("Invalid maxDownloads param.");
            return;
        }
    }
    if (req.body.maxAge) {
        maxAge = Number.parseFloat(req.body.maxAge);
        if (Number.isNaN(maxAge) || !Number.isFinite(maxAge)) {
            res.status(400).send("Invalid maxAge param.");
            return;
        }
    }

    const shareId = await Database.CreateUserShare(req.user.username, sharePath, maxDownloads, maxAge ? Date.now()+maxAge : undefined);
    if (!shareId) {
        res.sendStatus(500);
        return;
    }

    res.send(shareId);
});

App.delete("/api/share/:shareid", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    } else if (!Permissions.Has(req.user.permissions, Permissions.DeleteShare, req.user.isAdmin)) {
        res.status(403).send("Missing 'DeleteShare' permission.");
        return;
    }

    const share = await Database.GetShareById(req.params.shareid);
    if (!share) {
        res.status(404).send("Share does not exist.");
    } else if (share.ownerId !== req.user.id) {
        res.status(403).send("Trying to delete another user's share.");
    } else {
        await Database.DeleteShareById(share.id);
        res.sendStatus(200);
    }
});

App.get("/api/files", (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    }

    const fullPath = req.query.path
        ? path.resolve("data/uploads", req.user.id, TrimLeadingSlashes(req.query.path as string))
        : path.resolve("data/uploads", req.user.id);
    fs.mkdir(fullPath, { "recursive": true }, async err => {
        if (err) {
            Logger.Error(err);
            res.sendStatus(500);
            return
        }

        const dir = await DirectoryToJSON(fullPath, Config.maxFilesGetDepth);
        res.send(dir);
    });
});

App.get("/api/files/download", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    } else if (!Permissions.Has(req.user.permissions, Permissions.DownloadFiles, req.user.isAdmin)) {
        res.status(403).send("Missing 'DownloadFiles' permission.");
        return;
    }

    const basePath = path.resolve("data/uploads");
    const userPath = path.resolve(basePath, req.user.id);
    const fullPath = req.query.path
        ? path.resolve(userPath, TrimLeadingSlashes(req.query.path as string))
        : userPath;
    
    if (!fullPath.startsWith(userPath)) {
        res.status(403).send("Invalid path.");
        return;
    } else if (!fs.existsSync(fullPath)) {
        res.status(404).send("File not found.");
        return;
    }

    try {
        await DownloadPath(res, fullPath);
    } catch (err) {
        Logger.Error(err);
        res.sendStatus(500);
    }
});

App.delete("/api/files", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    } else if (!Permissions.Has(req.user.permissions, Permissions.DeleteFiles, req.user.isAdmin)) {
        res.status(403).send("Missing 'DeleteFiles' permission.");
        return;
    } else if (!req.body.path) {
        res.status(400).send("No path provided for file deletion.");
        return;
    }

    const basePath = path.resolve("data/uploads");
    const userPath = path.resolve(basePath, req.user.id);
    const fullPath = path.resolve(userPath, TrimLeadingSlashes(req.body.path));
    if (!fullPath.startsWith(basePath)) {
        res.status(400).send("Invalid path provided.");
        return;
    } else if (fullPath === userPath) {
        res.status(400).send("Can't delete user folder.");
        return;
    } else if (!fs.existsSync(fullPath)) {
        res.status(404).send("Provided path does not exist.");
        return
    }

    fs.stat(fullPath, (err, stats) => {
        if (err) {
            Logger.Error(err);
            res.sendStatus(500);
            return
        }

        if (stats.isDirectory()) {
            Logger.Warn(`DELETING '${fullPath}' in ${Math.floor(Config.rmdirDelay/1000)}s`);
            setTimeout(() => {
                Logger.Warn(`DELETING '${fullPath}'...`);
                fs.rm(fullPath, { "recursive": true, "force": true }, err => {
                    if (err) {
                        Logger.Error(err);
                        res.sendStatus(500);
                        return;
                    }
                    res.sendStatus(200);
                });
            }, Config.rmdirDelay);
        } else if (stats.isFile()) {
            fs.unlink(fullPath, err => {
                if (err) {
                    Logger.Error(err);
                    res.sendStatus(500);
                    return;
                }
                res.sendStatus(200);
            });
        } else res.status(404).send("Provided path does not exist.");
    });
});

App.post("/api/files/upload",
    (req, res, next) => {
        if (!req.user) {
            res.sendStatus(500);
            return;
        } else if (!Permissions.Has(req.user.permissions, Permissions.UploadFiles, req.user.isAdmin)) {
            res.status(403).send("Missing 'UploadFiles' permission.");
            return;
        }
        next();
    },
    UploadUserFile.array("file"),
    (req, res) => {
        res.sendStatus(200);
    }
);

App.get("/share/:shareid", async (req, res) => {
    const id = req.params.shareid;
    if (await Database.IsShareExpired(id)) {
        await JustRender(
            res.status(404),
            "errors/share",
            { id, "statusCode": 404, "message": "Share expired." }
        );
        return;
    }

    const share = await Database.GetShareById(id);
    if (!share) {
        await JustRender(
            res.status(404),
            "errors/share",
            { id, "statusCode": 404, "message": "Share not found." }
        );
        return;
    }

    const basePath = path.resolve("data/uploads");
    const fullPath = path.resolve(basePath, share.ownerId, share.path);
    
    if (!fullPath.startsWith(basePath) || !fs.existsSync(fullPath)) {
        await JustRender(
            res.status(404),
            "errors/share",
            { id, "statusCode": 404, "message": "Share was deleted." }
        );
        return;
    }

    try {
        const dRes = await DownloadPath(
            res, fullPath, Config.downloadCompressionLevel,
            () => Database.IncrementShareDownloadsById(id)
        );
        if (dRes === DownloadResult.InvalidFileType) {
            await JustRender(
                res.status(404),
                "errors/share",
                { id, "statusCode": 404, "message": "Invalid share." }
            );
        }
    } catch (err) {
        Logger.Error(err);
        await JustRender(
            res.status(500),
            "errors/share",
            { id, "statusCode": 500, "message": "Internal server error." }
        );
    }
});

App.get(/^\/(?!api).*/, (req, res) => {
    JustRender(res.status(404), "errors/404", { "path": req.path });
});

App.use("/api", (err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    Logger.Error(err.stack);
    res.status(500).send(`Error: ${err.message}`);
});

App.use(/^\/(?!api).*/, (err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    Logger.Error(err.stack);
    JustRender(res.status(500), "errors/500", { "message": err.message });
});

(() => {
    if (Config.key || Config.cert) {
        if (!(Config.key && Config.cert)) {
            Logger.Error("You MUST provide both a private key and certificate to enable HTTPS");
            return;
        }
    
        const Server = https.createServer({
            "key": fs.readFileSync(Config.key),
            "cert": fs.readFileSync(Config.cert)
        }, App);
        Logger.Group("Local IPs");
            Logger.Info(`https://127.0.0.1:${Config.port}`);
            Logger.Info(`https://localhost:${Config.port}`);
        Logger.GroupEnd();
        Logger.Info("Listening on port ", Config.port);
        Server.listen(Config.port);
    } else {
        Logger.Group("Local IPs");
            Logger.Info(`http://127.0.0.1:${Config.port}`);
            Logger.Info(`http://localhost:${Config.port}`);
        Logger.GroupEnd();
        Logger.Info("Listening on port ", Config.port);
        App.listen(Config.port);
    }
})();
