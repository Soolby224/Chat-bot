(function () {
  const form = document.querySelector(".composer-card");
  const textarea = document.getElementById("prompt");
  const thread = document.getElementById("chatThread");
  const sendButton = document.querySelector(".send-btn");
  const statusText = document.getElementById("statusText");
  const promptButtons = document.querySelectorAll(".prompt-row button");

  const conversation = [];
  let isSending = false;

  if (!form || !textarea || !thread || !sendButton || !statusText) {
    return;
  }

  const autoResize = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 260)}px`;
  };

  const setStatus = (message) => {
    statusText.textContent = message;
  };

  const addMessage = (role, content, extraClass = "") => {
    const message = document.createElement("article");
    message.className = `chat-message ${role} ${extraClass}`.trim();

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = content;

    message.appendChild(bubble);
    thread.hidden = false;
    thread.appendChild(message);
    message.scrollIntoView({ behavior: "smooth", block: "end" });
    return message;
  };

  const sendMessage = async (content) => {
    if (!content || isSending) {
      return;
    }

    isSending = true;
    sendButton.disabled = true;
    setStatus("Envoi...");

    conversation.push({ role: "user", content });
    addMessage("user", content);

    const loadingMessage = addMessage("assistant", "Nova reflechit...", "loading");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: conversation
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "La requete a echoue.");
      }

      const reply = data.reply || "Je n'ai pas recu de reponse exploitable.";
      conversation.push({ role: "assistant", content: reply });
      loadingMessage.remove();
      addMessage("assistant", reply);
      setStatus("Connecte a Gemini");
    } catch (error) {
      loadingMessage.remove();
      addMessage("assistant", `Erreur: ${error.message}`);
      setStatus("API indisponible");
    } finally {
      isSending = false;
      sendButton.disabled = false;
      textarea.value = "";
      autoResize();
      textarea.focus();
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = textarea.value.trim();
    await sendMessage(content);
  });

  textarea.addEventListener("input", autoResize);
  textarea.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const content = textarea.value.trim();
      await sendMessage(content);
    }
  });

  promptButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const content = button.textContent.trim();
      textarea.value = content;
      autoResize();
      await sendMessage(content);
    });
  });

  autoResize();
})();
