import fs from "node:fs";
import https from "node:https";
import path from "node:path";

import archiver from "archiver";
import cookieparser from "cookie-parser";
import express from "express";
import multer from "multer";

import Config from "./config";
import * as Database from "./database";
import { Session, Admin } from "./session";
import { DirectoryToJSON, ToSharePath, TrimLeadingSlashes } from "./utils";

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
App.use(express.urlencoded({"extended": true}),
        cookieparser(Config.cookieSecrets));
App.use("/api", Session());
App.use("/dashboard", Session("/login"));
App.use("/api/admin", Admin());
App.use("/dashboard/admin", Admin("/dashboard"));
App.use(express.static(path.join(__dirname, "static")));

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

    const userId = await Database.CreateUser(req.body.uname, req.body.passw, false);
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

    if (req.body.admin)
        await Database.SetUserAdminById(req.body.id, req.body.admin === "true");
    if (req.body.uname)
        await Database.SetUserUsernameById(req.body.id, req.body.uname);
    if (req.body.passw)
        await Database.SetUserPasswordById(req.body.id, req.body.passw);
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

App.patch("/api/profile", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
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
    } else if (!req.body.path) {
        res.status(400).send("No path for new share provided.");
        return;
    }

    const sharePath = ToSharePath(req.body.path);
    if (sharePath === ".") {
        res.status(400).send("Can't share user folder.");
        return;
    } else if (await Database.HasShareByPath(sharePath)) {
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

App.get("/api/files", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
        return;
    }

    const fullPath = req.query.path
        ? path.resolve("data/uploads", req.user.id, TrimLeadingSlashes(req.query.path as string))
        : path.resolve("data/uploads", req.user.id);
    fs.mkdir(fullPath, { "recursive": true }, err => {
        if (err) {
            console.error(err);
            res.sendStatus(500);
            return
        }

        const dir = DirectoryToJSON(fullPath);
        res.send(dir);
    });
});

App.delete("/api/files", async (req, res) => {
    if (!req.user) {
        res.sendStatus(500);
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
            console.error(err);
            res.sendStatus(500);
            return
        }

        if (stats.isDirectory()) {
            console.warn(`DELETING '${fullPath}' in ${Math.floor(Config.rmdirDelay/1000)}s`);
            setTimeout(() => {
                console.warn(`DELETING '${fullPath}'...`);
                fs.rm(fullPath, { "recursive": true, "force": true }, err => {
                    if (err) {
                        console.error(err);
                        res.sendStatus(500);
                        return;
                    }
                    res.sendStatus(200);
                });
            }, Config.rmdirDelay);
        } else if (stats.isFile()) {
            fs.unlink(fullPath, err => {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                res.sendStatus(200);
            });
        } else res.status(404).send("Provided path does not exist.");
    });
});

App.post("/api/files/upload", UploadUserFile.array("file"), (req, res) => {
    res.sendStatus(200);
});

App.get("/share/:shareid", async (req, res) => {
    const shareId = req.params.shareid;
    if (await Database.IsShareExpired(shareId)) {
        res.status(400).send("Share expired.");
        return;
    }

    const share = await Database.GetShareById(shareId);
    if (!share) {
        res.status(404).send("Share not found.");
        return;
    }

    const basePath = path.resolve("data/uploads");
    const fullPath = path.resolve(basePath, share.ownerId, share.path);
    
    if (!fullPath.startsWith(basePath) || !fs.existsSync(fullPath)) {
        await Database.DeleteShareById(shareId);
        res.status(404).send("Invalid share.");
        return;
    }

    fs.stat(fullPath, async (err, stat) => {
        if (err) {
            console.error(err);
            res.sendStatus(500);
        } else if (stat.isDirectory()) {
            await Database.IncrementShareDownloadsById(shareId);
            const dirName = path.basename(fullPath);
            res.attachment(`${dirName}.zip`);
            const archive = archiver("zip", { "zlib": { "level": 0 } })
                .directory(fullPath, path.basename(dirName));
            archive.pipe(res);
            await archive.finalize();
        } else if (stat.isFile()) {
            await Database.IncrementShareDownloadsById(shareId);
            res.download(fullPath);
        } else {
            await Database.DeleteShareById(shareId);
            res.status(404).send("Invalid share type.");
        }
    });
});

(() => {
    if (Config.key || Config.cert) {
        if (!(Config.key && Config.cert)) {
            console.error("You MUST provide both a private key and certificate to enable HTTPS");
            return;
        }
    
        const Server = https.createServer({
            "key": fs.readFileSync(Config.key),
            "cert": fs.readFileSync(Config.cert)
        }, App);
        Server.listen(Config.port);
    } else {
        App.listen(Config.port);
    }
})();
