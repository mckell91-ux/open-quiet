const form = document.querySelector("#feelingForm");
const textarea = document.querySelector("#feelingText");
const charCount = document.querySelector("#charCount");
const clearButton = document.querySelector("#clearButton");
const messageWell = document.querySelector("#messageWell");
const feedList = document.querySelector("#feedList");
const postTemplate = document.querySelector("#postTemplate");
const archiveCard = document.querySelector("#archiveCard");
const shuffleArchive = document.querySelector("#shuffleArchive");
const letterForm = document.querySelector("#letterForm");
const letterList = document.querySelector("#letterList");
const capsuleForm = document.querySelector("#capsuleForm");
const capsuleList = document.querySelector("#capsuleList");
const privateItemTemplate = document.querySelector("#privateItemTemplate");

const storageKeys = {
  privateReleases: "open-quiet-private-releases",
  letters: "open-quiet-unsent-letters",
  capsules: "open-quiet-time-capsules"
};

const moodLabels = {
  heavy: "Heavy",
  angry: "Angry",
  lonely: "Lonely",
  hopeful: "Hopeful"
};

const comfortPhrases = [
  "You're not alone.",
  "I hear you.",
  "That sounds heavy."
];

const supabaseConfig = window.LEAVE_IT_HERE_SUPABASE || {};
const isSupabaseConfigured = Boolean(
  window.supabase &&
  supabaseConfig.url &&
  supabaseConfig.anonKey &&
  !supabaseConfig.url.includes("PASTE_") &&
  !supabaseConfig.anonKey.includes("PASTE_")
);
const supabaseClient = isSupabaseConfigured
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;
const sessionClientToken = crypto.randomUUID ? crypto.randomUUID() : `client-${Date.now()}-${Math.random()}`;
let lastShareAt = 0;

// Public shared posts use Supabase when configured. Private releases stay local only.
const quietStore = {
  async listSharedPosts() {
    requireSupabase();

    const { data, error } = await supabaseClient
      .from("feelings")
      .select("id,text,mood,created_at,reported_count,comfort_count")
      .eq("approved", true)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      console.error("Could not load shared feelings", error);
      throw new Error("Supabase read failed. Shared feelings are not connected yet.");
    }

    return data.map(formatRemotePost);
  },

  async addSharedPost(post) {
    requireSupabase();

    if (isClientRateLimited()) {
      throw new Error("Please wait a minute before sharing another feeling.");
    }

    const { data, error } = await supabaseClient.rpc("submit_feeling", {
      feeling_text: post.text,
      feeling_mood: post.mood,
      client_token: sessionClientToken
    });

    if (error) {
      throw new Error(error.message || "Could not share this feeling.");
    }

    lastShareAt = Date.now();
    return formatRemotePost(Array.isArray(data) ? data[0] : data);
  },

  async addPrivateRelease(release) {
    const releases = readJson(storageKeys.privateReleases, []);
    writeJson(storageKeys.privateReleases, [release, ...releases].slice(0, 20));
    return release;
  },

  async listReportedPostIds() {
    return [];
  },

  async reportPost(id) {
    requireSupabase();

    const { error } = await supabaseClient.rpc("report_feeling", {
      feeling_id: id,
      client_token: sessionClientToken
    });

    if (error) {
      throw new Error(error.message || "Supabase report failed.");
    }
  },

  async listComfortEvents() {
    return [];
  },

  async addComfortEvent(event) {
    requireSupabase();

    const { error } = await supabaseClient.rpc("send_comfort", {
      feeling_id: event.postId,
      comfort_phrase: event.phrase,
      client_token: sessionClientToken
    });

    if (error) {
      throw new Error(error.message || "Supabase comfort failed.");
    }
  },

  async listLetters() {
    return readJson(storageKeys.letters, []);
  },

  async addLetter(letter) {
    const letters = await this.listLetters();
    writeJson(storageKeys.letters, [letter, ...letters].slice(0, 10));
  },

  async listCapsules() {
    return readJson(storageKeys.capsules, []);
  },

  async addCapsule(capsule) {
    const capsules = await this.listCapsules();
    writeJson(storageKeys.capsules, [capsule, ...capsules].slice(0, 20));
  }
};

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function requireSupabase() {
  if (!supabaseClient) {
    throw new Error("Supabase is not connected. Check supabase-config.js and run the Supabase SQL setup.");
  }
}

function formatRemotePost(post) {
  return {
    id: post.id,
    text: post.text,
    mood: post.mood,
    createdAt: post.createdAt || nowLabelFromDate(post.created_at || post.createdAt),
    reportedCount: post.reported_count || 0,
    comfortCount: post.comfort_count || 0
  };
}

function nowLabelFromDate(value) {
  if (!value) {
    return "Quietly shared";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function isClientRateLimited() {
  return lastShareAt && Date.now() - lastShareAt < 60_000;
}

function selectedMood() {
  return new FormData(form).get("mood") || "heavy";
}

function selectedFilter() {
  return document.querySelector("input[name='filter']:checked")?.value || "all";
}

function nowLabel() {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
}

function dateLabel(dateValue) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(dateValue));
}

function createPost(text, mood) {
  return {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    mood,
    createdAt: nowLabel()
  };
}

function updateCount() {
  charCount.textContent = textarea.value.length;
}

function showReleaseMessage(text, mode) {
  messageWell.classList.remove("releasing");
  messageWell.innerHTML = "";

  const message = document.createElement("p");
  message.textContent = mode === "share"
    ? "Shared anonymously. It is now one quiet note among others."
    : text;
  messageWell.append(message);

  requestAnimationFrame(() => {
    messageWell.classList.add("releasing");
  });

  window.setTimeout(() => {
    messageWell.classList.remove("releasing");
    messageWell.innerHTML = "<p>It is out of you for now. Take one slower breath.</p>";
  }, 2300);
}

async function renderFeed() {
  let posts;
  let reportedIds;
  let comfortEvents;

  try {
    [posts, reportedIds, comfortEvents] = await Promise.all([
      quietStore.listSharedPosts(),
      quietStore.listReportedPostIds(),
      quietStore.listComfortEvents()
    ]);
  } catch (error) {
    showFeedError(error.message);
    return;
  }

  const reportedSet = new Set(reportedIds);
  const comfortSet = new Set(comfortEvents.map((event) => `${event.postId}:${event.phrase}`));
  const filter = selectedFilter();
  const visiblePosts = filter === "all" ? posts : posts.filter((post) => post.mood === filter);

  feedList.innerHTML = "";

  if (!visiblePosts.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No shared feelings in this mood yet.";
    feedList.append(empty);
    return;
  }

  visiblePosts.forEach((post) => {
    const node = postTemplate.content.firstElementChild.cloneNode(true);
    const isReported = reportedSet.has(post.id);

    node.classList.add(`mood-${post.mood}`);
    if (isReported) {
      node.classList.add("is-reported");
    }

    node.querySelector("strong").textContent = `${moodLabels[post.mood]} - ${post.createdAt}`;
    node.querySelector("p").textContent = isReported
      ? "This post has been reported on this device."
      : post.text;

    const reportButton = node.querySelector(".report-button");
    reportButton.textContent = isReported ? "Reported" : "Report";
    reportButton.disabled = isReported;
    reportButton.addEventListener("click", async () => {
      try {
        await quietStore.reportPost(post.id);
        reportButton.textContent = "Reported";
        reportButton.disabled = true;
        await renderFeed();
      } catch (error) {
        showFeedError(error.message);
      }
    });

    const imageButton = node.querySelector(".image-share-button");
    imageButton.disabled = isReported;
    imageButton.addEventListener("click", () => {
      downloadFeelingImage(post);
    });

    const comfortRow = node.querySelector(".comfort-row");
    comfortPhrases.forEach((phrase) => {
      const comfortButton = document.createElement("button");
      const eventKey = `${post.id}:${phrase}`;
      const isSent = comfortSet.has(eventKey);
      comfortButton.className = "comfort-button";
      comfortButton.type = "button";
      comfortButton.textContent = isSent ? "Comfort sent" : phrase;
      comfortButton.disabled = isSent || isReported;
      if (isSent) {
        comfortButton.classList.add("sent");
      }
      comfortButton.addEventListener("click", async () => {
        try {
          await quietStore.addComfortEvent({
            id: `comfort-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            postId: post.id,
            phrase,
            createdAt: new Date().toISOString()
          });
          comfortButton.textContent = "Comfort sent";
          comfortButton.disabled = true;
          comfortButton.classList.add("sent");
          await renderFeed();
        } catch (error) {
          showFeedError(error.message);
        }
      });
      comfortRow.append(comfortButton);
    });

    feedList.append(node);
  });
}

async function renderArchive() {
  let posts;

  try {
    posts = await quietStore.listSharedPosts();
  } catch (error) {
    archiveCard.className = "archive-card";
    archiveCard.innerHTML = "";
    archiveCard.append(createErrorText(error.message));
    return;
  }

  if (!posts.length) {
    archiveCard.className = "archive-card";
    archiveCard.innerHTML = "";
    archiveCard.append(createErrorText("No Supabase posts are available yet."));
    return;
  }

  const post = posts[Math.floor(Math.random() * posts.length)];
  archiveCard.className = `archive-card mood-${post.mood}`;
  archiveCard.innerHTML = "";

  const label = document.createElement("strong");
  const dot = document.createElement("span");
  const text = document.createElement("p");
  dot.className = "mood-dot";
  label.append(dot, `${moodLabels[post.mood]} - Leave It Here Archive`);
  text.textContent = post.text;
  archiveCard.append(label, text);
}

function showFeedError(message) {
  feedList.innerHTML = "";
  const error = document.createElement("p");
  error.className = "empty-state error-state";
  error.textContent = message;
  feedList.append(error);
}

function createErrorText(message) {
  const error = document.createElement("p");
  error.className = "error-text";
  error.textContent = message;
  return error;
}

async function renderLetters() {
  const letters = await quietStore.listLetters();
  letterList.innerHTML = "";

  if (!letters.length) {
    letterList.append(createPrivateItem("No private letters yet.", "They stay only on this device."));
    return;
  }

  letters.slice(0, 3).forEach((letter) => {
    letterList.append(createPrivateItem(`${letter.to} - ${letter.createdAt}`, letter.text));
  });
}

async function renderCapsules() {
  const capsules = await quietStore.listCapsules();
  const now = Date.now();
  capsuleList.innerHTML = "";

  if (!capsules.length) {
    capsuleList.append(createPrivateItem("No time capsules yet.", "Seal one for 30, 90, or 365 days from now."));
    return;
  }

  capsules.slice(0, 4).forEach((capsule) => {
    const isDue = new Date(capsule.dueAt).getTime() <= now;
    const title = isDue
      ? `Ready now - sealed ${capsule.createdAt}`
      : `Sealed until ${dateLabel(capsule.dueAt)}`;
    const body = isDue ? capsule.text : "This feeling is resting until it is time to return.";
    capsuleList.append(createPrivateItem(title, body));
  });
}

function createPrivateItem(title, body) {
  const node = privateItemTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("strong").textContent = title;
  node.querySelector("p").textContent = body;
  return node;
}

function downloadFeelingImage(post) {
  const canvas = document.createElement("canvas");
  const width = 1080;
  const height = 1350;
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  context.scale(scale, scale);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0c1719");
  gradient.addColorStop(0.52, "#172326");
  gradient.addColorStop(1, "#211817");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(116, 215, 196, 0.14)";
  context.beginPath();
  context.arc(160, 170, 230, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(240, 166, 166, 0.13)";
  context.beginPath();
  context.arc(930, 1120, 280, 0, Math.PI * 2);
  context.fill();

  roundedRect(context, 92, 110, 896, 1110, 34);
  context.fillStyle = "rgba(247, 241, 234, 0.08)";
  context.fill();
  context.strokeStyle = "rgba(247, 241, 234, 0.22)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = moodColor(post.mood);
  context.beginPath();
  context.arc(148, 176, 12, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(247, 241, 234, 0.68)";
  context.font = "700 28px system-ui, sans-serif";
  context.letterSpacing = "2px";
  context.fillText(`${moodLabels[post.mood].toUpperCase()} - LEAVEITHERE.ORG`, 176, 186);

  context.fillStyle = "#f7f1ea";
  context.font = "700 56px Georgia, serif";
  wrapCanvasText(context, post.text, 148, 330, 784, 78, 10);

  context.fillStyle = "rgba(247, 241, 234, 0.66)";
  context.font = "400 30px system-ui, sans-serif";
  context.fillText("A quiet place for what you can't carry alone.", 148, 1100);

  context.fillStyle = "#74d7c4";
  context.font = "800 34px system-ui, sans-serif";
  context.fillText("Leave It Here", 148, 1154);

  const link = document.createElement("a");
  link.download = `leave-it-here-${post.mood}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  });

  if (line) {
    lines.push(line);
  }

  lines.slice(0, maxLines).forEach((lineText, index) => {
    const suffix = index === maxLines - 1 && lines.length > maxLines ? "..." : "";
    context.fillText(`${lineText}${suffix}`, x, y + index * lineHeight);
  });
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function moodColor(mood) {
  return {
    heavy: "#74d7c4",
    angry: "#c98468",
    lonely: "#f0a6a6",
    hopeful: "#f4d58d"
  }[mood] || "#74d7c4";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitter = event.submitter;
  const action = submitter?.dataset.action || "private";
  const text = textarea.value.trim();

  if (!text) {
    textarea.focus();
    return;
  }

    const mood = selectedMood();
    const post = createPost(text, mood);

    if (action === "share") {
    try {
      await quietStore.addSharedPost(post);
      await renderFeed();
      await renderArchive();
    } catch (error) {
      messageWell.innerHTML = `<p>${error.message}</p>`;
      return;
    }
  } else {
    await quietStore.addPrivateRelease(post);
  }

  showReleaseMessage(text, action);
  textarea.value = "";
  updateCount();
});

clearButton.addEventListener("click", () => {
  textarea.value = "";
  updateCount();
  textarea.focus();
});

document.querySelectorAll("input[name='filter']").forEach((input) => {
  input.addEventListener("change", renderFeed);
});

shuffleArchive.addEventListener("click", renderArchive);

letterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const to = document.querySelector("#letterTo").value;
  const textField = document.querySelector("#letterText");
  const text = textField.value.trim();

  if (!text) {
    textField.focus();
    return;
  }

  await quietStore.addLetter({
    id: `letter-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    to,
    text,
    createdAt: nowLabel()
  });
  letterForm.reset();
  await renderLetters();
});

capsuleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const textField = document.querySelector("#capsuleText");
  const days = Number(document.querySelector("#capsuleDelay").value);
  const text = textField.value.trim();

  if (!text) {
    textField.focus();
    return;
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + days);

  await quietStore.addCapsule({
    id: `capsule-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    days,
    createdAt: nowLabel(),
    dueAt: dueAt.toISOString()
  });
  capsuleForm.reset();
  await renderCapsules();
});

textarea.addEventListener("input", updateCount);

updateCount();
renderFeed();
renderArchive();
renderLetters();
renderCapsules();
