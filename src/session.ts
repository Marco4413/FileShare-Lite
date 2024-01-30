import express from "express";

import * as Database from "./database";

declare global {
    namespace Express {
        export interface Request { user?: Database.User; }
    }
}

export function Session(redirect?: string) {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (!(
            req.signedCookies &&
            req.signedCookies.sessionId &&
            await Database.IsValidSessionId(req.signedCookies.sessionId)
        )) {
            if (redirect)
                res.redirect(redirect);
            else res.status(403).send("Session expired.");
            return;
        }

        const user = await Database.GetUserBySessionId(req.signedCookies.sessionId);
        if (!user) {
            res.sendStatus(500);
            return;
        }

        req.user = user;
        next();
    };
}

export function Admin(redirect?: string) {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (!req.user) {
            res.sendStatus(500);
            return;
        }

        if (!req.user.isAdmin) {
            if (redirect)
                res.redirect(redirect);
            else res.sendStatus(403);
            return;
        }

        next();
    };
}
