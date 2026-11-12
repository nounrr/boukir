export function isClientDetailPath(pathname: string): boolean {
  return /^\/(clients|clients-copy)\/\d+\/?$/.test(pathname);
}
