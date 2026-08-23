import type { APIRoute } from "astro";
import { cfg, requireDB } from "../../../lib/config";
import { discordNotify } from "../../../lib/discord";
export const GET:APIRoute = async (ctx) => {
  const secret=ctx.request.headers.get("authorization")?.replace(/^Bearer\s+/,"")||ctx.url.searchParams.get("key")||"";
  if(!cfg().CRON_SECRET || secret!==cfg().CRON_SECRET) return new Response("Forbidden",{status:403});
  const now=Date.now(), soon=now+3*24*60*60*1000, db=requireDB();
  const rows:any=await db.prepare(`SELECT s.product_id,s.expires_at,u.email,u.name FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.status='active' AND s.expires_at BETWEEN ? AND ? ORDER BY s.expires_at`).bind(now,soon).all();
  if(rows.results?.length) await discordNotify("⏰ SUBSCRIPTION RENEWAL REMINDERS", rows.results.map((r:any)=>`${r.email} — ${r.product_id} — ${new Date(r.expires_at).toISOString()}`));
  return Response.json({ok:true,count:rows.results?.length||0});
};
