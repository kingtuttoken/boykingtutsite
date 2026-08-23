import { cfg } from "./config";

export async function discordNotify(title: string, lines: string[]) {
  const url = cfg().DISCORD_WEBHOOK_URL;
  if (!url) return;
  const content = `**${title}**\n${lines.join("\n")}`.slice(0, 1900);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
  } catch {}
}
