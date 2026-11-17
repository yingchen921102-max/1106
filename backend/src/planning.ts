import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

type AuthRequest = FastifyRequest & { userId: string };

export async function registerPlanningRoutes(
  app: FastifyInstance,
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
) {
  app.post<{ Body: {
    goalName: string; targetHours: number; completedHours: number; deadline?: string;
    periodUnit: "week" | "month"; sessionsPerPeriod: number; capacityHours?: number;
  } }>("/plans/suggest", { preHandler: requireAuth }, async (request: AuthRequest, reply) => {
    const body = request.body;
    if (!body?.goalName || !Number.isFinite(body.targetHours) || !Number.isFinite(body.completedHours) || !Number.isFinite(body.sessionsPerPeriod) || body.sessionsPerPeriod < 1) {
      return reply.code(400).send({ error: "invalid_plan_input" });
    }
    const daysPerPeriod = body.periodUnit === "month" ? 30.44 : 7;
    const periodsRemaining = body.deadline
      ? Math.max(1, Math.ceil((Date.parse(`${body.deadline}T23:59:59`) - Date.now()) / (daysPerPeriod * 86_400_000)))
      : 12;
    const remainingHours = Math.max(0, body.targetHours - body.completedHours);
    const requiredHours = Math.round(remainingHours / periodsRemaining * 10) / 10;
    const capacityHours = Number.isFinite(body.capacityHours) && Number(body.capacityHours) > 0 ? Number(body.capacityHours) : requiredHours;
    const feasible = requiredHours <= capacityHours;
    const suggestedHours = Math.min(requiredHours, capacityHours);
    const minutesPerSession = Math.round(suggestedHours * 60 / body.sessionsPerPeriod);
    let milestones = [
      `先完成約 ${Math.round(remainingHours * 0.25 * 10) / 10} 小時，確認目前節奏`,
      `累積至 ${Math.round(body.targetHours * 0.75 * 10) / 10} 小時，檢視並調整方法`,
      `完成剩餘時數，預留一個週期做總回顧`,
    ];
    let explanation = feasible
      ? `剩餘 ${remainingHours.toFixed(1)} 小時分配到 ${periodsRemaining} 期，每期約 ${suggestedHours.toFixed(1)} 小時。`
      : `依目前每期上限，預計每期需要 ${requiredHours.toFixed(1)} 小時，但設定上限為 ${capacityHours.toFixed(1)} 小時；請延長期限或提高投入。`;
    let source = "系統計算";

    if (process.env.OPENAI_API_KEY && feasible) {
      try {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: process.env.INSPIRATION_MODEL || "gpt-4.1-mini",
            input: `為繁體中文使用者的目標「${body.goalName}」提供三個循序漸進的小里程碑。總目標 ${body.targetHours} 小時，已完成 ${body.completedHours} 小時，剩餘 ${periodsRemaining} 個${body.periodUnit === "month" ? "月" : "週"}期；每期投入 ${suggestedHours} 小時。僅輸出 JSON 陣列，三個短句，不要改動時數。`,
            max_output_tokens: 120,
          }),
        });
        const result = await response.json() as any;
        const text = String(result.output_text ?? "").trim();
        const parsed = JSON.parse(text);
        if (response.ok && Array.isArray(parsed) && parsed.length === 3 && parsed.every(item => typeof item === "string" && item.length < 100)) {
          milestones = parsed;
          source = "AI 輔助里程碑；時數由系統核算";
        }
      } catch (error) {
        request.log.warn({ err: error }, "AI plan wording unavailable; using deterministic milestones");
      }
    }
    return { periodsRemaining, remainingHours, requiredHours, suggestedHours, minutesPerSession, feasible, explanation, milestones, source };
  });
}
