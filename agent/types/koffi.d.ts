declare module "koffi" {
  export function load(path: string): { func: (signature: string) => unknown };
}
