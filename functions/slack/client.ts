const METHODS = { "auth.test": "POST", "chat.getPermalink": "GET", "views.open": "POST" } as const;

export type SlackMethod = keyof typeof METHODS;

/** What every Web API answer carries, and the fields this app reads */
export interface SlackResponse {
  ok: boolean;
  error?: string;
  team_id?: string;
  permalink?: string;
}

export type SlackApi = (method: SlackMethod, body?: Record<string, unknown>) => Promise<SlackResponse>;

export class SlackApiError extends Error {
  method: string;
  code: string;

  constructor(method: string, code: unknown) {
    super(`Slack ${method} failed`);
    this.name = "SlackApiError";
    this.method = method;
    // Only a fixed-format API error code may reach logs, never response bodies.
    this.code = typeof code === "string" && /^[a-z0-9_]+$/.test(code) ? code : "unknown_error";
  }
}

export function createSlackClient({ botToken, fetch: fetchImpl = fetch }: { botToken: () => string; fetch?: typeof fetch }): SlackApi {
  return async (method, body = {}) => {
    const verb = METHODS[method];
    if (!verb) throw new Error("Unsupported Slack method");
    const url = new URL(`https://slack.com/api/${method}`);
    const headers: Record<string, string> = { Authorization: `Bearer ${botToken()}` };
    const options: RequestInit = { method: verb, headers, signal: AbortSignal.timeout(2000) };
    if (verb === "GET") {
      // This endpoint reads query parameters; a JSON POST returns invalid_arguments.
      url.search = new URLSearchParams(body as Record<string, string>).toString();
    } else {
      headers["Content-Type"] = "application/json; charset=utf-8";
      options.body = JSON.stringify(body);
    }
    const response = await fetchImpl(url.href, options);
    const data = (await response.json()) as SlackResponse;
    if (!response.ok || !data.ok) throw new SlackApiError(method, data.error || `http_${response.status}`);
    return data;
  };
}
