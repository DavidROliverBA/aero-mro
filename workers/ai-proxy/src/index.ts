// Cloudflare Worker: server-side proxy for the app's Claude calls, so the
// Anthropic API key stays out of the browser entirely (path-to-v1 Phase 1).
// Forwards POST bodies to the Messages API and streams the response back.
//
// AUTHENTICATED. CORS alone is not access control — it only governs whether a
// *browser* may read the response, and does nothing to stop curl or a server.
// An unauthenticated proxy is an open relay for the API key: anyone who learns
// the URL can spend the quota. Every request must therefore carry the caller's
// Supabase access token, which is verified against the project's auth endpoint.

export interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

const DEV_ORIGIN = /^http:\/\/localhost(:\d+)?$/;

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  // Exact match, not startsWith: "http://localhost.attacker.com" has the prefix.
  const allowed = origin && (origin === env.ALLOWED_ORIGIN || DEV_ORIGIN.test(origin))
    ? origin
    : env.ALLOWED_ORIGIN;
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

// Verifies the bearer token with Supabase. A valid token proves the caller is a
// signed-in user of this project; RLS still governs what data they can reach.
async function signedIn(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: auth, apikey: env.SUPABASE_ANON_KEY },
  });
  return res.ok;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(env, origin);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return new Response("POST only", { status: 405, headers: cors });

    if (!(await signedIn(request, env))) {
      return new Response(JSON.stringify({ error: "Sign in to use the AI features." }), {
        status: 401,
        headers: { "content-type": "application/json", ...cors },
      });
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: request.body,
    });

    // Pass the upstream content-type through untouched: streamed replies are
    // text/event-stream, and relabelling them application/json breaks the parser.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        ...cors,
      },
    });
  },
};
