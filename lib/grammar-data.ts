import fs from "node:fs/promises";
import path from "node:path";

export type Lesson = {
  id: string;
  name: string;
  order: number;
};

export type Book = {
  id: string;
  name: string;
  shortName: string;
  level: string;
  color: string;
  description: string;
  grammarCount: number;
  lessonCount: number;
  lessons: Lesson[];
};

export type GrammarPoint = {
  id: string;
  bookId: string;
  pattern: string;
  meaning: string;
  explanation: string;
  exampleJa: string;
  exampleZh: string;
  lessonId: string;
  lessonName: string;
  lessonOrder: number;
  sceneImages: string[];
  sourceUrl: string;
  sourceMd: string | null;
  searchText: string;
};

export type GrammarData = {
  generatedAt: string;
  books: Book[];
  grammarPoints: GrammarPoint[];
};

export async function getGrammarData(): Promise<GrammarData> {
  const filePath = path.join(process.cwd(), "public", "data", "grammar-data.json");
  const payload = await fs.readFile(filePath, "utf8");
  return JSON.parse(payload) as GrammarData;
}
