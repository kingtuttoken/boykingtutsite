import type { APIRoute } from "astro";
import { getCurrentUser } from "../../../lib/auth";
import { verifyQuotePayment } from "../../../lib/payments";
import { safeText } from "../../../lib/util";
export const POST:APIRoute = async (ctx) => {
  const user = await getCurrentUser(ctx);
  if (!user) return Response.json({ok:false,error:"Login required."},{status:401});
  try {
    const form=await ctx.request.formData();
    const quote=safeText(form.get("quote_id"),100), sig=safeText(form.get("signature"),200);
    if(!quote||!sig) throw new Error("Quote and transaction signature are required.");
    const result=await verifyQuotePayment(user.id,quote,sig);
    return Response.json({ok:true,product:result.product.name});
  } catch(e:any) { return Response.json({ok:false,error:e.message},{status:400}); }
};
