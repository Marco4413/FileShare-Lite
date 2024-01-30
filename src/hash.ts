import { createHash } from "node:crypto";

const BaseHash = createHash("sha256");
export default function(str: string, salt?: string) {
    const hash = BaseHash.copy();
    if (salt) hash.update(salt);
    return hash.update(str).digest("hex");
}
