
export const ChangePassword = 1;
export const UploadFiles    = 1 << 1;
export const DeleteFiles    = 1 << 2;
export const DownloadFiles  = 1 << 3;
export const CreateShare    = 1 << 4;
export const DeleteShare    = 1 << 5;
export const All = (DeleteShare << 1) - 1;
export const Default =
    ChangePassword
    | UploadFiles
    | DeleteFiles
    | DownloadFiles
    | CreateShare
    | DeleteShare;

export function Has(perms: number, required: number, admin: boolean = false): boolean { return admin || (perms & required) === required; }
export function Clip(perms: number): number { return perms & All; }
