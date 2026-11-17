import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const prompts: Record<string, string[]> = {
  "藝術": [
    "觀察一件日常物品：如果把它畫成三條線，哪三條最重要？",
    "今天留意一種顏色，找找它在不同地方帶給你的感覺。",
    "用五分鐘記錄一個畫面，不必完整，只要抓住最吸引你的地方。",
  ],
  "財經": [
    "選一個常見的經濟指標，花十分鐘弄懂它代表什麼、又不代表什麼。",
    "看一則財經報導時，找出數字的來源與比較基準，再形成自己的看法。",
    "把今天讀到的市場消息寫成一句事實、一句解讀，分清兩者的差異。",
  ],
  "科學": [
    "把今天的一個「為什麼」寫下來，再找一個可信來源開始查證。",
    "用自己的話解釋一個剛學到的概念，看看哪裡還需要補充。",
    "觀察一個生活現象，先提出假設，再想一個能驗證它的小方法。",
  ],
  "設計": [
    "挑一個今天用過的介面，想想它讓你更容易完成了哪一件事。",
    "把一件麻煩的小事拆成三步，看看哪一步可以設計得更順手。",
    "找一個你喜歡的設計，說明它為什麼適合使用者，而不只是好看。",
  ],
};

const cache = new Map<string, { text: string; expiresAt: number }>();
type AuthRequest = FastifyRequest & { userId: string };

export async function registerInspirationRoutes(
  app: FastifyInstance,
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
) {
  app.get<{ Querystring: { topic?: string; refresh?: string } }>("/inspiration/today", { preHandler: requireAuth }, async (request: AuthRequest, reply) => {
    const topic = request.query.topic && prompts[request.query.topic] ? request.query.topic : "藝術";
    const date = new Date().toISOString().slice(0, 10);
    const cacheKey = `${request.userId}:${date}:${topic}`;
    const current = cache.get(cacheKey);
    if (request.query.refresh !== "1" && current && current.expiresAt > Date.now()) return { topic, text: current.text, date, source: "AI 每日靈感" };

    let text: string;
    if (process.env.OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.INSPIRATION_MODEL || "gpt-4.1-mini",
          input: `請用繁體中文，寫一句簡短、溫和、可在 5 到 15 分鐘內開始的「${topic}」學習靈感或行動提示。不要編造新聞、數據、來源或事實，也不要說教。只回傳提示句。`,
          max_output_tokens: 100,
        }),
      });
      const result = await response.json() as any;
      if (!response.ok) {
        request.log.error({ status: response.status }, "Inspiration generation failed");
        return reply.code(502).send({ error: "inspiration_unavailable" });
      }
      text = String(result.output_text ?? result.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === "output_text")?.text ?? "").trim();
      if (!text) return reply.code(502).send({ error: "inspiration_unavailable" });
    } else {
      const index = Math.floor(Date.now() / 86_400_000) % prompts[topic].length;
      text = prompts[topic][index];
    }
    cache.set(cacheKey, { text, expiresAt: Date.now() + 60 * 60_000 });
    return { topic, text, date, source: process.env.OPENAI_API_KEY ? "AI 每日靈感" : "日日主題提示" };
  });
}
