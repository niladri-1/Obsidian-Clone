/** Clipboard helpers shared by the context menus. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Converts a vault-relative path into the absolute path the OS file manager uses. */
export function absoluteVaultPath(vaultRoot: string, relative: string): string {
  const separator = window.vaultApi.platform === 'win32' ? '\\' : '/';
  const base = vaultRoot.replace(/[\\/]+$/, '');
  return `${base}${separator}${relative.split('/').join(separator)}`;
}
