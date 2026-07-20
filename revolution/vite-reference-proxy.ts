export const REFERENCE_R2_ORIGIN = "https://pub-e2af4157669b48a9af62795ac31c5a34.r2.dev";

const LOCAL_REFERENCE_PREFIX = "/reference/";
const R2_REFERENCE_PREFIX = "/releases/c7e99fc4e6c6-assets-3f5622023858/reference/";
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function decodeForValidation(segment: string): string {
  let decoded = segment;
  for (let depth = 0; depth < 5; depth += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new Error("malformed reference asset path encoding");
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  throw new Error("excessively encoded reference asset path");
}

/** Map a safe local reference request onto the pinned production R2 prefix. */
export function rewriteReferenceRequest(url: string): string {
  const queryIndex = url.indexOf("?");
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : url.slice(queryIndex);

  if (!pathname.startsWith(LOCAL_REFERENCE_PREFIX)) {
    throw new Error("reference asset path must start with /reference/");
  }

  const relativePath = pathname.slice(LOCAL_REFERENCE_PREFIX.length);
  const segments = relativePath.split("/");
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new Error("reference asset path must name an asset");
  }

  for (const segment of segments) {
    const decoded = decodeForValidation(segment);
    if (
      decoded === "."
      || decoded === ".."
      || decoded.includes("/")
      || decoded.includes("\\")
      || CONTROL_CHARACTER.test(decoded)
    ) {
      throw new Error("unsafe reference asset path");
    }
  }

  return `${R2_REFERENCE_PREFIX}${relativePath}${query}`;
}

export function shouldProxyReferenceRequest(method: string | undefined, url: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  try {
    rewriteReferenceRequest(url);
    return true;
  } catch {
    return false;
  }
}
