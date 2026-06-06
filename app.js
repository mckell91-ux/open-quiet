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
  sharedPosts: "open-quiet-shared-posts",
  privateReleases: "open-quiet-private-releases",
  reportedPosts: "open-quiet-reported-posts",
  comfortEvents: "open-quiet-comfort-events",
  letters: "open-quiet-unsent-letters",
  capsules: "open-quiet-time-capsules"
};

const moodLabels = {
  heavy: "Heavy",
  angry: "Angry",
  lonely: "Lonely",
  hopeful: "Hopeful"
};

const seedPosts = [
  {
    id: "seed-heavy-1",
    text: "I am tired of being the dependable one today. I want to be held without having to explain every piece of it.",
    mood: "heavy",
    createdAt: "Quietly shared"
  },
  {
    id: "seed-lonely-1",
    text: "I miss someone I cannot talk to anymore. The silence has its own weather.",
    mood: "lonely",
    createdAt: "Quietly shared"
  },
  {
    id: "seed-angry-1",
    text: "I am angry that I had to be calm when someone else was careless with my heart.",
    mood: "angry",
    createdAt: "Quietly shared"
  },
  {
    id: "seed-hopeful-1",
    text: "Something in me still believes tomorrow can be gentler than today.",
    mood: "hopeful",
    createdAt: "Quietly shared"
  }
];

const comfortPhrases = [
  "You're not alone.",
  "I hear you.",
  "That sounds heavy."
];

// Swap this adapter for API calls when Leave It Here moves from static demo storage to a database.
const quietStore = {
  async listSharedPosts() {
    const posts = readJson(storageKeys.sharedPosts, null);
    if (posts) {
      return posts;
    }

    writeJson(storageKeys.sharedPosts, seedPosts);
    return seedPosts;
  },

  async addSharedPost(post) {
    const posts = await this.listSharedPosts();
    const nextPosts = [post, ...posts].slice(0, 60);
    writeJson(storageKeys.sharedPosts, nextPosts);
    return post;
  },

  async addPrivateRelease(release) {
    const releases = readJson(storageKeys.privateReleases, []);
    writeJson(storageKeys.privateReleases, [release, ...releases].slice(0, 20));
    return release;
  },

  async listReportedPostIds() {
    return readJson(storageKeys.reportedPosts, []);
  },

  async reportPost(id) {
    const ids = new Set(await this.listReportedPostIds());
    ids.add(id);
    writeJson(storageKeys.reportedPosts, [...ids]);
  },

  async listComfortEvents() {
    return readJson(storageKeys.comfortEvents, []);
  },

  async addComfortEvent(event) {
    const events = await this.listComfortEvents();
    writeJson(storageKeys.comfortEvents, [event, ...events].slice(0, 120));
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
  const [posts, reportedIds, comfortEvents] = await Promise.all([
    quietStore.listSharedPosts(),
    quietStore.listReportedPostIds(),
    quietStore.listComfortEvents()
  ]);

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
      await quietStore.reportPost(post.id);
      await renderFeed();
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
        await quietStore.addComfortEvent({
          id: `comfort-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          postId: post.id,
          phrase,
          createdAt: new Date().toISOString()
        });
        await renderFeed();
      });
      comfortRow.append(comfortButton);
    });

    feedList.append(node);
  });
}

async function renderArchive() {
  const posts = await quietStore.listSharedPosts();
  const availablePosts = posts.length ? posts : seedPosts;
  const post = availablePosts[Math.floor(Math.random() * availablePosts.length)];
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
    await quietStore.addSharedPost(post);
    await renderFeed();
    await renderArchive();
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
