declare const process: {
  cwd: () => string;
  env: Record<string, string | undefined>;
};

declare module "@mariozechner/pi-coding-agent" {
  export interface ExtensionAPI {
    [key: string]: any;
  }

  export interface ExtensionContext {
    [key: string]: any;
  }
}

declare module "@sinclair/typebox" {
  export const Type: {
    Object: (...args: any[]) => any;
    String: (...args: any[]) => any;
    Number: (...args: any[]) => any;
    Boolean: (...args: any[]) => any;
    Array: (...args: any[]) => any;
    Optional: (...args: any[]) => any;
    Union: (...args: any[]) => any;
    Literal: (...args: any[]) => any;
  };
}

declare module "node:fs" {
  export function readFileSync(...args: any[]): any;
  export function readdirSync(...args: any[]): any;
  export function statSync(...args: any[]): any;
  export function existsSync(...args: any[]): any;

  const fs: {
    readFileSync: typeof readFileSync;
    readdirSync: typeof readdirSync;
    statSync: typeof statSync;
    existsSync: typeof existsSync;
  };

  export default fs;
}

declare module "node:fs/promises" {
  const fsPromises: any;
  export default fsPromises;
}

declare module "node:path" {
  export function join(...args: any[]): string;

  const path: {
    join: typeof join;
    [key: string]: any;
  };

  export default path;
}
