import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const sources = [
  {
    id: "shin-kanzen-n2",
    name: "新完全掌握 N2 语法",
    shortName: "新完全N2",
    level: "N2",
    color: "#1d4ed8",
    description: "考试导向，适合系统刷完 N2 重点句型。",
    csv: "语法句型 211ec7c6264283c78770011ab7965b1f_新完全N2 295ec7c626428296b4f60762b5b80257_all.csv",
    mediaDir: "语法句型/新完全N2",
  },
  {
    id: "standard-beginner",
    name: "标准日本语 初级",
    shortName: "标日初",
    level: "N5-N4",
    color: "#0f766e",
    description: "基础打底，适合回看核心结构和常见变形。",
    csv: "语法句型 211ec7c6264283c78770011ab7965b1f_标日初级 fbaec7c626428323a04507a8f9bf0bc1_all.csv",
    mediaDir: "语法句型/标日初级",
  },
  {
    id: "standard-intermediate",
    name: "标准日本语 中级",
    shortName: "标日中",
    level: "N3-N2",
    color: "#c2410c",
    description: "进阶表达，覆盖职场与生活中的常见语法。",
    csv: "语法句型 211ec7c6264283c78770011ab7965b1f_标日中级 3f7ec7c6264283c2b54e07813efdabaa_all.csv",
    mediaDir: "语法句型/标日中级",
  },
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function slugify(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[~〜]/g, "～")
    .replace(/[+＋]/g, "＋")
    .replace(/[／/]/g, "／")
    .replace(/[()（）]/g, "")
    .replace(/\s+/g, "")
    .replace(/[“”"'`]/g, "");
}

function softSlugify(value) {
  return slugify(value).replace(/[～＋／・,，、:：]/g, "");
}

function stripMdHash(filename) {
  return filename.replace(/\s+[0-9a-f]{8,}\.md$/iu, "").replace(/\.md$/iu, "").trim();
}

function walkFiles(targetDir, callback) {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    const fullPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      walkFiles(fullPath, callback);
      continue;
    }

    callback(fullPath);
  }
}

function buildMediaIndex(mediaDir) {
  const absoluteDir = path.join(root, mediaDir);
  const markdownByKey = new Map();
  const markdownBySoftKey = new Map();
  const imagesByKey = new Map();

  walkFiles(absoluteDir, (filePath) => {
    const relativePath = path.relative(root, filePath).split(path.sep).join("/");

    if (filePath.endsWith(".md")) {
      const label = stripMdHash(path.basename(filePath));
      const key = slugify(label);
      const softKey = softSlugify(label);
      markdownByKey.set(key, relativePath);
      if (!markdownBySoftKey.has(softKey)) {
        markdownBySoftKey.set(softKey, relativePath);
      }
      return;
    }

    if (/\.(png|jpg|jpeg|webp)$/iu.test(filePath)) {
      const parentKey = slugify(path.basename(path.dirname(filePath)));
      const images = imagesByKey.get(parentKey) || [];
      images.push(relativePath);
      imagesByKey.set(parentKey, images);
    }
  });

  return { imagesByKey, markdownByKey, markdownBySoftKey };
}

function resolveMarkdownPath(pattern, mediaIndex) {
  const exactKey = slugify(pattern);
  const softKey = softSlugify(pattern);

  if (mediaIndex.markdownByKey.has(exactKey)) {
    return mediaIndex.markdownByKey.get(exactKey);
  }

  if (mediaIndex.markdownBySoftKey.has(softKey)) {
    return mediaIndex.markdownBySoftKey.get(softKey);
  }

  for (const [key, filePath] of mediaIndex.markdownByKey.entries()) {
    if (key.includes(exactKey) || exactKey.includes(key)) {
      return filePath;
    }
  }

  for (const [key, filePath] of mediaIndex.markdownBySoftKey.entries()) {
    if (key.includes(softKey) || softKey.includes(key)) {
      return filePath;
    }
  }

  return null;
}

function normalizeLessonName(value) {
  const raw = normalizeText(value);

  if (!raw) {
    return "未分类";
  }

  const lessonMatch = raw.match(/第\s*(\d+)\s*课/u);
  if (lessonMatch) {
    return `第${Number(lessonMatch[1])}课`;
  }

  if (/^第\s*af\s*课$/iu.test(raw) || raw === "附录") {
    return "附录";
  }

  if (/jlpt/iu.test(raw)) {
    return "JLPT";
  }

  return raw;
}

function deriveLessonOrder(label) {
  const match = label.match(/第\s*(\d+)\s*课/u);
  if (match) {
    return Number(match[1]);
  }

  if (label.includes("JLPT")) {
    return 999;
  }

  if (label === "附录") {
    return 998;
  }

  return Number.MAX_SAFE_INTEGER;
}

function normalizeText(value) {
  return (value || "").replace(/\uFEFF/g, "").trim();
}

function buildBook(source) {
  const csvPath = path.join(root, source.csv);
  const mediaIndex = buildMediaIndex(source.mediaDir);
  const csvContent = fs.readFileSync(csvPath, "utf8");
  const [headerRow, ...dataRows] = parseCsv(csvContent);
  const headers = headerRow.map((header) => normalizeText(header));
  const grammarPoints = [];
  const lessonMap = new Map();

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
    const row = dataRows[rowIndex];
    if (!row.some((cell) => normalizeText(cell))) {
      continue;
    }

    const record = Object.fromEntries(
      headers.map((header, columnIndex) => [header, normalizeText(row[columnIndex] || "")]),
    );

    const pattern = record["句型"] || `未命名句型-${rowIndex + 1}`;
    const lessonName = normalizeLessonName(record["课文"]);
    const lessonOrder = deriveLessonOrder(lessonName);
    const lessonId = `${source.id}::${lessonName}`;
    const patternKey = slugify(pattern);
    const sourceMd = resolveMarkdownPath(pattern, mediaIndex);
    const sceneImages = mediaIndex.imagesByKey.get(patternKey) || [];
    const grammarId = `${source.id}::${rowIndex + 1}`;

    if (!lessonMap.has(lessonId)) {
      lessonMap.set(lessonId, {
        id: lessonId,
        name: lessonName,
        order: lessonOrder,
      });
    }

    grammarPoints.push({
      id: grammarId,
      bookId: source.id,
      pattern,
      meaning: record["意思"],
      explanation: record["说明"],
      exampleJa: record["例句"],
      exampleZh: record["翻译"],
      lessonId,
      lessonName,
      lessonOrder,
      sceneImages,
      sourceUrl: record["链接"],
      sourceMd,
      searchText: [pattern, record["意思"], record["说明"], record["例句"], record["翻译"], lessonName]
        .filter(Boolean)
        .join(" "),
    });
  }

  const lessons = [...lessonMap.values()].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });

  return {
    book: {
      id: source.id,
      name: source.name,
      shortName: source.shortName,
      level: source.level,
      color: source.color,
      description: source.description,
      grammarCount: grammarPoints.length,
      lessonCount: lessons.length,
      lessons,
    },
    grammarPoints,
  };
}

const books = [];
const grammarPoints = [];

for (const source of sources) {
  const result = buildBook(source);
  books.push(result.book);
  grammarPoints.push(...result.grammarPoints);
}

const outputDir = path.join(root, "data");
const publicDir = path.join(root, "public");
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(path.join(publicDir, "data"), { recursive: true });

const payload = JSON.stringify(
  {
    generatedAt: new Date().toISOString(),
    books,
    grammarPoints,
  },
  null,
  2,
);

fs.writeFileSync(
  path.join(outputDir, "grammar-data.json"),
  payload,
);
fs.writeFileSync(path.join(publicDir, "data", "grammar-data.json"), payload);

const mediaSourceDir = path.join(root, "语法句型");
const mediaPublicDir = path.join(publicDir, "语法句型");

if (fs.existsSync(mediaSourceDir)) {
  fs.cpSync(mediaSourceDir, mediaPublicDir, { recursive: true, force: true });
}

console.log(`Built ${grammarPoints.length} grammar points across ${books.length} books.`);
