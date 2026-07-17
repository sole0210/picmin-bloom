const PIKMIN_TYPES = [
  { key: "red", label: "빨강", color: "#df4f45" },
  { key: "yellow", label: "노랑", color: "#f4c84f" },
  { key: "blue", label: "파랑", color: "#3f7edb" },
  { key: "purple", label: "보라", color: "#8b67bc" },
  { key: "white", label: "하양", color: "#f4f1e8" },
  { key: "rock", label: "바위", color: "#6d7476" },
  { key: "winged", label: "날개", color: "#f28fbb" },
  { key: "ice", label: "얼음", color: "#9fd8ef" }
];

const TYPE_BY_KEY = Object.fromEntries(PIKMIN_TYPES.map((type) => [type.key, type]));
const REGULAR_CATEGORIES = (window.REGULAR_DECOR_CATEGORIES || []).map((category) => ({
  ...category,
  icon: category.icon || "+",
  iconImage: findRegularIcon(category),
  items: normalizeRegularCategoryItems(category)
}));

const SPECIAL_CATEGORIES = (window.SPECIAL_DECOR_CATEGORIES || []).map((category) => ({
  ...category,
  icon: category.icon || "*",
  iconImage: "assets/decor-icons/special-decor.png",
  items: normalizeCategoryItems(category)
}));

const CATEGORIES = [...REGULAR_CATEGORIES, ...SPECIAL_CATEGORIES];
const LOCAL_PREVIEW_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1"]);
const STORAGE_KEY = LOCAL_PREVIEW_HOSTS.has(window.location.hostname)
  ? "picmin-bloom-collection-v2-local"
  : "picmin-bloom-collection-v1";
const STATUS_DEFINITIONS = [
  { key: "closeup", title: "얼빡을 모았다", icon: "assets/status-icons/closeup.png" },
  { key: "upsideDown", title: "거꾸리를 모았다", icon: "assets/status-icons/upside-down.png" }
];
const MARK_STATUS_KEYS = ["wanted", ...STATUS_DEFINITIONS.map((status) => status.key)];
const state = {
  marks: loadMarks(),
  filter: "all"
};
let lastTouchToggleAt = 0;
let touchStart = null;
const TAP_MOVE_LIMIT = 12;

const collection = document.querySelector("#collection");
const categoryTemplate = document.querySelector("#categoryTemplate");
const pikminTemplate = document.querySelector("#pikminTemplate");

function makeItem(typeKey, overrides = {}) {
  const type = TYPE_BY_KEY[typeKey];
  return {
    key: overrides.key || typeKey,
    typeKey,
    label: overrides.label || type.label,
    color: type.color,
    image: overrides.image || "",
    placeholder: Boolean(overrides.placeholder),
    source: overrides.source || ""
  };
}

function normalizeCategoryItems(category) {
  const items = category.items.map((item) => makeItem(item.type, item));
  if (!shouldCollapseByType(category.name)) return items;

  const byType = new Map();
  items.forEach((item) => {
    if (!byType.has(item.typeKey)) {
      byType.set(item.typeKey, {
        ...item,
        key: item.typeKey,
        label: TYPE_BY_KEY[item.typeKey].label
      });
    }
  });
  return [...byType.values()];
}

function shouldCollapseByType(categoryName) {
  return (
    categoryName.startsWith("Flower Card") ||
    categoryName === "Mahjong Tile" ||
    categoryName === "Playing Card"
  );
}

function normalizeRegularCategoryItems(category) {
  const items = category.items.map((item) => makeItem(item.type, item));
  if (category.decor.includes("(Rare)")) {
    return items;
  }

  const availability = findRegularAvailability(category);
  if (!availability) return items;

  const existingTypes = new Set(items.map((item) => item.typeKey));
  const missingTypes = availability.types.filter((typeKey) => !existingTypes.has(typeKey) && TYPE_BY_KEY[typeKey]);
  if (!missingTypes.length) return items;

  return [
    ...items,
    ...missingTypes.map((typeKey) => makeItem(typeKey, {
      key: `${typeKey}-placeholder`,
      label: TYPE_BY_KEY[typeKey].label,
      placeholder: true,
      source: "Pikipedia Decor types table"
    }))
  ];
}

function findRegularAvailability(category) {
  return (window.REGULAR_DECOR_AVAILABILITY || []).find(
    (entry) => normalizeKey(entry.name) === normalizeKey(category.name) && normalizeKey(entry.decor) === normalizeKey(category.decor)
  );
}

function findRegularIcon(category) {
  const iconMap = window.REGULAR_DECOR_ICONS || {};
  const normalizedName = normalizeKey(category.name);
  const match = Object.entries(iconMap).find(([name]) => normalizeKey(name) === normalizedName);
  return match ? `assets/decor-icons/${toIconSlug(match[0])}.webp` : "";
}

function toIconSlug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeKey(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadMarks() {
  try {
    return normalizeMarks(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {});
  } catch {
    return {};
  }
}

function normalizeMarks(marks) {
  return Object.fromEntries(
    Object.entries(marks).flatMap(([key, mark]) => {
      const normalized = normalizeMark(mark);
      return hasAnyStatus(normalized) ? [[key, normalized]] : [];
    })
  );
}

function normalizeMark(mark) {
  if (!mark || mark === "none") return {};
  if (mark === "wanted") return { wanted: true };
  if (mark === "owned") return { closeup: true };
  if (typeof mark !== "object") return {};

  const closeup = Boolean(mark.closeup);
  const upsideDown = Boolean(mark.upsideDown);
  return {
    wanted: Boolean(mark.wanted) && !closeup && !upsideDown,
    closeup,
    upsideDown
  };
}

function hasAnyStatus(mark) {
  return MARK_STATUS_KEYS.some((statusKey) => mark[statusKey]);
}

function hasCollectedStatus(mark) {
  return Boolean(mark.closeup || mark.upsideDown);
}

function saveMarks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.marks));
  } catch {
    // Some mobile browsers block localStorage for file:// pages.
  }
}

function itemKey(categoryKey, item) {
  return `${categoryKey}:${item.key}`;
}

function getMark(categoryKey, item) {
  const key = itemKey(categoryKey, item);
  const normalized = normalizeMark(state.marks[key]);
  if (hasAnyStatus(normalized)) {
    state.marks[key] = normalized;
  } else {
    delete state.marks[key];
  }
  return normalized;
}

function matchesFilter(category, item) {
  const mark = getMark(category.key, item);
  if (state.filter === "wanted") return Boolean(mark.wanted);
  if (state.filter === "owned") return hasCollectedStatus(mark);
  return true;
}

function render() {
  collection.innerHTML = "";
  let visibleCategories = 0;

  CATEGORIES.forEach((category) => {
    const visibleItems = category.items.filter((item) => matchesFilter(category, item));

    if (!visibleItems.length) return;
    visibleCategories += 1;

    const node = categoryTemplate.content.firstElementChild.cloneNode(true);
    renderCategoryIcon(node.querySelector(".category-icon"), category);
    node.querySelector("h2").textContent = category.name;
    node.querySelector("p").textContent = category.decor;

    const ownedInCategory = category.items.filter((item) => hasCollectedStatus(getMark(category.key, item))).length;
    node.querySelector(".category-meta").textContent = `${ownedInCategory} / ${category.items.length}`;

    const grid = node.querySelector(".pikmin-grid");
    visibleItems.forEach((item) => grid.appendChild(createPikminCard(category, item)));
    collection.appendChild(node);
  });

  if (!visibleCategories) {
    collection.innerHTML = '<div class="empty">조건에 맞는 피크민이 없어요. 필터를 바꿔볼까요?</div>';
  }
}

function renderCategoryIcon(iconNode, category) {
  iconNode.textContent = "";

  if (!category.iconImage) {
    iconNode.textContent = category.icon;
    return;
  }

  const image = document.createElement("img");
  image.src = category.iconImage;
  image.alt = "";
  image.loading = "lazy";
  iconNode.appendChild(image);
}

function createPikminCard(category, item) {
  const card = pikminTemplate.content.firstElementChild.cloneNode(true);
  const mark = getMark(category.key, item);

  card.style.setProperty("--pikmin", item.color);
  card.dataset.categoryKey = category.key;
  card.dataset.itemKey = item.key;
  card.dataset.typeKey = item.typeKey;
  card.dataset.mark = hasCollectedStatus(mark) ? "owned" : mark.wanted ? "wanted" : "none";
  card.classList.toggle("has-image", Boolean(item.image));
  card.classList.toggle("is-placeholder", item.placeholder);

  const image = card.querySelector(".pikmin-image");
  if (item.image) {
    image.src = item.image;
    image.alt = "";
  }

  card.setAttribute("aria-label", `${category.name} ${item.label}`);
  renderStatusToggles(card.querySelector(".status-toggles"), mark);
  return card;
}

function renderStatusToggles(container, mark) {
  container.innerHTML = "";
  STATUS_DEFINITIONS.forEach((status) => {
    const button = document.createElement("button");
    button.className = "status-toggle";
    button.type = "button";
    button.dataset.status = status.key;
    button.classList.toggle("is-active", Boolean(mark[status.key]));
    button.setAttribute("aria-pressed", String(Boolean(mark[status.key])));
    button.setAttribute("aria-label", status.title);
    button.title = status.title;

    const icon = document.createElement("img");
    icon.className = "status-icon";
    icon.src = status.icon;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);
    container.appendChild(button);
  });
}

function togglePikminStatus(category, item, statusKey) {
  const key = itemKey(category.key, item);
  const current = getMark(category.key, item);
  const updated = {
    ...current,
    [statusKey]: !current[statusKey]
  };
  if ((statusKey === "closeup" || statusKey === "upsideDown") && updated[statusKey]) {
    updated.wanted = false;
  }
  if (hasAnyStatus(updated)) {
    state.marks[key] = updated;
  } else {
    delete state.marks[key];
  }
  saveMarks();
  render();
}

function togglePikminCard(card, statusKey = "wanted") {
  const category = CATEGORIES.find((candidate) => candidate.key === card.dataset.categoryKey);
  const item = category?.items.find((candidate) => candidate.key === card.dataset.itemKey);
  if (!category || !item) return;
  if (statusKey === "wanted" && hasCollectedStatus(getMark(category.key, item))) return;
  togglePikminStatus(category, item, statusKey);
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    state.filter = button.dataset.filter;
    render();
  });
});

collection.addEventListener("touchstart", (event) => {
  const card = event.target.closest(".pikmin-card");
  if (!card || event.touches.length !== 1) {
    touchStart = null;
    return;
  }

  const [touch] = event.touches;
  touchStart = {
    card,
    x: touch.clientX,
    y: touch.clientY
  };
}, { passive: true });

collection.addEventListener("touchend", (event) => {
  const card = event.target.closest(".pikmin-card");
  if (!card) return;

  if (!touchStart || touchStart.card !== card || event.changedTouches.length !== 1) {
    touchStart = null;
    return;
  }

  const [touch] = event.changedTouches;
  const movedX = Math.abs(touch.clientX - touchStart.x);
  const movedY = Math.abs(touch.clientY - touchStart.y);
  touchStart = null;

  if (movedX > TAP_MOVE_LIMIT || movedY > TAP_MOVE_LIMIT) return;

  event.preventDefault();
  lastTouchToggleAt = Date.now();
  const statusButton = event.target.closest(".status-toggle");
  togglePikminCard(card, statusButton?.dataset.status || "wanted");
}, { passive: false });

collection.addEventListener("touchcancel", () => {
  touchStart = null;
}, { passive: true });

collection.addEventListener("click", (event) => {
  const card = event.target.closest(".pikmin-card");
  if (!card) return;
  if (Date.now() - lastTouchToggleAt < 700) return;
  const statusButton = event.target.closest(".status-toggle");
  togglePikminCard(card, statusButton?.dataset.status || "wanted");
});

collection.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;

  const card = event.target.closest(".pikmin-card");
  if (!card) return;

  event.preventDefault();
  const statusButton = event.target.closest(".status-toggle");
  togglePikminCard(card, statusButton?.dataset.status || "wanted");
});

document.querySelector("#exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), marks: state.marks }, null, 2)], {
    type: "application/json"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "picmin-bloom-collection.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector("#importInput").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    state.marks = normalizeMarks(imported.marks || imported || {});
    saveMarks();
    render();
  } catch {
    alert("JSON 파일을 읽지 못했어요.");
  } finally {
    event.target.value = "";
  }
});

render();
