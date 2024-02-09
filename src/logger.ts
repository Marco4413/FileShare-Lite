import * as path from "node:path";
import { Worker } from "node:worker_threads";

type MessageType = "log"|"indent"|"unindent";
type MessageLogType = "Info"|"Warn"|"Error"|"Group";
type Message = {
    type: MessageType,
};

type MessageLog = Message & {
    type: "log",
    logType: MessageLogType,
    message: string[]
};

const _Worker = new Worker(path.join(__dirname, "logger-worker.js"));

function _Log(logType: MessageLogType, data: any[]) {
    const msg: MessageLog = {
        "type": "log",
        "logType": logType,
        "message": data.map(v => new String(v) as string)
    };
    _Worker.postMessage(msg);
}

function _Indent() { _Worker.postMessage({ "type": "indent" }); }
function _Unindent() { _Worker.postMessage({ "type": "unindent" }); }

function Info(...data: any[]) { _Log("Info", data); }
function Warn(...data: any[]) { _Log("Warn", data); }
function Error(...data: any[]) { _Log("Error", data); }

function Group(...data: any[]) { _Log("Group", data); _Indent(); }
function GroupEnd() { _Unindent(); }

export default { Info, Warn, Error, Group, GroupEnd };
