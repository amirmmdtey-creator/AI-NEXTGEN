// Secure AI endpoint for AI NEXTGEN (Netlify Function)
// Set OPENAI_API_KEY in Netlify site environment variables.
// Never place the API key in index.html or any public JavaScript file.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "درخواست نامعتبر است." }, 405);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({
      error: "کلید اتصال هوش مصنوعی هنوز در تنظیمات امن Netlify ثبت نشده است."
    }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "متن ارسالی قابل خواندن نیست." }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "پیامی برای ارسال وجود ندارد." }, 400);
  }

  const messages = body.messages
    .slice(-24)
    .filter((m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim().length > 0
    )
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, 5000),
    }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "آخرین پیام معتبر نیست؛ دوباره تلاش کن." }, 400);
  }

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars > 18000) {
    return json({ error: "گفت‌وگو خیلی طولانی است. یک گفت‌وگوی جدید بساز." }, 413);
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions:
          "You are NEXTGEN AI, the helpful Persian-language assistant inside the AI NEXTGEN website. " +
          "Reply in the user's language, usually clear and friendly Persian. " +
          "Be accurate, age-appropriate, and explain things simply. " +
          "If you are unsure, say so. Do not claim you performed actions you did not perform.",
        input: messages,
        store: false,
        max_output_tokens: 1200,
      }),
      signal: AbortSignal.timeout(45000),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      // Do not expose provider response details or credentials to visitors.
      console.error("OpenAI API returned status:", upstream.status);
      if (upstream.status === 401) {
        return json({ error: "کلید API معتبر نیست. مدیر سایت باید تنظیمات کلید را بررسی کند." }, 502);
      }
      if (upstream.status === 429) {
        return json({ error: "سرویس فعلاً محدودیت درخواست یا اعتبار دارد. کمی بعد دوباره امتحان کن." }, 429);
      }
      return json({ error: "سرویس هوش مصنوعی موقتاً پاسخ نداد. کمی بعد دوباره تلاش کن." }, 502);
    }

    const reply = (data.output || [])
      .flatMap((item) => item.content || [])
      .filter((part) => part.type === "output_text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();

    if (!reply) {
      return json({ error: "پاسخ خالی دریافت شد؛ دوباره تلاش کن." }, 502);
    }
    return json({ reply });
  } catch (error) {
    console.error("AI function error:", error?.name || "UnknownError");
    return json({ error: "ارتباط با سرویس هوش مصنوعی برقرار نشد. بعداً دوباره تلاش کن." }, 502);
  }
};

export const config = {
  path: "/api/chat",
};
