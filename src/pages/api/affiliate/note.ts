import type { APIRoute } from "astro";
import { getCurrentUser } from "../../../lib/auth";
import { requireDB } from "../../../lib/config";
import { safeText } from "../../../lib/util";
export const POST:APIRoute = async (ctx) => {
  const u=await getCurrentUser(ctx); if(!u || !["affiliate","owner","admin"].includes(u.role)) return new Response("Forbidden",{status:403});
  const f=await ctx.request.formData(); const clientId=Number(f.get("client_id")); const note=safeText(f.get("note"),2000);
  const db=requireDB(); const client=await db.prepare("SELECT id FROM users WHERE id=? AND referred_by=?").bind(clientId,u.id).first();
  if(!client) return new Response("Invalid client",{status:400});
  await db.prepare(`INSERT INTO affiliate_notes(affiliate_user_id,client_user_id,note,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(affiliate_user_id,client_user_id) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at`)
    .bind(u.id,clientId,note,Date.now()).run();
  return Response.redirect(new URL("/dashboard",ctx.url),303);
};
