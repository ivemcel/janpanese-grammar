"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Book, GrammarData, GrammarPoint } from "@/lib/grammar-data";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  mergeProgressStates,
  progressStateToRows,
  rowsToProgressState,
  type ProgressRow,
  type ProgressState,
  type ProgressRecord,
} from "@/lib/supabase/progress";

const STORAGE_KEY = "jlpt-grammar-progress-v1";
const DEFAULT_BOOK_ID = "shin-kanzen-n2";
const GRAMMAR_PAGE_SIZE = 12;

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
} as const;

type PageId = "home" | "grammar" | "review" | "dashboard";
type ReviewMode = "recognition" | "recall";

type ReviewSettings = {
  showScene: boolean;
  autoplay: boolean;
};

type GrammarPlannerProps = {
  authConfigured: boolean;
  initialData: GrammarData;
  userEmail: string | null;
  userId: string | null;
};

const NAV_ITEMS: Array<{ id: PageId; label: string }> = [
  { id: "home", label: "选择书籍" },
  { id: "grammar", label: "语法速查" },
  { id: "review", label: "复习" },
  { id: "dashboard", label: "仪表盘" },
];

function sortBooks(books: Book[]) {
  const order = ["standard-beginner", "standard-intermediate", "shin-kanzen-n2"];
  return [...books].sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
}

function getScopedStorageKey(userId?: string | null) {
  return userId ? `${STORAGE_KEY}::${userId}` : STORAGE_KEY;
}

function loadLegacyProgress(storageKey: string): ProgressState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || "{}") as ProgressState;
  } catch {
    return {};
  }
}

function clearStoredProgress(...storageKeys: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  storageKeys.forEach((storageKey) => window.localStorage.removeItem(storageKey));
}

function getBookMeta(bookId: string) {
  return BOOK_META[bookId as keyof typeof BOOK_META] || {
    title: "📘 语法书",
    short: "语法",
    badgeClass: "badge-blue",
    icon: "📘",
  };
}

function getBookProgress(progress: ProgressState, bookId: string) {
  return progress[bookId] || {};
}

function getGrammarProgress(progress: ProgressState, bookId: string, grammarId: string) {
  return getBookProgress(progress, bookId)[grammarId] || {};
}

function buildClozeText(item: GrammarPoint) {
  if (item.exampleJa && item.pattern && item.exampleJa.includes(item.pattern.replace("～", ""))) {
    return item.exampleJa.replace(item.pattern.replace("～", ""), "＿＿＿");
  }

  return `${item.lessonName} · ${item.meaning || item.pattern}`;
}

function getSceneUrl(scenePath?: string) {
  return scenePath ? encodeURI(`/${scenePath}`) : "";
}

function computeStreak(progress: ProgressState, bookId: string) {
  const timestamps = Object.values(getBookProgress(progress, bookId))
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .map((value) => new Date(value as string))
    .sort((left, right) => right.getTime() - left.getTime());

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

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function GrammarPlanner({ authConfigured, initialData, userEmail, userId }: GrammarPlannerProps) {
  const router = useRouter();
  const books = sortBooks(initialData.books);
  const initialBookId = books.some((book) => book.id === DEFAULT_BOOK_ID)
    ? DEFAULT_BOOK_ID
    : (books[0]?.id ?? "");

  const [currentBook, setCurrentBook] = useState(initialBookId);
  const [currentCard, setCurrentCard] = useState(0);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("recognition");
  const [currentPage, setCurrentPage] = useState<PageId>("home");
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState<ProgressState>({});
  const [reviewSettings, setReviewSettings] = useState<ReviewSettings>({
    showScene: true,
    autoplay: false,
  });
  const [grammarPage, setGrammarPage] = useState(1);
  const [isFlipped, setIsFlipped] = useState(false);
  const [hasClientBooted, setHasClientBooted] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSyncingProgress, setIsSyncingProgress] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const lastSyncedPayloadRef = useRef<string>("");
  const remoteHydrationStartedRef = useRef(false);

  const canLearn = authConfigured && Boolean(userId);
  const cloudProgressReady = canLearn ? hasHydratedRemote : false;

  const currentBookInfo = books.find((book) => book.id === currentBook);
  const currentBookMeta = getBookMeta(currentBook);
  const currentGrammar = initialData.grammarPoints.filter((item) => item.bookId === currentBook);
  const filteredGrammar = currentGrammar.filter((item) => {
    if (!search) {
      return true;
    }

    return item.searchText.toLowerCase().includes(search.toLowerCase());
  });
  const visibleCount = Math.min(filteredGrammar.length, grammarPage * GRAMMAR_PAGE_SIZE);
  const visibleGrammar = filteredGrammar.slice(0, visibleCount);
  const reviewItem = filteredGrammar.length
    ? filteredGrammar[currentCard % filteredGrammar.length]
    : null;
  const hasMoreGrammar = visibleCount < filteredGrammar.length;
  const currentBookProgress = getBookProgress(progress, currentBook);
  const progressEntries = Object.values(currentBookProgress);
  const masteredCount = progressEntries.filter((item) => item.status === "mastered").length;
  const learningCount = progressEntries.filter((item) => item.status === "learning").length;
  const unseenCount = Math.max((currentBookInfo?.grammarCount || 0) - masteredCount - learningCount, 0);
  const masteryRate = currentBookInfo?.grammarCount
    ? Math.round((masteredCount / currentBookInfo.grammarCount) * 100)
    : 0;
  const streak = computeStreak(progress, currentBook);
  const weakItems = currentGrammar
    .map((item) => {
      const itemProgress = getGrammarProgress(progress, item.bookId, item.id);
      const wrong = itemProgress.wrongCount || 0;
      const correct = itemProgress.correctCount || 0;
      const total = wrong + correct;
      const errorRate = total ? Math.round((wrong / total) * 100) : itemProgress.tricky ? 60 : 0;

      return { item, errorRate };
    })
    .sort((left, right) => right.errorRate - left.errorRate)
    .slice(0, 5);

  useEffect(() => {
    setHasClientBooted(true);
  }, []);

  useEffect(() => {
    remoteHydrationStartedRef.current = false;
    lastSyncedPayloadRef.current = "";
    setHasHydratedRemote(false);
    setSyncError(null);
    setProgress({});

    if (!userId) {
      setCurrentPage("home");
    }
  }, [userId]);

  useEffect(() => {
    if (!hasClientBooted) {
      return;
    }

    if (!canLearn) {
      setHasHydratedRemote(true);
      setSyncError(null);
      remoteHydrationStartedRef.current = false;
      return;
    }

    if (remoteHydrationStartedRef.current) {
      return;
    }

    remoteHydrationStartedRef.current = true;
    setIsSyncingProgress(true);

    const scopedStorageKey = getScopedStorageKey(userId);
    const scopedLocalProgress = loadLegacyProgress(scopedStorageKey);
    const legacyAnonymousProgress = loadLegacyProgress(STORAGE_KEY);
    const localProgress = mergeProgressStates(scopedLocalProgress, legacyAnonymousProgress);

    void (async () => {
      try {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase
          .from("user_grammar_progress")
          .select("user_id, book_id, grammar_id, favorite, status, correct_count, wrong_count, tricky, updated_at")
          .eq("user_id", userId as string);

        if (error) {
          throw error;
        }

        const remoteProgress = rowsToProgressState((data || []) as ProgressRow[]);
        const merged = mergeProgressStates(localProgress, remoteProgress);
        const rows = progressStateToRows(merged, userId as string);

        setProgress(merged);
        lastSyncedPayloadRef.current = JSON.stringify(rows);

        if (rows.length) {
          const { error: upsertError } = await supabase
            .from("user_grammar_progress")
            .upsert(rows, { onConflict: "user_id,grammar_id" });

          if (upsertError) {
            throw upsertError;
          }
        }

        if (Object.keys(legacyAnonymousProgress).length || Object.keys(scopedLocalProgress).length) {
          clearStoredProgress(STORAGE_KEY, scopedStorageKey);
        }
        setSyncError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "同步学习进度时发生未知错误。";
        setSyncError(message);
      } finally {
        setHasHydratedRemote(true);
        setIsSyncingProgress(false);
      }
    })();
  }, [authConfigured, canLearn, hasClientBooted, userId]);

  useEffect(() => {
    if (!canLearn || !hasHydratedRemote || !userId) {
      return;
    }

    const payload = JSON.stringify(progressStateToRows(progress, userId));
    if (payload === lastSyncedPayloadRef.current) {
      return;
    }

    setIsSyncingProgress(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const supabase = createSupabaseClient();
          const rows = JSON.parse(payload) as ProgressRow[];
          if (!rows.length) {
            lastSyncedPayloadRef.current = payload;
            setSyncError(null);
            return;
          }
          const { error } = await supabase
            .from("user_grammar_progress")
            .upsert(rows, { onConflict: "user_id,grammar_id" });

          if (error) {
            throw error;
          }

          lastSyncedPayloadRef.current = payload;
          setSyncError(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "同步学习进度时发生未知错误。";
          setSyncError(message);
        } finally {
          setIsSyncingProgress(false);
        }
      })();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [canLearn, hasHydratedRemote, progress, userId]);

  useEffect(() => {
    if (!filteredGrammar.length) {
      setCurrentCard(0);
      setIsFlipped(false);
      return;
    }

    setCurrentCard((value) => (value >= filteredGrammar.length ? 0 : value));
  }, [filteredGrammar.length]);

  useEffect(() => {
    setIsFlipped(false);
  }, [currentCard, reviewMode, currentBook]);

  useEffect(() => {
    if (currentPage !== "grammar" || !hasMoreGrammar || !sentinelRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (!target?.isIntersecting) {
          return;
        }

        setGrammarPage((value) => value + 1);
      },
      {
        root: null,
        rootMargin: "0px 0px 220px 0px",
        threshold: 0,
      },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [currentPage, hasMoreGrammar, visibleCount]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!reviewSettings.autoplay || currentPage !== "review" || !reviewItem) {
      return;
    }

    if (reviewMode === "recognition") {
      if (isFlipped) {
        playCurrentAudio(reviewItem, reviewMode, "back");
      }
      return;
    }

    if (!isFlipped) {
      playCurrentAudio(reviewItem, reviewMode, "front");
    }
  }, [currentPage, currentCard, isFlipped, reviewItem, reviewMode, reviewSettings.autoplay]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  function patchGrammarProgress(bookId: string, grammarId: string, patch: ProgressRecord) {
    setProgress((current) => ({
      ...current,
      [bookId]: {
        ...getBookProgress(current, bookId),
        [grammarId]: {
          ...getGrammarProgress(current, bookId, grammarId),
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  }

  function showPage(pageId: PageId) {
    if (pageId !== "home" && !canLearn) {
      router.push("/auth?mode=signin&message=请先登录后再开始学习。");
      return;
    }

    if (pageId !== "home" && canLearn && !cloudProgressReady) {
      return;
    }

    setCurrentPage(pageId);
  }

  function selectBook(bookId: string) {
    if (!canLearn) {
      router.push("/auth?mode=signin&message=请先登录后再开始学习。");
      return;
    }

    if (!cloudProgressReady) {
      return;
    }

    setCurrentBook(bookId);
    setCurrentCard(0);
    setSearch("");
    setGrammarPage(1);
    setCurrentPage("grammar");
  }

  function switchBook(bookId: string) {
    setCurrentBook(bookId);
    setCurrentCard(0);
    setGrammarPage(1);
  }

  function openReviewFromIndex(index: number) {
    if (!canLearn) {
      router.push("/auth?mode=signin&message=请先登录后再开始学习。");
      return;
    }

    if (!cloudProgressReady) {
      return;
    }

    setCurrentCard(index);
    setCurrentPage("review");
  }

  function playAudioForSide(side: "front" | "back") {
    if (!reviewItem) {
      return;
    }

    playCurrentAudio(reviewItem, reviewMode, side);
  }

  function nextCard(result: "forget" | "fuzzy" | "know") {
    if (!reviewItem) {
      return;
    }

    const current = getGrammarProgress(progress, reviewItem.bookId, reviewItem.id);
    const patch: ProgressRecord = {};

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

    patchGrammarProgress(reviewItem.bookId, reviewItem.id, patch);
    setCurrentCard((value) => value + 1);
  }

  async function handleSignOut() {
    if (!authConfigured || isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
      setCurrentPage("home");
      router.refresh();
      router.push("/");
    } finally {
      setIsSigningOut(false);
    }
  }

  function renderScenePreview(item: GrammarPoint) {
    if (item.sceneImages[0]) {
      return <img src={getSceneUrl(item.sceneImages[0])} alt={item.pattern} />;
    }

    return <>{getBookMeta(item.bookId).icon}</>;
  }

  const ringOffset = 427 - (427 * masteryRate) / 100;
  const today = new Date().getDate();
  const activeDays = new Set(
    Object.values(currentBookProgress)
      .map((item) => item.updatedAt)
      .filter(Boolean)
      .map((value) => new Date(value as string).getDate()),
  );

  return (
    <>
      <nav>
        <div className="nav-logo">📘 N2 语法备考</div>
        <div className="nav-tabs">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={cn("nav-tab", currentPage === item.id && "active")}
              data-page={item.id}
              onClick={() => showPage(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="nav-side">
          <select
            aria-label="切换教材"
            className="book-switcher"
            onChange={(event) => switchBook(event.target.value)}
            value={currentBook}
          >
            {books.map((book) => {
              const meta = getBookMeta(book.id);
              return (
                <option key={book.id} value={book.id}>
                  {meta.short}
                </option>
              );
            })}
          </select>

          {!authConfigured ? (
            <span className="auth-note">未配置 Supabase</span>
          ) : userEmail ? (
            <div className="auth-status">
              <span className="auth-email">{userEmail}</span>
              <button className="auth-btn" onClick={handleSignOut} type="button">
                {isSigningOut ? "退出中..." : "退出"}
              </button>
            </div>
          ) : (
            <Link className="auth-link" href="/auth">
              登录 / 注册
            </Link>
          )}
        </div>
      </nav>

      <div className="container">
        <div className={cn("page", currentPage === "home" && "active")} id="page-home">
          {!canLearn ? (
            <div className="learn-gate">
              <h3>登录后才可以开始学习</h3>
              <p>注册或登录后，我们会把你的收藏、掌握状态和复习记录同步到 Supabase 数据库。</p>
              <Link className="auth-link" href="/auth?mode=signin">
                立即登录 / 注册
              </Link>
            </div>
          ) : !cloudProgressReady ? (
            <div className="learn-gate">
              <h3>正在加载云端学习进度</h3>
              <p>已经登录成功，正在从 Supabase 读取你的收藏、掌握状态和复习记录。</p>
            </div>
          ) : null}
          <div className="book-grid" id="bookGrid">
            {books.map((book) => {
              const meta = getBookMeta(book.id);
              return (
                <button
                  key={book.id}
                  className={cn("book-card", (!canLearn || !cloudProgressReady) && "disabled")}
                  data-book-id={book.id}
                  onClick={() => selectBook(book.id)}
                  type="button"
                >
                  <div className="book-icon">{meta.icon}</div>
                  <h3>{book.name}</h3>
                  <div className="meta">
                    <span className={`badge ${meta.badgeClass}`}>{book.level}</span>
                    {book.grammarCount} 句型
                  </div>
                  <div className="desc">{book.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={cn("page", currentPage === "grammar" && "active")} id="page-grammar">
          {canLearn && cloudProgressReady ? (
            <>
              <div className="section-header">
                <h2 id="grammar-title">{currentBookMeta.title} · 语法速查</h2>
                <button className="back-btn" id="switchBookBtn" onClick={() => showPage("home")} type="button">
                  &larr; 切换书籍
                </button>
              </div>
              <input
                className="search-box"
                id="grammarSearch"
                onChange={(event) => {
                  setSearch(event.target.value.trim());
                  setGrammarPage(1);
                }}
                placeholder="🔍 搜索句型、释义或关键词…"
                type="search"
                value={search}
              />
              <div className="grammar-toolbar" id="grammarToolbar">
                {filteredGrammar.length ? (
                  <>
                    <span>
                      已显示 <strong>{visibleCount}</strong> / {filteredGrammar.length} 个句型
                    </span>
                    <span>{search ? `关键词：${search}` : "向下滑动自动加载更多"}</span>
                  </>
                ) : (
                  <>
                    <span>没有匹配结果</span>
                    <span>试试换个关键词</span>
                  </>
                )}
              </div>
              <div className="grammar-list" id="grammarList">
                {filteredGrammar.length ? (
                  <>
                    {visibleGrammar.map((item, index) => {
                      const itemProgress = getGrammarProgress(progress, item.bookId, item.id);

                      return (
                        <div
                          key={item.id}
                          className="grammar-item"
                          data-grammar-id={item.id}
                          data-visible-index={index}
                          onClick={() => openReviewFromIndex(index)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openReviewFromIndex(index);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="grammar-img">{renderScenePreview(item)}</div>
                          <div className="grammar-info">
                            <h4>{item.pattern}</h4>
                            <div className="reading">{item.lessonName}</div>
                            <div className="meaning">{item.meaning || "暂无释义"}</div>
                          </div>
                          <button
                            aria-label={itemProgress.favorite ? "取消收藏" : "收藏句型"}
                            className={cn("grammar-star", itemProgress.favorite && "starred")}
                            data-star-id={item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              patchGrammarProgress(item.bookId, item.id, { favorite: !itemProgress.favorite });
                            }}
                            type="button"
                          >
                            ⭐
                          </button>
                        </div>
                      );
                    })}
                    <div className="grammar-sentinel" id="grammarSentinel" ref={sentinelRef}>
                      {hasMoreGrammar ? "继续下滑，加载下一页…" : "已经到底了"}
                    </div>
                  </>
                ) : (
                  <div className="grammar-item">
                    <div className="grammar-info">
                      <h4>没有匹配结果</h4>
                      <div className="meaning">试试搜索课文名、中文释义，或者清空筛选词。</div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : canLearn ? (
            <PageStateCard
              message="正在从 Supabase 读取你的语法速查数据和收藏状态，请稍等片刻。"
              showLoginAction={false}
              title="正在加载云端学习进度"
            />
          ) : (
            <PageStateCard
              message="登录后可查看语法速查和收藏状态。"
              title="请先登录"
            />
          )}
        </div>

        <div className={cn("page", currentPage === "review" && "active")} id="page-review">
          {canLearn && cloudProgressReady ? (
            <>
              <div className="section-header">
                <h2>🧠 复习模式</h2>
              </div>
              <div className="mode-tabs" id="reviewModes">
                <button
                  className={cn("mode-tab", reviewMode === "recognition" && "active")}
                  data-mode="recognition"
                  onClick={() => setReviewMode("recognition")}
                  type="button"
                >
                  👀 识别模式
                </button>
                <button
                  className={cn("mode-tab", reviewMode === "recall" && "active")}
                  data-mode="recall"
                  onClick={() => setReviewMode("recall")}
                  type="button"
                >
                  🧩 回忆模式
                </button>
              </div>
              <div className="review-settings">
                <label className="setting-item">
                  <input
                    checked={reviewSettings.showScene}
                    id="toggleScene"
                    onChange={(event) =>
                      setReviewSettings((current) => ({ ...current, showScene: event.target.checked }))
                    }
                    type="checkbox"
                  />
                  <span>显示场景图</span>
                </label>
                <label className="setting-item">
                  <input
                    checked={reviewSettings.autoplay}
                    id="toggleAutoplay"
                    onChange={(event) =>
                      setReviewSettings((current) => ({ ...current, autoplay: event.target.checked }))
                    }
                    type="checkbox"
                  />
                  <span>自动播放音频</span>
                </label>
              </div>
              <div className="flashcard-container">
                {reviewItem ? (
                  <>
                    <div className="fc-progress" id="fcProgress">
                      {(currentCard % filteredGrammar.length) + 1} / {filteredGrammar.length}
                      {getGrammarProgress(progress, reviewItem.bookId, reviewItem.id).status === "mastered"
                        ? " · 已掌握"
                        : ""}
                    </div>
                    <div
                      className="fc-wrapper"
                      id="fcWrapper"
                      onClick={() => setIsFlipped((value) => !value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setIsFlipped((value) => !value);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={cn("fc-inner", isFlipped && "flipped")} id="fcInner">
                        <div className="fc-face fc-front">
                          <div className="fc-label" id="fcFrontLabel">
                            {reviewMode === "recall" ? "例句挖空" : "句型"}
                          </div>
                          <div className={cn("fc-scene-inline", !reviewSettings.showScene && "hidden")} id="fcFrontScene">
                            {reviewSettings.showScene && reviewItem.sceneImages[0] ? (
                              <img src={getSceneUrl(reviewItem.sceneImages[0])} alt={reviewItem.pattern} />
                            ) : null}
                          </div>
                          <div className="fc-pattern" id="fcFrontContent">
                            {reviewMode === "recall" ? buildClozeText(reviewItem) : reviewItem.pattern}
                          </div>
                          <button
                            className={cn("fc-audio", reviewMode !== "recall" && "hidden")}
                            id="fcFrontAudio"
                            onClick={(event) => {
                              event.stopPropagation();
                              playAudioForSide("front");
                            }}
                            type="button"
                          >
                            🔊 播放音频
                          </button>
                          <div className="fc-hint">点击翻转 →</div>
                        </div>
                        <div className="fc-face fc-back">
                          <div className={cn("fc-scene", !reviewSettings.showScene && "hidden")} id="fcScene">
                            {reviewSettings.showScene
                              ? reviewItem.sceneImages[0]
                                ? <img src={getSceneUrl(reviewItem.sceneImages[0])} alt={reviewItem.pattern} />
                                : getBookMeta(reviewItem.bookId).icon
                              : null}
                          </div>
                          <div
                            className={cn("fc-back-pattern", reviewMode === "recognition" && "hidden")}
                            id="fcBackPattern"
                          >
                            {reviewItem.pattern}
                          </div>
                          <div className="fc-meaning" id="fcMeaning">
                            {reviewItem.meaning || "暂无释义"}
                          </div>
                          <div className="fc-example" id="fcExample">
                            {reviewItem.exampleJa || "暂无例句"}
                          </div>
                          <div className="fc-example-zh" id="fcExampleZh">
                            {reviewItem.exampleZh || "暂无翻译"}
                          </div>
                          <button
                            className="fc-audio"
                            id="fcBackAudio"
                            onClick={(event) => {
                              event.stopPropagation();
                              playAudioForSide("back");
                            }}
                            type="button"
                          >
                            🔊 播放音频
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="fc-actions">
                      <button className="fc-btn forget" data-review-result="forget" onClick={() => nextCard("forget")} type="button">
                        ❌ 不认识
                      </button>
                      <button className="fc-btn fuzzy" data-review-result="fuzzy" onClick={() => nextCard("fuzzy")} type="button">
                        🤔 模糊
                      </button>
                      <button className="fc-btn know" data-review-result="know" onClick={() => nextCard("know")} type="button">
                        ✅ 认识
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="fc-progress">当前教材没有可复习的句型</div>
                )}
              </div>
            </>
          ) : canLearn ? (
            <PageStateCard
              message="正在从 Supabase 读取你的复习记录和掌握状态，请稍等片刻。"
              showLoginAction={false}
              title="正在加载云端学习进度"
            />
          ) : (
            <PageStateCard
              message="登录后可进入闪卡复习，并把掌握状态同步到云端。"
              title="请先登录"
            />
          )}
        </div>

        <div className={cn("page", currentPage === "dashboard" && "active")} id="page-dashboard">
          {canLearn && cloudProgressReady ? (
            <>
              <div className="section-header">
                <h2>📊 学习仪表盘</h2>
              </div>
              <div className="dash-grid" id="dashGrid">
                <div className="dash-card">
                  <div className="dash-num">{masteredCount}</div>
                  <div className="dash-label">已掌握句型</div>
                </div>
                <div className="dash-card">
                  <div className="dash-num">{learningCount}</div>
                  <div className="dash-label">学习中</div>
                </div>
                <div className="dash-card">
                  <div className="dash-num">{unseenCount}</div>
                  <div className="dash-label">未学习</div>
                </div>
                <div className="dash-card">
                  <div className="dash-num" style={{ color: "var(--success)" }}>
                    {streak}
                  </div>
                  <div className="dash-label">连续打卡天数 🔥</div>
                </div>
              </div>
              <div className="dashboard-detail">
                <div>
                  <h3 className="subheading">掌握进度</h3>
                  <div className="progress-ring">
                    <svg height="160" width="160">
                      <circle className="ring-bg" cx="80" cy="80" fill="none" r="68" strokeWidth="12" />
                      <circle
                        className="ring-fill"
                        cx="80"
                        cy="80"
                        fill="none"
                        id="ringFill"
                        r="68"
                        strokeDasharray="427"
                        strokeDashoffset={ringOffset}
                        strokeWidth="12"
                      />
                    </svg>
                    <div className="ring-text" id="ringText">
                      {masteryRate}%
                    </div>
                  </div>
                  <h3 className="subheading">打卡日历</h3>
                  <div className="streak-cal" id="streakCal">
                    {Array.from({ length: 28 }, (_, index) => {
                      const day = index + 1;
                      const done = activeDays.has(day) || (day <= today && day > today - 5);
                      const isToday = day === today;

                      return (
                        <div
                          key={day}
                          className={cn("streak-day", done && "done", isToday && "today")}
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <h3 className="subheading">薄弱句型 TOP 5</h3>
                  <div className="weak-list" id="weakList">
                    {weakItems.length ? (
                      weakItems.map(({ item, errorRate }) => (
                        <div key={item.id} className="weak-item">
                          <span className="pattern">{item.pattern}</span>
                          <span className="error-rate">错误率 {errorRate}%</span>
                        </div>
                      ))
                    ) : (
                      <div className="weak-item">
                        <span className="pattern">继续练习后这里会显示你的薄弱句型</span>
                        <span className="error-rate">错误率 0%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : canLearn ? (
            <PageStateCard
              message="正在从 Supabase 读取你的学习统计和薄弱句型数据，请稍等片刻。"
              showLoginAction={false}
              title="正在加载云端学习进度"
            />
          ) : (
            <PageStateCard
              message="登录后才能查看你的学习仪表盘和薄弱句型统计。"
              title="请先登录"
            />
          )}
        </div>
      </div>
    </>
  );
}

function PageStateCard({
  message,
  showLoginAction = true,
  title,
}: {
  message: string;
  showLoginAction?: boolean;
  title: string;
}) {
  return (
    <div className="page-gate">
      <h3>{title}</h3>
      <p>{message}</p>
      {showLoginAction ? (
        <Link className="auth-link" href="/auth?mode=signin">
          登录后开始学习
        </Link>
      ) : null}
    </div>
  );
}

function playCurrentAudio(item: GrammarPoint, reviewMode: ReviewMode, side: "front" | "back") {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }

  if (reviewMode === "recognition" && side === "front") {
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
