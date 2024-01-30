import * as sqlite from "sqlite";
import sqlite3 from "sqlite3";
import uuid from "short-uuid";

import Hash from "./hash";

const UUID = uuid();
const SessionUUID = uuid(uuid.constants.cookieBase90);

async function OpenDatabase() {
    return await sqlite.open({
        "driver": sqlite3.Database,
        "filename": "data/db.sqlite"
    });
}

export type User = {
    id: string,
    username: string,
    password: string,
    sessionId: string|null,
    sessionExpiryDate: number|null,
    isAdmin: boolean
};

export type Share = {
    id: string,
    path: string,
    ownerId: string,
    downloads: number,
    maxDownloads: number,
    expiryDate: number
};

async function CreateDatabase() {
    const db = await OpenDatabase();
    await db.exec(`
    CREATE TABLE
    IF NOT EXISTS
    Users(
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        sessionId TEXT UNIQUE,
        sessionExpiryDate INTEGER DEFAULT 0,
        isAdmin BOOLEAN DEFAULT false
    );
    `);
    await db.exec(`
    CREATE TABLE
    IF NOT EXISTS
    Share(
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE,
        ownerId TEXT,
        downloads INTEGER DEFAULT 0,
        maxDownloads INTEGER DEFAULT 0,
        expiryDate INTEGER DEFAULT 0
    );
    `);
    return db;
}

let Database: sqlite.Database|null = null;
export async function GetDatabase(): Promise<sqlite.Database> {
    if (!Database) Database = await CreateDatabase();
    return Database;
}

export async function HasUserByUsername(username: string): Promise<boolean> {
    const db = await GetDatabase();
    return (await db.get("SELECT username FROM Users WHERE username = ?;", username)) !== undefined;
}

export async function HasUserById(id: string): Promise<boolean> {
    const db = await GetDatabase();
    return (await db.get("SELECT id FROM Users WHERE id = ?;", id)) !== undefined;
}

export async function IsValidSessionId(id: string): Promise<boolean> {
    const now = Date.now();
    const db = await GetDatabase();
    return (await db.get("SELECT id FROM Users WHERE sessionId = ? AND sessionExpiryDate > ?;", id, now)) !== undefined;
}

export async function MatchUserCredentials(username: string, password: string): Promise<boolean> {
    const user = await GetUserByUsername(username, false);
    if (!user) return false;
    const passwordHash = Hash(password, user.id);
    return user.username === username && user.password === passwordHash;
}

export async function CreateUser(username: string, password: string, admin: boolean = false): Promise<string|null> {
    if (await HasUserByUsername(username))
        return null;

    const userId = UUID.generate();
    if (await HasUserById(userId))
        return null;
    const passwordHash = Hash(password, userId);

    const db = await GetDatabase();
    const res = await db.run("INSERT INTO Users(id, username, password, isAdmin) VALUES (?, ?, ?, ?);", userId, username, passwordHash, admin);
    return res.lastID ? userId : null;
}

export async function GenerateUserSessionId(username: string, validFor: number): Promise<string|null> {
    if (!await HasUserByUsername(username))
        return null;

    const sessionId = SessionUUID.uuid();
    if (await IsValidSessionId(sessionId))
        return null;
    const expiryDate = Date.now() + validFor;
        
    const db = await GetDatabase();
    const res = await db.run(`
    UPDATE Users
    SET sessionId = ?,
        sessionExpiryDate = ?
    WHERE username = ?;
    `, sessionId, expiryDate, username);

    return res.changes && res.changes > 0 ? sessionId : null;
}

export async function GetUserByUsername(username: string, hidePassword: boolean = true): Promise<User|null> {
    const db = await GetDatabase();
    const user = await db.get(`
    SELECT id, username${hidePassword ? "" : ", password"}, sessionExpiryDate, isAdmin
    FROM Users
    WHERE username = ?;
    `, username) ?? null;
    if (user) user.isAdmin = user.isAdmin === 1;
    return user;
}

export async function GetUserBySessionId(id: string, hidePassword: boolean = true): Promise<User|null> {
    const db = await GetDatabase();
    const user = await db.get(`
    SELECT id, username${hidePassword ? "" : ", password"}, sessionExpiryDate, isAdmin
    FROM Users
    WHERE sessionId = ?;
    `, id) ?? null;
    if (user) user.isAdmin = user.isAdmin === 1;
    return user;
}

export async function GetAllUsers(hidePassword: boolean = true): Promise<User[]> {
    const db = await GetDatabase();
    const users = await db.all(`
    SELECT id, username${hidePassword ? "" : ", password"}, sessionExpiryDate, isAdmin
    FROM Users;
    `);
    users.forEach(u => u.isAdmin = u.isAdmin === 1);
    return users;
}

export async function DeleteUserById(id: string): Promise<void> {
    const db = await GetDatabase();
    await db.run(`
    DELETE FROM Users
    WHERE id = ?;
    `, id);
    await db.run(`
    DELETE FROM Share
    WHERE ownerId = ?;
    `, id);
}

export async function SetUserAdminById(id: string, admin: boolean): Promise<void> {
    const db = await GetDatabase();
    await db.run(`
    UPDATE Users
    SET isAdmin = ?
    WHERE id = ?;
    `, admin, id);
}

export async function SetUserUsernameById(id: string, username: string): Promise<void> {
    const db = await GetDatabase();
    await db.run(`
    UPDATE Users
    SET username = ?
    WHERE id = ?;
    `, username, id);
}

export async function SetUserPasswordById(id: string, password: string): Promise<void> {
    const passwordHash = Hash(password, id);
    const db = await GetDatabase();
    await db.run(`
    UPDATE Users
    SET password = ?
    WHERE id = ?;
    `, passwordHash, id);
}

export async function GetUserShares(username: string): Promise<Share[]> {
    const user = await GetUserByUsername(username);
    if (!user) return [];
    const db = await GetDatabase();
    return await db.all(`
    SELECT *
    FROM Share
    WHERE ownerId = ?;
    `, user.id);
}

export async function IsShareExpired(id: string): Promise<boolean> {
    const now = Date.now();
    const share = await GetShareById(id);
    return !(
        !share
        || (share.expiryDate <= 0 || share.expiryDate > now)
        && (share.maxDownloads <= 0 || share.maxDownloads > share.downloads)
    );
}

export async function IncrementShareDownloadsById(id: string): Promise<void> {
    const db = await GetDatabase();
    await db.run(`
    UPDATE Share
    SET downloads = downloads + 1
    WHERE id = ?;
    `, id);
}

export async function IsDuplicateShare(id: string, path: string): Promise<boolean> {
    const db = await GetDatabase();
    return (await db.get("SELECT id FROM Share WHERE id = ? OR path = ?;", id, path)) !== undefined;
}

export async function HasShareByPath(path: string): Promise<boolean> {
    const db = await GetDatabase();
    return (await db.get("SELECT path FROM Share WHERE path = ?;", path)) !== undefined;
}

export async function CreateUserShare(username: string, path: string, maxDownloads: number = 0, expiryDate: number = 0): Promise<string|null> {
    const shareId = UUID.generate();
    if (await IsDuplicateShare(shareId, path))
        return null;
    const user = await GetUserByUsername(username);
    if (!user)
        return null;
    const db = await GetDatabase();
    const res = await db.run(`
    INSERT INTO Share(id, path, ownerId, maxDownloads, expiryDate)
    VALUES (?, ?, ?, ?, ?);
    `, shareId, path, user.id, maxDownloads, expiryDate);
    return res.lastID ? shareId : null;
}

export async function GetShareById(id: string): Promise<Share|null> {
    const db = await GetDatabase();
    return await db.get(`
    SELECT *
    FROM Share
    WHERE id = ?;
    `, id) ?? null;
}

export async function DeleteShareById(id: string): Promise<void> {
    const db = await GetDatabase();
    await db.run(`
    DELETE FROM Share
    WHERE id = ?;
    `, id);
}
