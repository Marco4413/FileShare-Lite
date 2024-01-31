
export const ChangePassword = 1;
export const All = ChangePassword;

export function Has(perms: number, required: number, admin: boolean = false): boolean { return admin || (perms & required) === required; }
export function Clip(perms: number): number { return perms & All; }

export default { ChangePassword, All, Has, Clip };
