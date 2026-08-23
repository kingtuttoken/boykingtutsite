import type { APIRoute } from "astro";
import { finishGoogleOAuth } from "../../../lib/auth";
export const GET:APIRoute = async (ctx) => {
  const code = ctx.url.searchParams.get("code");
  const state = ctx.url.searchParams.get("state");
  if (!code || !state) return new Response("Missing OAuth code/state.", {status:400});
  try {
    await finishGoogleOAuth(ctx, code, state);
    return Response.redirect(new URL("/dashboard", ctx.url), 302);
  } catch (e:any) {
    return new Response(`Google Login failed: ${e.message}`, {status:400});
  }
};
