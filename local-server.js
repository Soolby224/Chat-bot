const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const PUBLIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/style.css", "style.css"],
  ["/script.js", "script.js"]
]);

loadEnvFile(path.join(ROOT_DIR, ".env"));

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "GET") {
      const filePath = PUBLIC_FILES.get(req.url);
      if (filePath) {
        serveFile(res, path.join(ROOT_DIR, filePath));
        return;
      }
    }

    sendJson(res, 404, { error: "Route introuvable." });
  } catch (error) {
    sendJson(res, 500, { error: "Erreur interne du serveur." });
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`Nova Studio disponible sur http://localhost:${PORT}`);
  });
}

async function handleChat(req, res) {
  if (!process.env.GEMINI_API_KEY) {
    sendJson(res, 500, {
      error: "La variable GEMINI_API_KEY est absente. Ajoute-la dans un fichier .env."
    });
    return;
  }

  const body = await readJson(req);
  const incomingMessages = Array.isArray(body.messages) ? body.messages : [];

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const contents = incomingMessages
    .filter((message) => isValidMessage(message))
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content) }]
    }));

  if (contents.length === 0) {
    sendJson(res, 400, { error: "Aucun message utilisateur a envoyer." });
    return;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
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
      })
    }
  );

  const rawText = await response.text();
  let payload = {};

  try {
    payload = JSON.parse(rawText);
  } catch (error) {
    payload = { raw: rawText };
  }

  if (!response.ok) {
    const apiMessage =
      payload?.error?.message ||
      payload?.message ||
      "L API Gemini a retourne une erreur.";

    sendJson(res, response.status, { error: apiMessage });
    return;
  }

  const reply = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!reply) {
    sendJson(res, 502, { error: "Reponse vide recue depuis Gemini." });
    return;
  }

  sendJson(res, 200, {
    reply,
    model
  });
}

function isValidMessage(message) {
  return (
    message &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim() !== ""
  );
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Fichier introuvable." });
      return;
    }

    const extension = path.extname(filePath);
    const type =
      extension === ".html"
        ? "text/html; charset=utf-8"
        : extension === ".css"
          ? "text/css; charset=utf-8"
          : extension === ".js"
            ? "application/javascript; charset=utf-8"
            : "text/plain; charset=utf-8";

    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Exporter les fonctions pour les tests unitaires
if (process.env.NODE_ENV === "test") {
  module.exports = { isValidMessage, loadEnvFile, server, handleChat };
}
