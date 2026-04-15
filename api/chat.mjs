export function GET() {
  return jsonResponse(
    {
      ok: true,
      message: "API chat disponible. Utilise POST /api/chat."
    },
    200
  );
}

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      { error: "La variable GEMINI_API_KEY est absente dans Vercel." },
      500
    );
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Le corps de la requete est invalide." }, 400);
  }

  const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const contents = incomingMessages
    .filter(isValidMessage)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content) }]
    }));

  if (contents.length === 0) {
    return jsonResponse({ error: "Aucun message utilisateur a envoyer." }, 400);
  }

  let response;

  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "Tu es Nova, un assistant francophone clair, utile et concis. Tu reponds avec un ton naturel et professionnel."
              }
            ]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
          }
        }),
        signal: AbortSignal.timeout(20000)
      }
    );
  } catch (error) {
    return jsonResponse(
      {
        error:
          error?.name === "TimeoutError"
            ? "Gemini met trop de temps a repondre."
            : "Impossible de joindre l API Gemini."
      },
      504
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return jsonResponse({ error: "Reponse Gemini invalide." }, 502);
  }

  if (!response.ok) {
    const apiMessage =
      payload?.error?.message ||
      payload?.message ||
      "L API Gemini a retourne une erreur.";

    return jsonResponse({ error: apiMessage }, response.status);
  }

  const reply = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!reply) {
    return jsonResponse({ error: "Reponse vide recue depuis Gemini." }, 502);
  }

  return jsonResponse({ reply, model }, 200);
}

function isValidMessage(message) {
  return (
    message &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim() !== ""
  );
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
