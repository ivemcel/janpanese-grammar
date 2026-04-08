const STORAGE_KEY = "jlpt-grammar-progress-v1";

const BOOK_META = {
  "standard-beginner": {
    title: "📗 标准日本语 初级",
    short: "标日初",
    badgeClass: "badge-purple",
    icon: "📗",
  },
  "standard-intermediate": {
    title: "📙 标准日本语 中级",
    short: "标日中",
    badgeClass: "badge-amber",
    icon: "📙",
  },
  "shin-kanzen-n2": {
    title: "📘 新完全掌握 N2",
    short: "新完全N2",
    badgeClass: "badge-blue",
    icon: "📘",
  },
};

const state = {
  books: [],
  grammarPoints: [],
  currentBook: "shin-kanzen-n2",
  currentCard: 0,
  reviewMode: "recognition",
  currentPage: "home",
  search: "",
  progress: loadProgress(),
  reviewSettings: {
    showScene: true,
    autoplay: false,
  },
  grammarPage: 1,
  grammarPageSize: 12,
  grammarObserver: null,
};

const elements = {
  globalBook: document.querySelector("#globalBook"),
  bookGrid: document.querySelector("#bookGrid"),
  grammarList: document.querySelector("#grammarList"),
  grammarToolbar: document.querySelector("#grammarToolbar"),
  grammarSearch: document.querySelector("#grammarSearch"),
  grammarTitle: document.querySelector("#grammar-title"),
  switchBookBtn: document.querySelector("#switchBookBtn"),
  navTabs: [...document.querySelectorAll(".nav-tab")],
  pages: [...document.querySelectorAll(".page")],
  reviewModes: [...document.querySelectorAll("#reviewModes .mode-tab")],
  fcWrapper: document.querySelector("#fcWrapper"),
  fcInner: document.querySelector("#fcInner"),
  fcProgress: document.querySelector("#fcProgress"),
  fcFrontLabel: document.querySelector("#fcFrontLabel"),
  fcFrontScene: document.querySelector("#fcFrontScene"),
  fcFrontContent: document.querySelector("#fcFrontContent"),
  fcFrontAudio: document.querySelector("#fcFrontAudio"),
  fcScene: document.querySelector("#fcScene"),
  fcBackPattern: document.querySelector("#fcBackPattern"),
  fcMeaning: document.querySelector("#fcMeaning"),
  fcExample: document.querySelector("#fcExample"),
  fcExampleZh: document.querySelector("#fcExampleZh"),
  fcBackAudio: document.querySelector("#fcBackAudio"),
  reviewButtons: [...document.querySelectorAll("[data-review-result]")],
  toggleScene: document.querySelector("#toggleScene"),
  toggleAutoplay: document.querySelector("#toggleAutoplay"),
  dashGrid: document.querySelector("#dashGrid"),
  streakCal: document.querySelector("#streakCal"),
  weakList: document.querySelector("#weakList"),
  ringFill: document.querySelector("#ringFill"),
  ringText: document.querySelector("#ringText"),
};

init();

async function init() {
  const response = await fetch("/data/grammar-data.json", { cache: "no-store" });
  const payload = await response.json();
  state.books = sortBooks(payload.books);
  state.grammarPoints = payload.grammarPoints;

  if (!state.books.some((book) => book.id === state.currentBook)) {
    state.currentBook = state.books[0]?.id || "";
  }

  bindEvents();
  renderBookSwitcher();
  renderHome();
  renderGrammar();
  resetCard();
  renderDashboard();
}

function bindEvents() {
  elements.navTabs.forEach((tab) => {
    tab.addEventListener("click", () => showPage(tab.dataset.page));
  });

  elements.globalBook.addEventListener("change", (event) => {
    switchBook(event.target.value);
  });

  elements.switchBookBtn.addEventListener("click", () => {
    showPage("home");
  });

  elements.grammarSearch.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    state.grammarPage = 1;
    renderGrammar();
  });

  elements.fcWrapper.addEventListener("click", flipCard);

  elements.reviewModes.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  elements.reviewButtons.forEach((button) => {
    button.addEventListener("click", () => nextCard(button.dataset.reviewResult));
  });

  elements.toggleScene.addEventListener("change", (event) => {
    state.reviewSettings.showScene = event.target.checked;
    resetCard();
  });

  elements.toggleAutoplay.addEventListener("change", (event) => {
    state.reviewSettings.autoplay = event.target.checked;
    if (!state.reviewSettings.autoplay) {
      window.speechSynthesis?.cancel();
    } else {
      maybeAutoplayForCurrentState();
    }
  });

  elements.fcFrontAudio.addEventListener("click", (event) => {
    event.stopPropagation();
    playCurrentAudio("front");
  });

  elements.fcBackAudio.addEventListener("click", (event) => {
    event.stopPropagation();
    playCurrentAudio("back");
  });
}

function sortBooks(books) {
  const order = ["standard-beginner", "standard-intermediate", "shin-kanzen-n2"];
  return [...books].sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function getBookMeta(bookId) {
  return BOOK_META[bookId] || {
    title: "📘 语法书",
    short: "语法",
    badgeClass: "badge-blue",
    icon: "📘",
  };
}

function getBook(bookId) {
  return state.books.find((book) => book.id === bookId);
}

function getBookGrammar(bookId) {
  return state.grammarPoints.filter((item) => item.bookId === bookId);
}

function getBookProgress(bookId) {
  return state.progress[bookId] || {};
}

function getGrammarProgress(bookId, grammarId) {
  return getBookProgress(bookId)[grammarId] || {};
}

function patchGrammarProgress(bookId, grammarId, patch) {
  state.progress[bookId] = {
    ...getBookProgress(bookId),
    [grammarId]: {
      ...getGrammarProgress(bookId, grammarId),
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  };
  saveProgress();
}

function showPage(id) {
  state.currentPage = id;
  elements.pages.forEach((page) => {
    page.classList.toggle("active", page.id === `page-${id}`);
  });
  elements.navTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.page === id);
  });

  if (id === "grammar") {
    renderGrammar();
  }
  if (id === "review") {
    resetCard();
  }
  if (id === "dashboard") {
    renderDashboard();
  }
}

function renderBookSwitcher() {
  elements.globalBook.innerHTML = state.books
    .map((book) => {
      const meta = getBookMeta(book.id);
      return `<option value="${book.id}" ${book.id === state.currentBook ? "selected" : ""}>${meta.short}</option>`;
    })
    .join("");
}

function renderHome() {
  elements.bookGrid.innerHTML = state.books
    .map((book) => {
      const meta = getBookMeta(book.id);
      return `
        <div class="book-card" data-book-id="${book.id}">
          <div class="book-icon">${meta.icon}</div>
          <h3>${book.name}</h3>
          <div class="meta"><span class="badge ${meta.badgeClass}">${book.level}</span> ${book.grammarCount} 句型</div>
          <div class="desc">${book.description}</div>
        </div>
      `;
    })
    .join("");

  elements.bookGrid.querySelectorAll("[data-book-id]").forEach((card) => {
    card.addEventListener("click", () => selectBook(card.dataset.bookId));
  });
}

function selectBook(bookId) {
  state.currentBook = bookId;
  state.currentCard = 0;
  state.search = "";
  state.grammarPage = 1;
  elements.globalBook.value = bookId;
  elements.grammarSearch.value = "";
  renderGrammar();
  resetCard();
  renderDashboard();
  showPage("grammar");
}

function switchBook(bookId) {
  state.currentBook = bookId;
  state.currentCard = 0;
  state.grammarPage = 1;
  renderGrammar();
  resetCard();
  renderDashboard();
}

function renderGrammar() {
  const book = getBook(state.currentBook);
  const meta = getBookMeta(state.currentBook);
  const search = state.search;
  const items = getFilteredGrammar(search);
  const visibleCount = Math.min(items.length, state.grammarPage * state.grammarPageSize);
  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  elements.grammarTitle.textContent = `${meta.title} · 语法速查`;
  elements.grammarToolbar.innerHTML = `
    <span>已显示 <strong>${visibleCount}</strong> / ${items.length} 个句型</span>
    <span>${search ? `关键词：${escapeHtml(search)}` : "向下滑动自动加载更多"}</span>
  `;
  elements.grammarList.innerHTML = visibleItems
    .map((item, index) => {
      const progress = getGrammarProgress(item.bookId, item.id);
      return `
        <div class="grammar-item" data-grammar-id="${item.id}" data-visible-index="${index}">
          <div class="grammar-img">${renderScenePreview(item)}</div>
          <div class="grammar-info">
            <h4>${escapeHtml(item.pattern)}</h4>
            <div class="reading">${escapeHtml(item.lessonName)}</div>
            <div class="meaning">${escapeHtml(item.meaning || "暂无释义")}</div>
          </div>
          <div class="grammar-star ${progress.favorite ? "starred" : ""}" data-star-id="${item.id}">⭐</div>
        </div>
      `;
    })
    .join("") + (hasMore ? '<div class="grammar-sentinel" id="grammarSentinel">继续下滑，加载下一页…</div>' : '<div class="grammar-sentinel">已经到底了</div>');

  if (!items.length) {
    disconnectGrammarObserver();
    elements.grammarToolbar.innerHTML = `<span>没有匹配结果</span><span>试试换个关键词</span>`;
    elements.grammarList.innerHTML = `
      <div class="grammar-item">
        <div class="grammar-info">
          <h4>没有匹配结果</h4>
          <div class="meaning">试试搜索课文名、中文释义，或者清空筛选词。</div>
        </div>
      </div>
    `;
    return;
  }

  elements.grammarList.querySelectorAll("[data-grammar-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.currentCard = Number(card.dataset.visibleIndex);
      showPage("review");
      resetCard();
    });
  });

  elements.grammarList.querySelectorAll("[data-star-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const grammarId = button.dataset.starId;
      const current = getGrammarProgress(state.currentBook, grammarId);
      patchGrammarProgress(state.currentBook, grammarId, { favorite: !current.favorite });
      renderGrammar();
      renderDashboard();
    });
  });

  if (!book) {
    elements.grammarTitle.textContent = "语法速查";
  }

  setupGrammarPagination(hasMore);
}

function getFilteredGrammar(search = "") {
  const list = getBookGrammar(state.currentBook);
  if (!search) {
    return list;
  }

  const needle = search.toLowerCase();
  return list.filter((item) => item.searchText.toLowerCase().includes(needle));
}

function renderScenePreview(item) {
  if (item.sceneImages[0]) {
    return `<img src="${encodeURI(`/${item.sceneImages[0]}`)}" alt="${escapeHtml(item.pattern)}">`;
  }

  return escapeHtml(getBookMeta(item.bookId).icon);
}

function setupGrammarPagination(hasMore) {
  disconnectGrammarObserver();

  if (!hasMore) {
    return;
  }

  const sentinel = document.querySelector("#grammarSentinel");
  if (!sentinel) {
    return;
  }

  state.grammarObserver = new IntersectionObserver(
    (entries) => {
      const target = entries[0];
      if (!target?.isIntersecting) {
        return;
      }

      state.grammarPage += 1;
      renderGrammar();
    },
    {
      root: null,
      rootMargin: "0px 0px 220px 0px",
      threshold: 0,
    },
  );

  state.grammarObserver.observe(sentinel);
}

function disconnectGrammarObserver() {
  if (state.grammarObserver) {
    state.grammarObserver.disconnect();
    state.grammarObserver = null;
  }
}

function flipCard() {
  elements.fcInner.classList.toggle("flipped");
  maybeAutoplayForCurrentState();
}

function setMode(mode) {
  state.reviewMode = mode;
  elements.reviewModes.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  resetCard();
}

function resetCard() {
  const list = getFilteredGrammar();
  if (!list.length) {
    return;
  }

  const item = list[state.currentCard % list.length];
  const progress = getGrammarProgress(item.bookId, item.id);
  elements.fcInner.classList.remove("flipped");
  elements.fcProgress.textContent = `${(state.currentCard % list.length) + 1} / ${list.length}`;
  renderCardFront(item);
  renderCardBack(item);

  if (progress.status === "mastered") {
    elements.fcProgress.textContent += " · 已掌握";
  }

  maybeAutoplayForCurrentState();
}

function buildClozeText(item) {
  if (item.exampleJa && item.pattern && item.exampleJa.includes(item.pattern.replace("～", ""))) {
    return item.exampleJa.replace(item.pattern.replace("～", ""), "＿＿＿");
  }

  return `${item.lessonName} · ${item.meaning || item.pattern}`;
}

function renderCardFront(item) {
  const sceneMarkup = item.sceneImages[0]
    ? `<img src="${encodeURI(`/${item.sceneImages[0]}`)}" alt="${escapeHtml(item.pattern)}">`
    : "";
  const showScene = state.reviewSettings.showScene && Boolean(sceneMarkup);

  elements.fcFrontScene.classList.toggle("hidden", !showScene);
  elements.fcFrontScene.innerHTML = showScene ? sceneMarkup : "";

  if (state.reviewMode === "recall") {
    elements.fcFrontLabel.textContent = "例句挖空";
    elements.fcFrontContent.textContent = buildClozeText(item);
    elements.fcFrontAudio.classList.remove("hidden");
  } else {
    elements.fcFrontLabel.textContent = "句型";
    elements.fcFrontContent.textContent = item.pattern;
    elements.fcFrontAudio.classList.add("hidden");
  }
}

function renderCardBack(item) {
  const sceneMarkup = item.sceneImages[0]
    ? `<img src="${encodeURI(`/${item.sceneImages[0]}`)}" alt="${escapeHtml(item.pattern)}">`
    : escapeHtml(getBookMeta(item.bookId).icon);

  elements.fcScene.classList.toggle("hidden", !state.reviewSettings.showScene);
  elements.fcScene.innerHTML = state.reviewSettings.showScene ? sceneMarkup : "";
  elements.fcBackPattern.classList.toggle("hidden", state.reviewMode === "recognition");
  elements.fcBackPattern.textContent = item.pattern;
  elements.fcMeaning.textContent = item.meaning || "暂无释义";
  elements.fcExample.textContent = item.exampleJa || "暂无例句";
  elements.fcExampleZh.textContent = item.exampleZh || "暂无翻译";
}

function getCurrentReviewItem() {
  const list = getFilteredGrammar();
  if (!list.length) {
    return null;
  }
  return list[state.currentCard % list.length];
}

function playCurrentAudio(side) {
  const item = getCurrentReviewItem();
  if (!item || !window.speechSynthesis) {
    return;
  }

  if (state.reviewMode === "recognition" && side === "front") {
    return;
  }

  const text = item.exampleJa || item.pattern;
  if (!text) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function maybeAutoplayForCurrentState() {
  if (!state.reviewSettings.autoplay || state.currentPage !== "review") {
    return;
  }

  const isFlipped = elements.fcInner.classList.contains("flipped");
  if (state.reviewMode === "recognition") {
    if (isFlipped) {
      playCurrentAudio("back");
    }
    return;
  }

  if (!isFlipped) {
    playCurrentAudio("front");
  }
}

function nextCard(result) {
  const list = getFilteredGrammar();
  if (!list.length) {
    return;
  }

  const item = list[state.currentCard % list.length];
  const current = getGrammarProgress(item.bookId, item.id);
  const patch = {};

  if (result === "know") {
    patch.status = "mastered";
    patch.correctCount = (current.correctCount || 0) + 1;
  } else if (result === "fuzzy") {
    patch.status = "learning";
  } else {
    patch.status = "learning";
    patch.wrongCount = (current.wrongCount || 0) + 1;
    patch.tricky = true;
  }

  patchGrammarProgress(item.bookId, item.id, patch);
  state.currentCard += 1;
  resetCard();
  renderDashboard();
}

function renderDashboard() {
  const book = getBook(state.currentBook);
  const progress = Object.values(getBookProgress(state.currentBook));
  const total = book?.grammarCount || 0;
  const mastered = progress.filter((item) => item.status === "mastered").length;
  const learning = progress.filter((item) => item.status === "learning").length;
  const unseen = Math.max(total - mastered - learning, 0);
  const streak = computeStreak();

  elements.dashGrid.innerHTML = `
    <div class="dash-card">
      <div class="dash-num">${mastered}</div>
      <div class="dash-label">已掌握句型</div>
    </div>
    <div class="dash-card">
      <div class="dash-num">${learning}</div>
      <div class="dash-label">学习中</div>
    </div>
    <div class="dash-card">
      <div class="dash-num">${unseen}</div>
      <div class="dash-label">未学习</div>
    </div>
    <div class="dash-card">
      <div class="dash-num" style="color:var(--success)">${streak}</div>
      <div class="dash-label">连续打卡天数 🔥</div>
    </div>
  `;

  const rate = total ? Math.round((mastered / total) * 100) : 0;
  const circumference = 427;
  const offset = circumference - (circumference * rate) / 100;
  elements.ringFill.style.strokeDashoffset = `${offset}`;
  elements.ringText.textContent = `${rate}%`;

  renderCalendar();
  renderWeakList();
}

function renderCalendar() {
  const today = new Date().getDate();
  const activeDays = new Set(
    Object.values(getBookProgress(state.currentBook))
      .map((item) => new Date(item.updatedAt || 0).getDate())
      .filter(Boolean),
  );

  let html = "";
  for (let day = 1; day <= 28; day += 1) {
    const done = activeDays.has(day) || (day <= today && day > today - 5);
    const isToday = day === today;
    html += `<div class="streak-day${done ? " done" : ""}${isToday ? " today" : ""}">${day}</div>`;
  }
  elements.streakCal.innerHTML = html;
}

function renderWeakList() {
  const items = getBookGrammar(state.currentBook)
    .map((item) => {
      const progress = getGrammarProgress(item.bookId, item.id);
      const wrong = progress.wrongCount || 0;
      const correct = progress.correctCount || 0;
      const total = wrong + correct;
      const errorRate = total ? Math.round((wrong / total) * 100) : progress.tricky ? 60 : 0;
      return { item, errorRate };
    })
    .sort((left, right) => right.errorRate - left.errorRate)
    .slice(0, 5);

  elements.weakList.innerHTML = items
    .map(({ item, errorRate }) => {
      return `
        <div class="weak-item">
          <span class="pattern">${escapeHtml(item.pattern)}</span>
          <span class="error-rate">错误率 ${errorRate}%</span>
        </div>
      `;
    })
    .join("");
}

function computeStreak() {
  const timestamps = Object.values(getBookProgress(state.currentBook))
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .map((value) => new Date(value))
    .sort((left, right) => right - left);

  if (!timestamps.length) {
    return 0;
  }

  const days = new Set(timestamps.map((date) => date.toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return Math.max(streak, 1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
