import fs from "fs/promises";
import { existsSync, readdirSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import sharp from "sharp";

export interface ExtractedStoryScene {
  index: number;
  type: "story";
  pageNumber: number;
  id: string;
  en: string;
}

export interface ExtractedStoryPackage {
  coverPage: number;
  avatarPage: number;
  scenes: ExtractedStoryScene[];
  moral: {
    headlineId: string;
    spokenId: string;
    headlineEn: string;
    spokenEn: string;
  };
  thumbnailConfig: {
    heroImage: string;
    backdropImage: string;
    id: {
      headlineTop: string;
      headlineBottom: string;
      hook: string;
      hookEmoji: string;
      badge: string;
      sticker: string;
      bedtimeTitle: string;
      bedtimeHook: string;
    };
    en: {
      headlineTop: string;
      headlineBottom: string;
      hook: string;
      hookEmoji: string;
      badge: string;
      sticker: string;
      bedtimeTitle: string;
      bedtimeHook: string;
    };
  };
}

export interface ExtractStoryInput {
  pagesDir: string;
  pdfPath?: string;
  slug: string;
  title: string;
  originalTitle: string;
  author: string;
  illustrator: string;
  theme: string;
  apiKey?: string;
  groqApiKey?: string;
}

export const GROQ_EXTRACTION_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
] as const;

async function extractPdfTextPerPage(pdfPath: string, totalPages: number): Promise<string[]> {
  if (!existsSync(pdfPath)) return [];
  // 1. Prefer poppler `pdftotext` on Linux CI
  try {
    const pages: string[] = [];
    for (let p = 1; p <= totalPages; p++) {
      const txt = execFileSync("pdftotext", ["-f", String(p), "-l", String(p), pdfPath, "-"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      pages.push(txt.trim());
    }
    if (pages.some((t) => t.length > 20)) return pages;
  } catch {
    // Fall through to macOS PDFKit
  }

  // 2. macOS PDFKit fallback via Swift
  if (process.platform === "darwin") {
    try {
      const swiftCode = `import Foundation\nimport PDFKit\nlet doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!\nvar out: [String] = []\nfor i in 0..<doc.pageCount { out.append(doc.page(at: i)?.string ?? "") }\nlet data = try JSONSerialization.data(withJSONObject: out)\nprint(String(data: data, encoding: .utf8)!)`;
      const raw = execFileSync("swift", ["-e", swiftCode, pdfPath], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const parsed = JSON.parse(raw.trim());
      if (Array.isArray(parsed) && parsed.some((t: any) => String(t).trim().length > 20)) {
        return parsed.map((t: any) => String(t).trim());
      }
    } catch {
      // Ignore
    }
  }
  return [];
}

async function extractStoryDataWithGroq(
  input: ExtractStoryInput,
  totalPages: number,
  pageTexts: string[],
  groqApiKey: string
): Promise<ExtractedStoryPackage> {
  const pageDump = pageTexts
    .map((txt, idx) => `Page ${idx + 1}:\n${txt || "(illustration only / no text)"}`)
    .join("\n\n---\n\n")
    .slice(0, 60000);

  const prompt = [
    `Extract the complete children's picture book into faithful bilingual read-aloud scenes.`,
    `Return ONLY valid JSON matching this exact structure:`,
    `{`,
    `  "coverPage": 1,`,
    `  "avatarPage": 7,`,
    `  "scenes": [{ "index": 0, "type": "story", "pageNumber": 7, "id": "Indonesian narration", "en": "English narration" }],`,
    `  "moral": { "headlineId": "...", "spokenId": "...", "headlineEn": "...", "spokenEn": "..." },`,
    `  "thumbnailConfig": {`,
    `    "heroImage": "assets/cover.png", "backdropImage": "assets/scene_01.png",`,
    `    "id": { "headlineTop": "...", "headlineBottom": "...", "hook": "...", "hookEmoji": "...", "badge": "...", "sticker": "...", "bedtimeTitle": "...", "bedtimeHook": "..." },`,
    `    "en": { "headlineTop": "...", "headlineBottom": "...", "hook": "...", "hookEmoji": "...", "badge": "...", "sticker": "...", "bedtimeTitle": "...", "bedtimeHook": "..." }`,
    `  }`,
    `}`,
    ``,
    `Book Metadata:`,
    `- Slug: ${input.slug}`,
    `- Indonesian Title: ${input.title}`,
    `- English Title: ${input.originalTitle}`,
    `- Author: ${input.author}`,
    `- Illustrator: ${input.illustrator}`,
    `- Editorial Theme: ${input.theme}`,
    `- Total PDF Pages: ${totalPages}`,
    ``,
    `Rules:`,
    `1. Transcribe EVERY actual story page in order (skip cover, blank pages, KDT/copyright, Kata Pengantar/Sekapur Sirih, and back-matter bio/glossary pages).`,
    `2. "pageNumber" MUST be the exact 1-based Page N label of that story page.`,
    `3. Write natural, warm, kid-friendly read-aloud text for both "id" (Bahasa Indonesia) and "en" (English).`,
    `4. Identify "coverPage" (usually 1) and "avatarPage" (main character story page).`,
    `5. Derive a warm COPPA-safe positive moral in Indonesian & English and punchy thumbnail hooks.`,
    ``,
    `Extracted Per-Page Text:`,
    pageDump,
  ].join("\n");

  let lastError: Error | null = null;
  for (const model of GROQ_EXTRACTION_MODELS) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are a bilingual children's storybook editor. Output valid JSON only." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 8192,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq ${model} HTTP ${response.status}: ${errText.slice(0, 300)}`);
      }
      const data: any = await response.json();
      const rawText = data?.choices?.[0]?.message?.content;
      if (!rawText) throw new Error(`Groq ${model} returned empty content.`);
      return normalizeExtractedPackage(JSON.parse(rawText), totalPages, input.slug);
    } catch (err: any) {
      lastError = err;
      console.warn(`⚠️ Groq PDF extraction failed (${model}): ${err.message}`);
    }
  }
  throw lastError || new Error("Groq PDF extraction failed.");
}

export const GEMINI_VISION_MODELS = [
  "models/gemini-3.8-flash",
  "models/gemini-3.7-flash",
  "models/gemini-3.5-flash",
  "models/gemini-flash-latest",
] as const;

/**
 * Extracts structured bilingual scenes, page mapping, moral takeaway, and thumbnail hooks
 * directly from extracted PDF page images using Gemini multimodal vision.
 */
export async function extractStoryDataFromPdfPages(
  input: ExtractStoryInput
): Promise<ExtractedStoryPackage> {
  if (!existsSync(input.pagesDir)) {
    throw new Error(`Extracted pages directory not found: ${input.pagesDir}`);
  }

  const allPageFiles = readdirSync(input.pagesDir)
    .filter((f) => f.endsWith(".png"))
    .sort();

  if (allPageFiles.length === 0) {
    throw new Error(`No extracted PNG pages found in ${input.pagesDir}`);
  }

  const totalPages = allPageFiles.length;
  const resolvedPdfPath = input.pdfPath || path.resolve(input.pagesDir, "../source-book.pdf");

  // 1. Primary Engine: Groq AI (text extraction + bilingual structuring)
  if (input.groqApiKey) {
    const pageTexts = await extractPdfTextPerPage(resolvedPdfPath, totalPages);
    if (pageTexts.length > 0) {
      console.log(`⚡ Using Groq AI (${GROQ_EXTRACTION_MODELS[0]}) as primary story extractor...`);
      try {
        return await extractStoryDataWithGroq(input, totalPages, pageTexts, input.groqApiKey);
      } catch (err: any) {
        console.warn(`⚠️ Groq primary extraction failed (${err.message}).`);
      }
    } else {
      console.warn(`⚠️ No embedded PDF text found for Groq extraction; falling back to vision if available.`);
    }
  }

  if (!input.apiKey) {
    throw new Error(`Groq extraction failed/unavailable and no GEMINI_API_KEY fallback provided for [${input.slug}].`);
  }

  const maxPages = 36;
  const selectedIndices: number[] = [];

  if (totalPages <= maxPages) {
    for (let i = 0; i < totalPages; i++) selectedIndices.push(i);
  } else {
    const step = (totalPages - 1) / (maxPages - 1);
    for (let i = 0; i < maxPages; i++) {
      const idx = Math.round(i * step);
      if (!selectedIndices.includes(idx)) selectedIndices.push(idx);
    }
  }

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    {
      text: [
        `Extract the complete children's picture book into faithful bilingual read-aloud scenes.`,
        `Book Metadata:`,
        `- Slug: ${input.slug}`,
        `- Indonesian Title: ${input.title}`,
        `- English Title: ${input.originalTitle}`,
        `- Author: ${input.author}`,
        `- Illustrator: ${input.illustrator}`,
        `- Editorial Theme: ${input.theme}`,
        `- Total PDF Pages: ${totalPages}`,
        ``,
        `Rules:`,
        `1. Transcribe EVERY actual illustrated story page accurately in order (skip cover, blank pages, publisher/copyright/colophon/credits/back-cover pages).`,
        `2. "pageNumber" MUST be the exact 1-based Page N label of that story page.`,
        `3. Write natural, warm, kid-friendly read-aloud text for both "id" (Bahasa Indonesia) and "en" (English). Translate faithfully without inventing plot events not on the page.`,
        `4. Identify "coverPage" (1-based front cover page) and "avatarPage" (best illustrated page showcasing the main character).`,
        `5. Derive a warm COPPA-safe positive moral in Indonesian & English and punchy kid-friendly thumbnail hooks.`,
      ].join("\n"),
    },
  ];

  for (const idx of selectedIndices) {
    const pageNum = idx + 1;
    const rawBuf = await fs.readFile(path.join(input.pagesDir, allPageFiles[idx]));
    const jpegBuf = await sharp(rawBuf)
      .resize({ width: 768, withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();

    parts.push({ text: `Page ${pageNum}:` });
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: jpegBuf.toString("base64"),
      },
    });
  }

  const requestBody = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.15,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          coverPage: { type: "INTEGER" },
          avatarPage: { type: "INTEGER" },
          scenes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                pageNumber: { type: "INTEGER" },
                id: { type: "STRING" },
                en: { type: "STRING" },
              },
              required: ["pageNumber", "id", "en"],
            },
          },
          moral: {
            type: "OBJECT",
            properties: {
              headlineId: { type: "STRING" },
              spokenId: { type: "STRING" },
              headlineEn: { type: "STRING" },
              spokenEn: { type: "STRING" },
            },
            required: ["headlineId", "spokenId", "headlineEn", "spokenEn"],
          },
          thumbnailConfig: {
            type: "OBJECT",
            properties: {
              id: {
                type: "OBJECT",
                properties: {
                  headlineTop: { type: "STRING" },
                  headlineBottom: { type: "STRING" },
                  hook: { type: "STRING" },
                  hookEmoji: { type: "STRING" },
                  badge: { type: "STRING" },
                  sticker: { type: "STRING" },
                  bedtimeTitle: { type: "STRING" },
                  bedtimeHook: { type: "STRING" },
                },
                required: [
                  "headlineTop",
                  "headlineBottom",
                  "hook",
                  "hookEmoji",
                  "badge",
                  "sticker",
                  "bedtimeTitle",
                  "bedtimeHook",
                ],
              },
              en: {
                type: "OBJECT",
                properties: {
                  headlineTop: { type: "STRING" },
                  headlineBottom: { type: "STRING" },
                  hook: { type: "STRING" },
                  hookEmoji: { type: "STRING" },
                  badge: { type: "STRING" },
                  sticker: { type: "STRING" },
                  bedtimeTitle: { type: "STRING" },
                  bedtimeHook: { type: "STRING" },
                },
                required: [
                  "headlineTop",
                  "headlineBottom",
                  "hook",
                  "hookEmoji",
                  "badge",
                  "sticker",
                  "bedtimeTitle",
                  "bedtimeHook",
                ],
              },
            },
            required: ["id", "en"],
          },
        },
        required: ["coverPage", "avatarPage", "scenes", "moral", "thumbnailConfig"],
      },
    },
  };

  let lastError: Error | null = null;
  for (const model of GEMINI_VISION_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${input.apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          if ((response.status === 429 || response.status === 503) && attempt < 2) {
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          throw new Error(`Model ${model} HTTP ${response.status}: ${errText.slice(0, 300)}`);
        }

        const data: any = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          throw new Error(`Model ${model} returned empty candidate content.`);
        }

        return normalizeExtractedPackage(JSON.parse(rawText), totalPages, input.slug);
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ PDF extraction attempt failed (${model}): ${err.message}`);
      }
    }
  }

  throw lastError || new Error(`Failed to extract scenes from PDF pages for [${input.slug}]`);
}

/** Normalizes raw model/agent JSON (coverPage, avatarPage, scenes, moral, thumbnailConfig) into a package. */
export function normalizeExtractedPackage(
  parsed: any,
  totalPages: number,
  slug: string
): ExtractedStoryPackage {
  const clampPage = (p: number, fallback: number) =>
    Number.isFinite(p) ? Math.max(1, Math.min(totalPages, Math.round(p))) : fallback;

  const validScenes: ExtractedStoryScene[] = (parsed.scenes || [])
    .filter((s: any) => s && (s.id || s.en))
    .map((s: any, idx: number) => ({
      index: idx + 1,
      type: "story" as const,
      pageNumber: clampPage(Number(s.pageNumber), Math.min(totalPages, idx + 2)),
      id: String(s.id || s.en).trim(),
      en: String(s.en || s.id).trim(),
    }));

  if (validScenes.length < 2) {
    throw new Error(`Extracted only ${validScenes.length} scenes from ${totalPages} pages for [${slug}].`);
  }

  return {
    coverPage: clampPage(Number(parsed.coverPage), 1),
    avatarPage: clampPage(Number(parsed.avatarPage), validScenes[0].pageNumber),
    scenes: validScenes,
    moral: parsed.moral,
    thumbnailConfig: {
      heroImage: "assets/scene_01.png",
      backdropImage: "assets/scene_02.png",
      id: parsed.thumbnailConfig.id,
      en: parsed.thumbnailConfig.en,
    },
  };
}
