
const Permissions_ChangePassword = 1;
const Permissions_All = Permissions_ChangePassword;
    
/**
 * @param {number} perms
 * @param {number} required
 * @returns {boolean}
 */
function HasPermissions(perms, required) { return (perms & required) === required; }
    
/**
 * @param {number} perms
 * @returns {number}
 */
function ClipPermissions(perms) { return perms & Permissions.All; }
