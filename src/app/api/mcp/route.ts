import { NextResponse } from "next/server";
import { actorFromRequest } from "@/lib/auth";
import { mcpHandlerFor } from "@/lib/mcp";

export const maxDuration = 300;

/** MCP server for clients that send "Authorization: Bearer <key>". */
async function handle(req: Request) {
  const actor = actorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return mcpHandlerFor(actor)(req);
}

export { handle as GET, handle as POST, handle as DELETE };
