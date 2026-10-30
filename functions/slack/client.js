const METHODS = { "auth.test": "POST", "chat.getPermalink": "GET", "views.open": "POST" };

class SlackApiError extends Error {
  constructor(method, code) {
    super(`Slack ${method} failed`);
    this.name = "SlackApiError";
    this.method = method;
    // Only a fixed-format API error code may reach logs, never response bodies.
    this.code = typeof code === "string" && /^[a-z0-9_]+$/.test(code) ? code : "unknown_error";
  }
}

function createSlackClient({ botToken, fetch: fetchImpl = fetch }) {
  return async (method, body = {}) => {
    const verb = METHODS[method];
    if (!verb) throw new Error("Unsupported Slack method");
    const url = new URL(`https://slack.com/api/${method}`);
    const options = { method: verb, headers: { Authorization: `Bearer ${botToken()}` }, signal: AbortSignal.timeout(2000) };
    if (verb === "GET") {
      // This endpoint reads query parameters; a JSON POST returns invalid_arguments.
      url.search = new URLSearchParams(body).toString();
    } else {
      options.headers["Content-Type"] = "application/json; charset=utf-8";
      options.body = JSON.stringify(body);
    }
    const response = await fetchImpl(url.href, options);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new SlackApiError(method, data.error || `http_${response.status}`);
    return data;
  };
}

module.exports = { createSlackClient, SlackApiError };
