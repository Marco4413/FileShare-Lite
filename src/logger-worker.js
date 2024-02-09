const { parentPort } = require("node:worker_threads");

function EnforceNChars(str, fillerChar, n) {
    return str.length >= n ? str : (fillerChar.repeat(n-str.length) + str);
}

function GetFormattedDate(date = new Date()) {
    return `${
        date.getFullYear()
    }/${
        EnforceNChars((date.getMonth()+1).toString(), "0", 2)
    }/${
        EnforceNChars(date.getDate().toString(), "0", 2)
    }`;
}

function GetFormattedTime(date = new Date()) {
    return `${
        EnforceNChars(date.getHours().toString(), "0", 2)
    }:${
        EnforceNChars(date.getMinutes().toString(), "0", 2)
    }:${
        EnforceNChars(date.getSeconds().toString(), "0", 2)
    }`;
}

function GetFormattedDateTime(date = new Date()) {
    return `${GetFormattedDate(date)} ${GetFormattedTime(date)}`;
}

function TextColor(text, r, g, b) {
    return `\x1B[38;2;${r};${g};${b}m${text}\x1B[0m`;
}

function LogTypeTextColor(type, text) {
    switch(type) {
    case "Group":
        return TextColor(text, 255, 150, 0);
    case "Error":
        return TextColor(text, 255, 0, 0);
    case "Warn":
        return TextColor(text, 229, 229, 16);
    default:
        return TextColor(text, 0, 230, 0);
    }
}

let Indent = "";
parentPort.on("message", (msg) => {
    switch(msg.type) {
    case "log": {
        const prefix = `${Indent}[ ${GetFormattedDateTime()} ][ ${msg.logType} ]`;
        const text = msg.message.join("");
        if (msg.logType === "Group")
            console.log(LogTypeTextColor(msg.logType, `${prefix} ${text}:`));
        else console.log(LogTypeTextColor(msg.logType, `${prefix}: `) + text);
    } break;
    case "indent":
        Indent += "  ";
        break;
    case "unindent":
        Indent = Indent.substring(2);
        break;
    }
});
