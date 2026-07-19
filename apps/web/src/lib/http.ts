/**
 * fetch()'s res.json() throws a cryptic "Unexpected end of JSON input" when
 * the body is empty (a crashed/timed-out server, a proxy hiccup, etc). This
 * reads the raw text first so failures surface a message that actually says
 * what happened.
 */
export async function parseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) {
    throw new Error(
      res.ok
        ? "Server returned an empty response — check the terminal running `npm run dev` for an error."
        : `Server error ${res.status} ${res.statusText || ""}`.trim(),
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned an unexpected non-JSON response: ${text.slice(0, 200)}`);
  }
}
