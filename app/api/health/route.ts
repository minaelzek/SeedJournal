import { getD1 } from "@/db";
import { apiJson, withApi } from "../_shared/http";

export const GET = withApi(async (request: Request) => {
  if (request.method !== "GET") {
    return apiJson({ ok: false, database: "down" }, { status: 405 });
  }
  try {
    await getD1().prepare("SELECT 1 AS ok").first();
  } catch {
    return apiJson(
      { ok: false, database: "down" },
      { status: 503 },
    );
  }
  return apiJson({ ok: true, database: "up" });
});
