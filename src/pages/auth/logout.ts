import type { APIRoute } from "astro";
import { logout } from "../../lib/auth";
export const GET:APIRoute = async (ctx) => { await logout(ctx); return Response.redirect(new URL("/",ctx.url),302); };
