export class StatusError extends Error {
  constructor(public status: number, ...args: ErrorOptions[]) {
    const message = `status error: ${status}`;
    super(message, ...args);
    this.name = 'StatusError';
  }
}

export const getUrl = () => {
  if (import.meta.env.PROD && typeof document !== "undefined") {
    if (typeof location !== "undefined" && location.hostname.endsWith("onion")) {
      return "http://b723cfcf6psmade7vqldtbc332nhhrwy52wvka3afy5s5257pzbqswid.onion/api"
    } else {
      return "https://misile.xyz/api"
    }
  } else {
    return "http://127.0.0.1:8080/api"
  }
}

export async function fetchAPILow<T>(
  path: string,
  headers: Record<string, string>,
  method: string = "GET",
  formdata: Record<string, string> | undefined = undefined
): Promise<T> {
  if (!path.startsWith("/")) { path = "/" + path; }
  return InternalFetchAPI(`${getUrl()}${path}`, headers, method, formdata)
}

export async function InternalFetchAPI<T>(
  path: string,
  headers: Record<string, string>,
  method: string = "GET",
  formdata: Record<string, string> | undefined = undefined
): Promise<T> {
  let fd: FormData | undefined = undefined;
  if (formdata !== undefined) {
    fd = new FormData();
    for (const i of Object.keys(formdata)) {
      fd.append(i, formdata[i])
    }
  }
  const header = new Headers(headers);
  const resp = await fetch(path, { method, headers: header, body: fd });
  if (!resp.ok) {
    throw new StatusError(resp.status);
  }
  return await resp.json() as T;
}
