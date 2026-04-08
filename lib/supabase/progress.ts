export type ProgressRecord = {
  favorite?: boolean;
  status?: "learning" | "mastered";
  correctCount?: number;
  wrongCount?: number;
  tricky?: boolean;
  updatedAt?: string;
};

export type ProgressState = Record<string, Record<string, ProgressRecord>>;

export type ProgressRow = {
  user_id: string;
  book_id: string;
  grammar_id: string;
  favorite: boolean;
  status: "learning" | "mastered" | null;
  correct_count: number;
  wrong_count: number;
  tricky: boolean;
  updated_at: string | null;
};

function parseDate(value?: string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function rowsToProgressState(rows: ProgressRow[]): ProgressState {
  const state: ProgressState = {};

  rows.forEach((row) => {
    state[row.book_id] = state[row.book_id] || {};
    state[row.book_id][row.grammar_id] = {
      favorite: row.favorite || false,
      status: row.status ?? undefined,
      correctCount: row.correct_count || 0,
      wrongCount: row.wrong_count || 0,
      tricky: row.tricky || false,
      updatedAt: row.updated_at ?? undefined,
    };
  });

  return state;
}

export function progressStateToRows(progress: ProgressState, userId: string): ProgressRow[] {
  return Object.entries(progress).flatMap(([bookId, byGrammar]) =>
    Object.entries(byGrammar)
      .filter(([, record]) =>
        Boolean(
          record.favorite ||
            record.status ||
            record.correctCount ||
            record.wrongCount ||
            record.tricky ||
            record.updatedAt,
        ),
      )
      .map(([grammarId, record]) => ({
        user_id: userId,
        book_id: bookId,
        grammar_id: grammarId,
        favorite: record.favorite || false,
        status: record.status ?? null,
        correct_count: record.correctCount || 0,
        wrong_count: record.wrongCount || 0,
        tricky: record.tricky || false,
        updated_at: record.updatedAt ?? null,
      })),
  );
}

export function mergeProgressStates(localState: ProgressState, remoteState: ProgressState): ProgressState {
  const merged: ProgressState = {};
  const bookIds = new Set([...Object.keys(localState), ...Object.keys(remoteState)]);

  bookIds.forEach((bookId) => {
    const localBook = localState[bookId] || {};
    const remoteBook = remoteState[bookId] || {};
    const grammarIds = new Set([...Object.keys(localBook), ...Object.keys(remoteBook)]);

    merged[bookId] = {};

    grammarIds.forEach((grammarId) => {
      const localRecord = localBook[grammarId];
      const remoteRecord = remoteBook[grammarId];

      if (!localRecord) {
        merged[bookId][grammarId] = { ...remoteRecord };
        return;
      }

      if (!remoteRecord) {
        merged[bookId][grammarId] = { ...localRecord };
        return;
      }

      const localUpdatedAt = parseDate(localRecord.updatedAt);
      const remoteUpdatedAt = parseDate(remoteRecord.updatedAt);

      merged[bookId][grammarId] = localUpdatedAt >= remoteUpdatedAt
        ? { ...remoteRecord, ...localRecord }
        : { ...localRecord, ...remoteRecord };
    });

    if (!Object.keys(merged[bookId]).length) {
      delete merged[bookId];
    }
  });

  return merged;
}
