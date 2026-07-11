// Cloudflare Worker: server-side proxy for the app's Claude calls, so the
// Anthropic API key stays out of the browser entirely (path-to-v1 Phase 1).
// Forwards POST bodies verbatim to the Messages API and streams the response.

export interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
}

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed =
    origin && (origin === env.ALLOWED_ORIGIN || origin.startsWith("http://localhost"))
      ? origin
      : env.ALLOWED_ORIGIN;
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(env, origin);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return new Response("POST only", { status: 405, headers: cors });

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: request.body,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json", ...cors },
    });
  },
};
