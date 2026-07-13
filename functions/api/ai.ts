// Pages Function: the app's server-side Claude proxy, same-origin at /api/ai.
//
// The Anthropic key lives in Cloudflare (a Pages secret) and never reaches the
// browser. Same-origin, so no CORS is involved at all.
//
// AUTHENTICATED. An unauthenticated proxy is an open relay for the API key —
// anyone who learns the URL can spend the quota, and CORS would not stop them
// (it only governs what a *browser* may read, not what curl may send). Every
// request must carry the caller's Supabase access token, verified against the
// project's auth endpoint before anything is forwarded.
//
// The identical logic exists as a standalone Worker in workers/ai-proxy/ for
// anyone who would rather host it separately.

interface Env {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

async function signedIn(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: auth, apikey: env.SUPABASE_ANON_KEY },
  });
  return res.ok;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await signedIn(request, env))) {
    return new Response(JSON.stringify({ error: "Sign in to use the AI features." }), {
      status: 401,
      headers: { "content-type": "application/json" },
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
    },
  });
};
