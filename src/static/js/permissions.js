
const Permissions_None = 0;
const Permissions = {
    ChangePassword: 1,
    UploadFiles:    1 << 1,
    DeleteFiles:    1 << 2,
    DownloadFiles:  1 << 3,
    CreateShare:    1 << 4,
    DeleteShare:    1 << 5,
};
const Permissions_All = (Permissions.DeleteShare << 1) - 1;
    
/**
 * @param {number} perms
 * @param {number} required
 * @param {boolean} admin
 * @returns {boolean}
 */
function HasPermissions(perms, required, admin = false) { return admin || (perms & required) === required; }
    
/**
 * @param {number} perms
 * @returns {number}
 */
function ClipPermissions(perms) { return perms & Permissions_All; }
