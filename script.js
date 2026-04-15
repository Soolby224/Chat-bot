(function () {
  const form = document.querySelector(".composer-card");
  const landingShell = document.querySelector(".landing-shell");
  const textarea = document.getElementById("prompt");
  const thread = document.getElementById("chatThread");
  const sendButton = document.querySelector(".send-btn");
  const statusText = document.getElementById("statusText");
  const promptButtons = document.querySelectorAll(".prompt-row button");
  const attachButton = document.getElementById("attachButton");
  const fileInput = document.getElementById("fileInput");
  const attachmentPanel = document.getElementById("attachmentPanel");
  const attachmentList = document.getElementById("attachmentList");
  const apiUrl = "/api/chat";

  const conversation = [];
  const pendingFiles = [];
  const supportedExtensions = new Set([
    "txt",
    "md",
    "markdown",
    "csv",
    "json",
    "js",
    "ts",
    "tsx",
    "jsx",
    "py",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "html",
    "css",
    "xml",
    "yml",
    "yaml",
    "log",
    "sql",
    "php",
    "rb",
    "go",
    "rs",
    "sh"
  ]);

  const MAX_FILES = 5;
  const MAX_FILE_CHARS = 60000;
  const MAX_TOTAL_FILE_CHARS = 180000;

  let isSending = false;
  let fileId = 0;

  if (
    !form ||
    !landingShell ||
    !textarea ||
    !thread ||
    !sendButton ||
    !statusText ||
    !attachButton ||
    !fileInput ||
    !attachmentPanel ||
    !attachmentList
  ) {
    return;
  }

  const autoResize = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 260)}px`;
  };

  const setStatus = (message) => {
    statusText.textContent = message;
  };

  const updateConversationState = () => {
    landingShell.classList.toggle("has-conversation", !thread.hidden);
  };

  const updateSendState = () => {
    const hasPayload = textarea.value.trim() !== "" || pendingFiles.length > 0;
    sendButton.disabled = isSending || !hasPayload;
    sendButton.classList.toggle("ready", hasPayload && !isSending);
  };

  const escapeHtml = (value) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const formatInline = (value) =>
    escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  const renderRichText = (value) => {
    const lines = value.replace(/\r/g, "").split("\n");
    const html = [];
    let inList = false;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);

      if (bulletMatch) {
        if (!inList) {
          html.push("<ul>");
          inList = true;
        }
        html.push(`<li>${formatInline(bulletMatch[1])}</li>`);
        continue;
      }

      if (inList) {
        html.push("</ul>");
        inList = false;
      }

      if (line.trim() === "") {
        continue;
      }

      html.push(`<p>${formatInline(line)}</p>`);
    }

    if (inList) {
      html.push("</ul>");
    }

    return html.join("") || "<p></p>";
  };

  const formatFileSize = (size) => {
    if (size < 1024) {
      return `${size} o`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} Ko`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const totalAttachedChars = () =>
    pendingFiles.reduce((total, file) => total + file.text.length, 0);

  const createFileBadge = (file, removable) => {
    const pill = document.createElement("div");
    pill.className = removable ? "attachment-pill" : "message-file";

    const name = document.createElement("span");
    name.className = removable ? "attachment-name" : "message-name";
    name.textContent = file.name;

    const meta = document.createElement("span");
    meta.className = removable ? "attachment-size" : "file-meta";
    meta.textContent = `${formatFileSize(file.size)}${file.truncated ? " - tronque" : ""}`;

    pill.appendChild(name);
    pill.appendChild(meta);

    if (removable) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "attachment-remove";
      removeButton.setAttribute("aria-label", `Retirer ${file.name}`);
      removeButton.dataset.fileId = String(file.id);
      removeButton.textContent = "x";
      pill.appendChild(removeButton);
    }

    return pill;
  };

  const renderAttachmentPanel = () => {
    attachmentList.innerHTML = "";
    attachmentPanel.hidden = pendingFiles.length === 0;

    for (const file of pendingFiles) {
      attachmentList.appendChild(createFileBadge(file, true));
    }

    updateSendState();
  };

  const addMessage = (role, options) => {
    const { content = "", html = "", attachments = [], extraClass = "" } = options;
    const message = document.createElement("article");
    message.className = `chat-message ${role} ${extraClass}`.trim();

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.innerHTML = html || renderRichText(content);

    if (attachments.length > 0) {
      const filesRow = document.createElement("div");
      filesRow.className = "message-files";

      for (const file of attachments) {
        filesRow.appendChild(createFileBadge(file, false));
      }

      bubble.appendChild(filesRow);
    }

    message.appendChild(bubble);
    thread.hidden = false;
    thread.appendChild(message);
    updateConversationState();
    message.scrollIntoView({ behavior: "smooth", block: "end" });
    return message;
  };

  const createLoadingMessage = () =>
    addMessage("assistant", {
      html:
        '<div class="typing-row"><span class="typing-label">Nova redige sa reponse</span><span class="typing-dots"><span></span><span></span><span></span></span></div>',
      extraClass: "loading"
    });

  const parseApiResponse = async (response) => {
    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(rawText);
      } catch {
        throw new Error("La reponse JSON du serveur est invalide.");
      }
    }

    if (rawText.trim().startsWith("<")) {
      throw new Error(
        "Le site en ligne ne fournit pas l'API /api/chat. Cette page est probablement ouverte sur GitHub Pages au lieu d'un hebergement avec backend."
      );
    }

    throw new Error(rawText || "La reponse du serveur est invalide.");
  };

  const isReadableFile = (file) => {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    return file.type.startsWith("text/") || supportedExtensions.has(extension);
  };

  const loadAttachment = async (file) => {
    if (!isReadableFile(file)) {
      throw new Error(`${file.name} n'est pas un format texte pris en charge.`);
    }

    if (pendingFiles.length >= MAX_FILES) {
      throw new Error(`Maximum ${MAX_FILES} fichiers par envoi.`);
    }

    const remainingChars = MAX_TOTAL_FILE_CHARS - totalAttachedChars();
    if (remainingChars <= 0) {
      throw new Error("La limite totale des fichiers est deja atteinte.");
    }

    const rawText = await file.text();
    const normalized = rawText.trim();

    if (!normalized) {
      throw new Error(`${file.name} est vide.`);
    }

    const safeChars = Math.min(MAX_FILE_CHARS, remainingChars);
    const truncated = normalized.length > safeChars;

    return {
      id: ++fileId,
      name: file.name,
      size: file.size,
      text: normalized.slice(0, safeChars),
      truncated
    };
  };

  const handleSelectedFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return;
    }

    const messages = [];

    for (const file of files) {
      try {
        const preparedFile = await loadAttachment(file);
        pendingFiles.push(preparedFile);
        messages.push(`${preparedFile.name} ajoute.`);
      } catch (error) {
        messages.push(error.message);
      }
    }

    renderAttachmentPanel();
    setStatus(messages[messages.length - 1] || "Fichiers ajoutes.");
  };

  const buildOutgoingMessage = (content, files) => {
    const visibleContent = content || "Analyse les fichiers joints.";
    const parts = [];

    if (content) {
      parts.push(content);
    } else {
      parts.push("Analyse les fichiers joints et reponds en francais.");
    }

    if (files.length > 0) {
      parts.push("Fichiers a prendre en compte :");
      for (const file of files) {
        parts.push(
          `[Fichier: ${file.name}]\n${file.text}${
            file.truncated ? "\n[Contenu tronque pour rester dans les limites.]" : ""
          }\n[/Fichier]`
        );
      }
    }

    return {
      visibleContent,
      payloadContent: parts.join("\n\n")
    };
  };

  const sendMessage = async (content) => {
    const filesForMessage = pendingFiles.map((file) => ({ ...file }));
    const hasPayload = content.trim() !== "" || filesForMessage.length > 0;

    if (!hasPayload || isSending) {
      return;
    }

    const { visibleContent, payloadContent } = buildOutgoingMessage(content.trim(), filesForMessage);

    isSending = true;
    conversation.push({ role: "user", content: payloadContent });
    addMessage("user", {
      content: visibleContent,
      attachments: filesForMessage,
      extraClass: "reply"
    });

    textarea.value = "";
    autoResize();
    updateSendState();
    setStatus("Envoi...");

    const loadingMessage = createLoadingMessage();

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: conversation
        })
      });

      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "La requete a echoue.");
      }

      const reply = data.reply || "Je n'ai pas recu de reponse exploitable.";
      conversation.push({ role: "assistant", content: reply });
      loadingMessage.remove();
      addMessage("assistant", {
        content: reply,
        extraClass: "reply"
      });

      pendingFiles.length = 0;
      renderAttachmentPanel();
      setStatus("Reponse recue");
    } catch (error) {
      loadingMessage.remove();
      conversation.pop();
      addMessage("assistant", {
        content: `Erreur: ${error.message}`,
        extraClass: "reply"
      });
      setStatus("API indisponible");
      textarea.value = content;
      autoResize();
    } finally {
      isSending = false;
      updateSendState();
      textarea.focus();
    }
  };

  attachmentList.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".attachment-remove");
    if (!removeButton) {
      return;
    }

    const { fileId: targetId } = removeButton.dataset;
    const index = pendingFiles.findIndex((file) => String(file.id) === targetId);
    if (index !== -1) {
      pendingFiles.splice(index, 1);
      renderAttachmentPanel();
      setStatus(pendingFiles.length ? "Fichiers mis a jour." : "Pret");
    }
  });

  attachButton.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async (event) => {
    await handleSelectedFiles(event.target.files);
    fileInput.value = "";
  });

  form.addEventListener("dragover", (event) => {
    event.preventDefault();
    form.classList.add("dragover");
  });

  form.addEventListener("dragleave", (event) => {
    if (event.currentTarget === event.target) {
      form.classList.remove("dragover");
    }
  });

  form.addEventListener("drop", async (event) => {
    event.preventDefault();
    form.classList.remove("dragover");
    await handleSelectedFiles(event.dataTransfer.files);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendMessage(textarea.value);
  });

  textarea.addEventListener("input", () => {
    autoResize();
    updateSendState();
  });

  textarea.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage(textarea.value);
    }
  });

  promptButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      textarea.value = button.textContent.trim();
      autoResize();
      updateSendState();
      await sendMessage(textarea.value);
    });
  });

  autoResize();
  updateSendState();
  updateConversationState();
})();
