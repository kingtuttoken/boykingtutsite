import type { APIRoute } from "astro";
import { startGoogleOAuth } from "../../lib/auth";
export const GET:APIRoute = async (ctx) => {
  try {
    const url = await startGoogleOAuth(ctx, ctx.url.searchParams.get("role") || "customer");
    return Response.redirect(url, 302);
  } catch (e:any) {
    return new Response(`Google Login setup error: ${e.message}`, {status:500});
  }
};
