
export const ChangePassword = 1;
export const All = ChangePassword;

export function Has(perms: number, required: number): boolean { return (perms & required) === required; }
export function Clip(perms: number): number { return perms & All; }

export default { ChangePassword, All, Has, Clip };
