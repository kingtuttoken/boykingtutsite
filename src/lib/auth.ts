import type { APIContext, AstroGlobal } from "astro";
import { cfg, requireDB } from "./config";
import { randomToken, sha256Hex } from "./util";
import { discordNotify } from "./discord";

export type CurrentUser = {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  role: "customer" | "affiliate" | "admin" | "owner";
  affiliate_code: string | null;
  referred_by: number | null;
};

export async function getCurrentUser(Astro: AstroGlobal | APIContext): Promise<CurrentUser | null> {
  const raw = Astro.cookies.get("bkt_session")?.value;
  if (!raw) return null;
  try {
    const db = requireDB();
    const hash = await sha256Hex(raw);
    const now = Date.now();
    return await db.prepare(`
      SELECT u.id,u.email,u.name,u.picture,u.role,u.affiliate_code,u.referred_by
      FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>?
    `).bind(hash, now).first() as CurrentUser | null;
  } catch {
    return null;
  }
}

export async function createSession(Astro: AstroGlobal | APIContext, userId: number) {
  const db = requireDB();
  const raw = randomToken(32);
  const hash = await sha256Hex(raw);
  const now = Date.now();
  const expires = now + 30 * 24 * 60 * 60 * 1000;
  await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
    .bind(hash, userId, expires, now).run();
  Astro.cookies.set("bkt_session", raw, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30*24*60*60
  });
}

export async function logout(Astro: AstroGlobal | APIContext) {
  const raw = Astro.cookies.get("bkt_session")?.value;
  if (raw) {
    try {
      const db = requireDB();
      await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256Hex(raw)).run();
    } catch {}
  }
  Astro.cookies.delete("bkt_session", { path: "/" });
}

export async function startGoogleOAuth(Astro: AstroGlobal | APIContext, role: string) {
  const c = cfg();
  if (!c.GOOGLE_CLIENT_ID || !c.GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth secrets are not configured.");
  const db = requireDB();
  const safeRole = role === "affiliate" ? "affiliate" : "customer";
  const state = randomToken(32);
  const stateHash = await sha256Hex(state);
  const ref = Astro.cookies.get("bkt_ref")?.value || null;
  await db.prepare("INSERT INTO oauth_states(state_hash,role,referral_code,expires_at) VALUES(?,?,?,?)")
    .bind(stateHash, safeRole, ref, Date.now()+10*60*1000).run();

  const redirectUri = `${c.SITE_URL}/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", c.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

function adminEmails() {
  return cfg().ADMIN_EMAILS.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
}

function makeAffiliateCode() {
  return "BKT-" + randomToken(6).replace(/[^A-Za-z0-9]/g,"").slice(0,8).toUpperCase();
}

export async function finishGoogleOAuth(Astro: AstroGlobal | APIContext, code: string, state: string) {
  const c = cfg();
  const db = requireDB();
  const stateHash = await sha256Hex(state);
  const st = await db.prepare("SELECT role,referral_code,expires_at FROM oauth_states WHERE state_hash=?")
    .bind(stateHash).first<any>();
  if (!st || st.expires_at < Date.now()) throw new Error("OAuth state expired or invalid.");
  await db.prepare("DELETE FROM oauth_states WHERE state_hash=?").bind(stateHash).run();

  const redirectUri = `${c.SITE_URL}/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      code,
      client_id:c.GOOGLE_CLIENT_ID,
      client_secret:c.GOOGLE_CLIENT_SECRET,
      redirect_uri:redirectUri,
      grant_type:"authorization_code"
    })
  });
  if (!tokenRes.ok) throw new Error("Google token exchange failed.");
  const token:any = await tokenRes.json();

  const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers:{authorization:`Bearer ${token.access_token}`}
  });
  if (!userRes.ok) throw new Error("Google user profile request failed.");
  const profile:any = await userRes.json();
  if (!profile.email || profile.email_verified === false) throw new Error("Verified Google email required.");

  const email = String(profile.email).toLowerCase();
  const desiredRole = adminEmails().includes(email) ? "owner" : st.role;
  const now = Date.now();
  let user = await db.prepare("SELECT * FROM users WHERE google_sub=? OR email=?")
    .bind(profile.sub, email).first<any>();

  let isNew = false;
  if (!user) {
    isNew = true;
    let referredBy:number|null = null;
    if (desiredRole === "customer" && st.referral_code) {
      const aff = await db.prepare("SELECT id FROM users WHERE affiliate_code=? AND role IN ('affiliate','owner','admin')")
        .bind(st.referral_code).first<any>();
      if (aff) referredBy = aff.id;
    }
    const affiliateCode = desiredRole === "affiliate" ? makeAffiliateCode() : null;
    await db.prepare(`
      INSERT INTO users(google_sub,email,name,picture,role,affiliate_code,referred_by,created_at,last_login_at)
      VALUES(?,?,?,?,?,?,?,?,?)
    `).bind(profile.sub,email,profile.name||null,profile.picture||null,desiredRole,affiliateCode,referredBy,now,now).run();
    user = await db.prepare("SELECT * FROM users WHERE google_sub=?").bind(profile.sub).first<any>();
  } else {
    const role = adminEmails().includes(email) ? "owner" : user.role;
    let affiliateCode = user.affiliate_code;
    if (role === "affiliate" && !affiliateCode) affiliateCode = makeAffiliateCode();
    await db.prepare("UPDATE users SET name=?,picture=?,role=?,affiliate_code=?,last_login_at=? WHERE id=?")
      .bind(profile.name||user.name,profile.picture||user.picture,role,affiliateCode,now,user.id).run();
    user = await db.prepare("SELECT * FROM users WHERE id=?").bind(user.id).first<any>();
  }

  await createSession(Astro, user.id);
  Astro.cookies.delete("bkt_ref", { path:"/" });

  if (isNew) {
    await discordNotify(user.role === "affiliate" ? "👑 NEW AFFILIATE JOINED" : "👤 NEW CUSTOMER JOINED", [
      `Name: ${user.name || "—"}`,
      `Email: ${user.email}`,
      `Role: ${user.role}`
    ]);
  }
  return user as CurrentUser;
}
