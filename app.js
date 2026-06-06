const form = document.querySelector("#feelingForm");
const textarea = document.querySelector("#feelingText");
const charCount = document.querySelector("#charCount");
const clearButton = document.querySelector("#clearButton");
const saveToggle = document.querySelector("#saveToggle");
const messageWell = document.querySelector("#messageWell");
const trailList = document.querySelector("#trailList");
const wipeTrail = document.querySelector("#wipeTrail");
const template = document.querySelector("#trailItemTemplate");

const storageKey = "open-quiet-trail";

const labels = {
  heavy: "Heavy",
  angry: "Angry",
  lonely: "Lonely",
  hopeful: "Hopeful"
};

function readTrail() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function writeTrail(items) {
  localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 8)));
}

function renderTrail() {
  const items = readTrail();
  trailList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "care-note";
    empty.textContent = "Nothing saved here yet.";
    trailList.append(empty);
    return;
  }

  items.forEach((item) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(`mood-${item.mood}`);
    node.querySelector("strong").textContent = `${labels[item.mood]} · ${item.when}`;
    node.querySelector("p").textContent = item.text;
    trailList.append(node);
  });
}

function selectedMood() {
  return new FormData(form).get("mood") || "heavy";
}

function updateCount() {
  charCount.textContent = textarea.value.length;
}

function releaseMessage(text) {
  messageWell.classList.remove("releasing");
  messageWell.innerHTML = "";

  const message = document.createElement("p");
  message.textContent = text;
  messageWell.append(message);

  requestAnimationFrame(() => {
    messageWell.classList.add("releasing");
  });

  window.setTimeout(() => {
    messageWell.classList.remove("releasing");
    messageWell.innerHTML = "<p>It is out of you for now. Take one slower breath.</p>";
  }, 2300);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = textarea.value.trim();
  if (!text) {
    textarea.focus();
    return;
  }

  const mood = selectedMood();
  releaseMessage(text);

  if (saveToggle.checked) {
    const trail = readTrail();
    const when = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date());

    writeTrail([{ text, mood, when }, ...trail]);
    renderTrail();
  }

  textarea.value = "";
  updateCount();
});

clearButton.addEventListener("click", () => {
  textarea.value = "";
  updateCount();
  textarea.focus();
});

wipeTrail.addEventListener("click", () => {
  localStorage.removeItem(storageKey);
  renderTrail();
});

textarea.addEventListener("input", updateCount);

updateCount();
renderTrail();
