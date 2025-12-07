(() => {
  const ADMIN_EMAILS = [
    "amitshalev1510@gmail.com"
  ];

  const PAGE_ID = document.body?.dataset?.pageId || "default";
  const EDITABLE_SELECTOR = "[data-editable-block]";
  const SUPPORTED_PAGES = new Set(["home", "book"]);
  const FONT_SIZE_OPTIONS = [
    { key: "normal", label: "Normal", size: "inherit" },
    { key: "small", label: "Small", size: "0.9em" },
    { key: "large", label: "Large", size: "1.2em" },
    { key: "xlarge", label: "Extra large", size: "1.4em" }
  ];

  if (!SUPPORTED_PAGES.has(PAGE_ID)) {
    return;
  }

  const editableBlocks = Array.from(document.querySelectorAll(EDITABLE_SELECTOR))
    .map((element) => ({ key: element.dataset.editableBlock, element }))
    .filter((entry) => Boolean(entry.key && entry.element));

  if (!editableBlocks.length) {
    return;
  }

  let db;
  let docFn;
  let getDocFn;
  let setDocFn;
  let auth;
  let onAuthFn;
  let docRef;
  let currentAdminUser = null;
  let latestContent = {};
  let editing = false;
  let dirty = false;
  let loadInFlight = null;

  let toolbarEl = null;
  let toggleBtn = null;
  let saveBtn = null;
  let statusEl = null;
  let formattingControls = [];
  let fontSizeSelect = null;

  const beforeUnloadHandler = (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  };

  function sanitizeUrl(input) {
    if (typeof input !== "string") return "";
    let normalized = input.trim();
    if (!normalized) return "";
    if (/^mailto:/i.test(normalized)) {
      return normalized;
    }
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    try {
      const url = new URL(normalized);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString();
      }
    } catch (_error) {
      return "";
    }
    return "";
  }

  function ensureSelection(requireRange = true) {
    if (!editing) {
      setStatus("Enter edit mode to format text", "warning");
      return null;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setStatus("Select text inside an editable block", "warning");
      return null;
    }
    const range = selection.getRangeAt(0);
    if (requireRange && range.collapsed) {
      setStatus("Highlight text before applying formatting", "warning");
      return null;
    }
    const container = range.commonAncestorContainer;
    const insideEditable = editableBlocks.some(({ element }) => element.contains(container));
    if (!insideEditable) {
      setStatus("Selection must be inside an editable block", "warning");
      return null;
    }
    return { selection, range };
  }

  function applyExecCommand(command, value = null, requireRange = false) {
    const selectionData = ensureSelection(!requireRange ? false : true);
    if (!selectionData) {
      return false;
    }
    document.execCommand(command, false, value);
    markDirty();
    return true;
  }

  function wrapSelectionWithStyles(styleMap = {}) {
    const selectionData = ensureSelection(true);
    if (!selectionData) {
      return false;
    }
    const { selection, range } = selectionData;
    const fragment = range.extractContents();
    const wrapper = document.createElement("span");
    Object.entries(styleMap).forEach(([key, value]) => {
      if (value && typeof value === "string") {
        wrapper.style[key] = value;
      }
    });
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    selection.addRange(newRange);
    markDirty();
    return true;
  }

  function applyFontSize(sizeKey) {
    const option = FONT_SIZE_OPTIONS.find((entry) => entry.key === sizeKey);
    if (!option) {
      return;
    }
    wrapSelectionWithStyles({ fontSize: option.size });
  }

  function setFormattingEnabled(enabled) {
    formattingControls.forEach((control) => {
      control.disabled = !enabled;
    });
    if (fontSizeSelect) {
      fontSizeSelect.disabled = !enabled;
      if (!enabled) {
        fontSizeSelect.value = "";
      }
    }
  }

  function waitForFirebase(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      function check() {
        const ready = Boolean(
          window.firebaseDb &&
          window.firestoreDoc &&
          window.firestoreGetDoc &&
          window.firestoreSetDoc &&
          window.firebaseAuth &&
          window.firebaseOnAuth
        );

        if (ready) {
          resolve();
          return;
        }

        if (Date.now() - start > timeoutMs) {
          reject(new Error("Firebase failed to initialize in time"));
          return;
        }

        setTimeout(check, 50);
      }

      check();
    });
  }

  function isAdminUser(user, profile) {
    if (!user) return false;

    const normalizedEmail = (user.email || "").toLowerCase();
    if (ADMIN_EMAILS.includes(normalizedEmail)) return true;

    if (profile) {
      if (profile.isAdmin === true) return true;
      if (profile.admin === true) return true;

      if (typeof profile.role === "string" && profile.role.toLowerCase() === "admin") {
        return true;
      }

      if (Array.isArray(profile.roles)) {
        const hasAdminRole = profile.roles
          .map((role) => (role || "").toLowerCase())
          .includes("admin");
        if (hasAdminRole) return true;
      }
    }

    return false;
  }

  function setStatus(message, tone = "info") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove("ok", "warning", "error");

    if (tone === "ok" || tone === "warning" || tone === "error") {
      statusEl.classList.add(tone);
    }
  }

  function markDirty() {
    if (!editing) return;
    dirty = true;
    if (saveBtn) {
      saveBtn.disabled = false;
    }
    setStatus("Unsaved changes", "warning");
  }

  function enableEditing() {
    if (editing) return;
    editing = true;
    document.body.classList.add("page-edit-mode");
    window.addEventListener("beforeunload", beforeUnloadHandler);

    editableBlocks.forEach((block) => {
      const { element } = block;
      if (!element) return;

      block.listener = () => markDirty();
      element.setAttribute("contenteditable", "true");
      element.classList.add("page-editor-active");
      element.addEventListener("input", block.listener);
    });

    dirty = false;
    if (saveBtn) {
      saveBtn.disabled = true;
    }
    setStatus("Editing...", "info");
    setFormattingEnabled(true);
  }

  function disableEditing({ discardChanges } = { discardChanges: false }) {
    if (!editing) return;

    if (dirty && discardChanges) {
      applyContent(latestContent, { skipStatus: true });
    }

    editing = false;
    dirty = false;
    document.body.classList.remove("page-edit-mode");
    window.removeEventListener("beforeunload", beforeUnloadHandler);

    editableBlocks.forEach((block) => {
      const { element } = block;
      if (!element) return;

      element.removeAttribute("contenteditable");
      element.classList.remove("page-editor-active");

      if (block.listener) {
        element.removeEventListener("input", block.listener);
        block.listener = null;
      }
    });

    if (saveBtn) {
      saveBtn.disabled = true;
    }
    setStatus("Edit mode off", "info");
    setFormattingEnabled(false);
  }

  function gatherBlockData() {
    const payload = {};
    editableBlocks.forEach(({ key, element }) => {
      if (!key || !element) return;
      payload[key] = element.innerHTML.trim();
    });
    return payload;
  }

  function formatTimestamp(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function applyContent(data = {}, options = {}) {
    const { skipStatus = false } = options;

    editableBlocks.forEach(({ key, element }) => {
      if (!element || !key) return;
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = data[key];
        if (typeof value === "string") {
          element.innerHTML = value;
        }
      }
    });

    latestContent = {
      ...latestContent,
      ...data
    };

    if (!skipStatus && statusEl && data._lastUpdatedAt) {
      const formatted = formatTimestamp(data._lastUpdatedAt);
      setStatus(`Last updated ${formatted}`, "info");
    }
  }

  async function loadStoredContent() {
    if (!docRef || !getDocFn) return null;
    if (loadInFlight) return loadInFlight;

    loadInFlight = getDocFn(docRef)
      .then((snapshot) => {
        if (snapshot?.exists()) {
          const data = snapshot.data();
          applyContent(data);
          return data;
        }
        return null;
      })
      .catch((error) => {
        console.warn("Page editor: failed to load stored content", error);
        return null;
      })
      .finally(() => {
        loadInFlight = null;
      });

    return loadInFlight;
  }

  async function saveChanges() {
    if (!editing || !currentAdminUser || !docRef || !setDocFn) {
      return;
    }

    const payload = gatherBlockData();
    payload._lastUpdatedAt = new Date().toISOString();
    payload._lastUpdatedBy = currentAdminUser.email || currentAdminUser.uid;

    try {
      setStatus("Saving...", "info");
      if (saveBtn) {
        saveBtn.disabled = true;
      }

      await setDocFn(docRef, payload, { merge: true });

      dirty = false;
      latestContent = {
        ...latestContent,
        ...payload
      };

      const formatted = formatTimestamp(payload._lastUpdatedAt);
      setStatus(`Saved ${formatted}`, "ok");
    } catch (error) {
      console.error("Page editor: save failed", error);
      setStatus("Save failed", "error");
      if (saveBtn) {
        saveBtn.disabled = false;
      }
    }
  }

  function teardownEditor() {
    disableEditing({ discardChanges: true });

    if (toolbarEl) {
      toolbarEl.remove();
      toolbarEl = null;
      toggleBtn = null;
      saveBtn = null;
      statusEl = null;
      formattingControls = [];
      fontSizeSelect = null;
    }

    currentAdminUser = null;
  }

  function ensureToolbar() {
    if (toolbarEl) return;

    toolbarEl = document.createElement("div");
    toolbarEl.className = "page-editor-bar";

    const controlsGroup = document.createElement("div");
    controlsGroup.className = "page-editor-group";

    toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn secondary page-editor-toggle";
    toggleBtn.textContent = "Enter Edit Mode";

    saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn primary page-editor-save";
    saveBtn.textContent = "Save Changes";
    saveBtn.disabled = true;

    controlsGroup.append(toggleBtn, saveBtn);

    const formatGroup = document.createElement("div");
    formatGroup.className = "page-editor-tools";

    const createToolButton = (options) => {
      const { label, title, className = "", action } = options;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `btn tertiary page-editor-tool ${className}`.trim();
      button.textContent = label;
      button.title = title;
      button.disabled = true;
      button.addEventListener("click", () => {
        if (typeof action === "function") {
          action();
        }
      });
      formattingControls.push(button);
      return button;
    };

    formattingControls = [];

    const boldBtn = createToolButton({ label: "B", title: "Bold", className: "page-editor-tool-bold", action: () => applyExecCommand("bold") });
    const italicBtn = createToolButton({ label: "I", title: "Italic", className: "page-editor-tool-italic", action: () => applyExecCommand("italic") });
    const underlineBtn = createToolButton({ label: "U", title: "Underline", className: "page-editor-tool-underline", action: () => applyExecCommand("underline") });
    const linkBtn = createToolButton({
      label: "Link",
      title: "Add hyperlink",
      action: () => {
        const selectionData = ensureSelection(true);
        if (!selectionData) return;
        const urlInput = window.prompt("Enter a URL", "https://");
        if (!urlInput) return;
        const sanitized = sanitizeUrl(urlInput);
        if (!sanitized) {
          setStatus("Provide a valid http(s) or mailto link", "error");
          return;
        }
        document.execCommand("createLink", false, sanitized);
        markDirty();
      }
    });
    const unlinkBtn = createToolButton({ label: "Unlink", title: "Remove hyperlink", action: () => applyExecCommand("unlink") });
    const clearFormatBtn = createToolButton({ label: "Clear", title: "Remove formatting", action: () => applyExecCommand("removeFormat", null, true) });

    fontSizeSelect = document.createElement("select");
    fontSizeSelect.className = "page-editor-font-size";
    fontSizeSelect.disabled = true;
    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Font size";
    fontSizeSelect.appendChild(placeholderOption);
    FONT_SIZE_OPTIONS.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.key;
      opt.textContent = option.label;
      fontSizeSelect.appendChild(opt);
    });
    fontSizeSelect.addEventListener("change", (event) => {
      const value = event.target.value;
      if (!value) {
        return;
      }
      applyFontSize(value);
      event.target.value = "";
    });

    formattingControls.push(fontSizeSelect);

    formatGroup.append(boldBtn, italicBtn, underlineBtn, linkBtn, unlinkBtn, clearFormatBtn, fontSizeSelect);

    statusEl = document.createElement("span");
    statusEl.className = "page-editor-status";
    statusEl.textContent = "Editor ready";

    toolbarEl.append(controlsGroup, formatGroup, statusEl);
    document.body.appendChild(toolbarEl);

    toggleBtn.addEventListener("click", async () => {
      if (!editing) {
        enableEditing();
        toggleBtn.textContent = "Exit Edit Mode";
        return;
      }

      if (dirty) {
        const confirmDiscard = window.confirm("Discard unsaved changes?");
        if (!confirmDiscard) return;
      }

      disableEditing({ discardChanges: dirty });
      toggleBtn.textContent = "Enter Edit Mode";
    });

    saveBtn.addEventListener("click", () => {
      if (dirty) {
        void saveChanges();
      }
    });

    setFormattingEnabled(false);
  }

  function setupEditor(profile) {
    if (!currentAdminUser) return;
    ensureToolbar();

    if (latestContent && latestContent._lastUpdatedAt) {
      const formatted = formatTimestamp(latestContent._lastUpdatedAt);
      setStatus(`Last updated ${formatted}`, "info");
    } else {
      setStatus("Editor ready", "info");
    }
  }

  waitForFirebase()
    .then(() => {
      db = window.firebaseDb;
      docFn = window.firestoreDoc;
      getDocFn = window.firestoreGetDoc;
      setDocFn = window.firestoreSetDoc;
      auth = window.firebaseAuth;
      onAuthFn = window.firebaseOnAuth;

      if (!db || !docFn || !getDocFn) {
        throw new Error("Page editor: missing Firebase dependencies");
      }

      docRef = docFn(db, "pageContent", PAGE_ID);

      void loadStoredContent();

      if (!auth || !onAuthFn) {
        throw new Error("Page editor: auth not available");
      }

      onAuthFn(auth, async (user) => {
        if (!user) {
          teardownEditor();
          return;
        }

        let profile = null;
        try {
          const profileRef = docFn(db, "users", user.uid);
          const profileSnap = await getDocFn(profileRef);
          if (profileSnap?.exists()) {
            profile = profileSnap.data();
          }
        } catch (error) {
          console.warn("Page editor: failed to load user profile", error);
        }

        if (!isAdminUser(user, profile)) {
          teardownEditor();
          return;
        }

        currentAdminUser = user;
        setupEditor(profile);
      });
    })
    .catch((error) => {
      console.warn("Page editor unavailable", error);
    });
})();
