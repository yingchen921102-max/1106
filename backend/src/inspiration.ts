import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const prompts: Record<string, string[]> = {
  "藝術創作": ["把眼前一件物品畫成三條線，留下最重要的形狀。", "用五分鐘記錄今天最有感覺的一個畫面。", "用文字、顏色或聲音替今天的心情做一張小作品。"],
  "心理與自我成長": ["寫下一件今天做得不錯的小事，練習看見自己的努力。", "把煩惱分成「我能影響」和「暫時不能影響」兩欄。", "給明天的自己留一句具體而溫柔的提醒。"],
  "閱讀與寫作": ["讀兩頁書，摘下一句讓你停下來想一想的話。", "用三句話記錄今天學到的事：事實、感受、下一步。", "挑一個主題自由寫五分鐘，不必急著修改。"],
  "科學探索": ["把今天的一個「為什麼」寫下來，找一個可信來源開始查證。", "用自己的話解釋一個剛學到的概念。", "觀察一個生活現象，先提出假設，再想一個驗證方法。"],
  "科技與 AI": ["找一個重複的小任務，想想科技可以如何替你省下一步。", "讀一則科技消息，分清已發生的事和對未來的預測。", "試用一個新工具十分鐘，記下它真正解決了什麼問題。"],
  "財經與理財": ["選一個常見經濟指標，弄懂它代表什麼、又不代表什麼。", "檢視一筆近期支出，想想它是否符合你重視的事。", "讀財經消息時，找出數字的來源與比較基準，再形成看法。"],
  "職涯與工作": ["把手邊工作拆成最小的下一步，先專注完成十五分鐘。", "記下一項本週學到、下次可以重複使用的工作方法。", "寫下今天最有成就感的一刻，以及它需要哪些能力。"],
  "商業與創業": ["想想你常使用的一項服務，它替人解決了什麼麻煩？", "把一個點子寫成「誰遇到什麼問題，我能怎麼幫忙」。", "觀察一家小店，留意它如何讓顧客願意再次回來。"],
  "設計與靈感": ["挑一個今天用過的介面，想想它讓哪件事更容易。", "把一件麻煩的小事拆成三步，看看哪一步可以更順手。", "找一個喜歡的設計，記下它如何照顧使用者的需要。"],
  "健康與運動": ["起身活動三分鐘，伸展肩頸或走一小段路。", "今天多留意一次身體訊號，安排一小段休息。", "把運動目標縮到容易開始的五分鐘，再決定要不要繼續。"],
  "瑜伽與冥想": ["坐好一分鐘，慢慢數十次呼吸，不需要改變任何感受。", "做一個舒服的伸展，停留在不勉強的範圍。", "短暫放下螢幕，留意身體和周圍的三個聲音。"],
  "美食與料理": ["用手邊食材做一道簡單料理，記下你最喜歡的味道。", "吃下一餐時放慢一點，留意食物的香氣與口感。", "挑一種常用食材，看看它還能有什麼新的搭配。"],
  "旅行與文化": ["找一個陌生城市，花五分鐘了解它的一項日常文化。", "聽一首不同語言的歌，記下最吸引你的一個聲音。", "用一張照片或幾句話記錄你所在地方的生活風景。"],
  "自然與環境": ["出門時留意一種植物、雲或鳥，觀察它一分鐘。", "今天少用一件一次性用品，看看替代方式是否可行。", "打開窗戶感受天氣，寫下一個你注意到的自然變化。"],
  "電影與音樂": ["聽一首歌，專心找出一個以前沒留意的聲音。", "回想一個喜歡的電影場景，它為什麼讓你記得？", "用一段旋律或一句台詞描述今天的心情。"],
  "生活整理": ["整理桌面一個小角落，讓明天開始時少一個阻礙。", "把一件待辦事縮小成兩分鐘能完成的版本。", "替常用物品找一個固定位置，減少下一次尋找時間。"],
  "語言學習": ["學三個和今天生活有關的單字，試著各造一句話。", "聽一段短音檔，先抓大意，再回頭找一個不懂的片語。", "用正在學的語言寫一句今天的日記。"],
  "時事與社會": ["讀一則公共議題報導，找出不同立場各自關心的事。", "看到一項新資訊時，先確認日期、來源和原始資料。", "挑一個社會議題，寫下你還想了解的一個問題。"],
};

const cache = new Map<string, { text: string; source: string; expiresAt: number }>();
type AuthRequest = FastifyRequest & { userId: string };

export async function registerInspirationRoutes(
  app: FastifyInstance,
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
) {
  app.get<{ Querystring: { topic?: string; topics?: string; refresh?: string } }>("/inspiration/today", { preHandler: requireAuth }, async (request: AuthRequest, reply) => {
    const interests = [...new Set((request.query.topics || "").split(",").map((topic) => topic.trim()).filter((topic) => Object.hasOwn(prompts, topic)))].slice(0, 18);
    const topic = request.query.topic && Object.hasOwn(prompts, request.query.topic) ? request.query.topic : interests[0] || "藝術創作";
    const date = new Date().toISOString().slice(0, 10);
    const cacheKey = `${request.userId}:${date}:${interests.join("|")}:${topic}`;
    const current = cache.get(cacheKey);
    if (request.query.refresh !== "1" && current && current.expiresAt > Date.now()) return { topic, text: current.text, date, source: current.source };

    let text: string;
    if (process.env.OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.INSPIRATION_MODEL || "gpt-4.1-mini",
          input: `請用繁體中文，寫一句簡短、溫和、可在 5 到 15 分鐘內開始的「${topic}」學習靈感或行動提示。使用者也選擇了這些興趣：${interests.join("、") || topic}。請呼應興趣，但不要假裝內容來自社群平台，也不要編造新聞、數據、來源或事實。只回傳提示句。`,
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
    const source = process.env.OPENAI_API_KEY ? `AI 每日靈感 · ${topic}` : `每日主題提示 · ${topic}`;
    cache.set(cacheKey, { text, source, expiresAt: Date.now() + 60 * 60_000 });
    return { topic, text, date, source };
  });
}
