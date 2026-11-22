import { NextResponse } from "next/server";
import { actorForKey } from "@/lib/actors";
import { mcpHandlerFor } from "@/lib/mcp";

export const maxDuration = 300;

/**
 * MCP server with the key in the URL, for clients that can't send headers
 * (ChatGPT and Claude custom connectors): https://<app>/api/mcp/<key>
 */
async function handle(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const actor = actorForKey(key);
  if (!actor) return NextResponse.json({ error: "Unknown key" }, { status: 401 });
  return mcpHandlerFor(actor)(req);
}

export { handle as GET, handle as POST, handle as DELETE };
