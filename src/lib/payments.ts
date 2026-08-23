import { cfg, requireDB } from "./config";
import { randomToken } from "./util";
import { getProduct } from "./products";
import { discordNotify } from "./discord";

export async function solUsdPrice() {
  const c = cfg();
  const headers:Record<string,string> = {};
  if (c.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = c.COINGECKO_API_KEY;
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { headers });
  if (!r.ok) throw new Error("Could not retrieve live SOL price.");
  const j:any = await r.json();
  const p = Number(j?.solana?.usd);
  if (!Number.isFinite(p) || p <= 0) throw new Error("Invalid SOL price.");
  return p;
}

export async function createQuote(userId:number, productId:string) {
  const product = getProduct(productId);
  if (!product) throw new Error("Unknown product.");
  const db = requireDB();
  const price = await solUsdPrice();
  const sol = product.usd / price;
  const lamports = Math.ceil(sol * 1_000_000_000);
  const exactSol = lamports / 1_000_000_000;
  const id = randomToken(18);
  const c = cfg();
  const now = Date.now();
  const expires = now + 5*60*1000;
  await db.prepare(`
    INSERT INTO payment_quotes(id,user_id,product_id,usd_amount,sol_usd,sol_amount,lamports,receiving_wallet,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `).bind(id,userId,product.id,product.usd,price,exactSol,lamports,c.SOLANA_RECEIVING_WALLET,now,expires).run();
  return { id, product, usd:product.usd, solUsd:price, solAmount:exactSol, lamports, wallet:c.SOLANA_RECEIVING_WALLET, expiresAt:expires };
}

async function rpc(method:string, params:any[]) {
  const r = await fetch(cfg().SOLANA_RPC_URL, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})
  });
  if (!r.ok) throw new Error("Solana RPC request failed.");
  const j:any = await r.json();
  if (j.error) throw new Error(j.error.message || "Solana RPC error.");
  return j.result;
}

export async function verifyQuotePayment(userId:number, quoteId:string, signature:string) {
  const db = requireDB();
  const q = await db.prepare("SELECT * FROM payment_quotes WHERE id=? AND user_id=?")
    .bind(quoteId,userId).first<any>();
  if (!q) throw new Error("Payment quote not found.");
  if (q.used_at) throw new Error("This quote has already been used.");
  if (q.expires_at < Date.now()) throw new Error("The 5-minute payment quote has expired.");

  const existing = await db.prepare("SELECT id FROM payments WHERE signature=?").bind(signature).first();
  if (existing) throw new Error("This blockchain transaction has already been used.");

  const statuses:any = await rpc("getSignatureStatuses", [[signature], {searchTransactionHistory:true}]);
  const status = statuses?.value?.[0];
  if (!status || status.err || status.confirmationStatus !== "finalized") {
    throw new Error("Transaction is not finalized successfully yet.");
  }

  const tx:any = await rpc("getTransaction", [signature, {
    commitment:"finalized", encoding:"jsonParsed", maxSupportedTransactionVersion:0
  }]);
  if (!tx?.meta || !tx?.transaction?.message) throw new Error("Unable to read finalized transaction.");

  const keys = (tx.transaction.message.accountKeys || []).map((k:any)=> typeof k === "string" ? k : k.pubkey);
  const idx = keys.indexOf(q.receiving_wallet);
  if (idx < 0) throw new Error("Receiving wallet was not found in the transaction.");
  const pre = Number(tx.meta.preBalances?.[idx] ?? 0);
  const post = Number(tx.meta.postBalances?.[idx] ?? 0);
  const received = post - pre;
  if (received < Number(q.lamports)) throw new Error("Transaction amount is lower than the required SOL payment.");

  const now = Date.now();
  const ins:any = await db.prepare(`
    INSERT INTO payments(user_id,quote_id,product_id,signature,usd_amount,sol_amount,sol_usd,verified_at)
    VALUES(?,?,?,?,?,?,?,?)
  `).bind(userId,q.id,q.product_id,signature,q.usd_amount,q.sol_amount,q.sol_usd,now).run();
  const paymentId = ins.meta?.last_row_id;
  await db.prepare("UPDATE payment_quotes SET used_at=? WHERE id=?").bind(now,q.id).run();

  const product = getProduct(q.product_id)!;
  if (product.kind === "subscription") {
    const expires = now + 30*24*60*60*1000;
    const existingSub = await db.prepare("SELECT id,expires_at FROM subscriptions WHERE user_id=? AND product_id=? AND status='active' ORDER BY id DESC LIMIT 1")
      .bind(userId,product.id).first<any>();
    if (existingSub) {
      const base = Math.max(Number(existingSub.expires_at), now);
      await db.prepare("UPDATE subscriptions SET expires_at=?,last_payment_id=? WHERE id=?")
        .bind(base+30*24*60*60*1000,paymentId,existingSub.id).run();
    } else {
      await db.prepare("INSERT INTO subscriptions(user_id,product_id,status,starts_at,expires_at,last_payment_id) VALUES(?,?,?,?,?,?)")
        .bind(userId,product.id,"active",now,expires,paymentId).run();
    }
  } else {
    await db.prepare("INSERT INTO orders(user_id,product_id,payment_id,status,created_at) VALUES(?,?,?,?,?)")
      .bind(userId,product.id,paymentId,"paid",now).run();
  }

  if (product.commissionUsd) {
    const client = await db.prepare("SELECT referred_by FROM users WHERE id=?").bind(userId).first<any>();
    if (client?.referred_by) {
      const commissionSol = product.commissionUsd / Number(q.sol_usd);
      await db.prepare(`
        INSERT OR IGNORE INTO commissions(affiliate_user_id,client_user_id,payment_id,usd_amount,sol_amount,status,created_at)
        VALUES(?,?,?,?,?,'owed',?)
      `).bind(client.referred_by,userId,paymentId,product.commissionUsd,commissionSol,now).run();
    }
  }

  await discordNotify("✅ SOLANA PAYMENT VERIFIED", [
    `Product: ${product.name}`,
    `USD: $${Number(q.usd_amount).toFixed(2)}`,
    `SOL: ${Number(q.sol_amount).toFixed(9)}`,
    `Signature: ${signature}`
  ]);
  return { product, paymentId };
}
