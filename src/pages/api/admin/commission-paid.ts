import type { APIRoute } from "astro";
import { getCurrentUser } from "../../../lib/auth";
import { requireDB } from "../../../lib/config";
import { safeText } from "../../../lib/util";
export const POST:APIRoute = async (ctx) => {
  const u=await getCurrentUser(ctx); if(!u || !["owner","admin"].includes(u.role)) return new Response("Forbidden",{status:403});
  const f=await ctx.request.formData(), id=Number(f.get("commission_id")), sig=safeText(f.get("signature"),200);
  if(!id||!sig) return new Response("Missing data",{status:400});
  await requireDB().prepare("UPDATE commissions SET status='paid',payout_signature=?,paid_at=? WHERE id=? AND status='owed'").bind(sig,Date.now(),id).run();
  return Response.redirect(new URL("/admin",ctx.url),303);
};
