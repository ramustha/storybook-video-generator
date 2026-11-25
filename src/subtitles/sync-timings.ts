export interface RawBoundaryWord {
  word: string;
  start: number;
  end: number;
}

export interface AlignedBoundaryWord {
  word: string;
  start: number;
  end: number;
}

export interface WordTimingLike {
  word: string;
  start: number;
  end: number;
  speaker?: string;
  speakerName?: string;
  speakerColor?: string;
}

export type NormalizedWordTiming<T extends WordTimingLike = WordTimingLike> = T & {
  phoneticEnd: number;
  activeEnd: number;
};

export interface KaraokeNormalizeOptions {
  minWordDurationSec?: number;
  maxBridgeGapSec?: number;
  clauseHoldSec?: number;
  sentenceHoldSec?: number;
}

export interface ActiveWordState<T extends WordTimingLike = WordTimingLike> {
  activeIndex: number;
  lastSpokenIndex: number;
  activeWord: NormalizedWordTiming<T> | undefined;
  isSpeakingNow: boolean;
  wordProgress: number;
}

function round3(val: number): number {
  return Math.round(val * 1000) / 1000;
}

export function normAlnum(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mergePunctuationOnlyTokens(tokens: string[]): string[] {
  const merged: string[] = [];
  let pendingPrefix = "";
  for (const tok of tokens) {
    if (normAlnum(tok).length === 0) {
      if (merged.length > 0) {
        merged[merged.length - 1] = `${merged[merged.length - 1]}${tok}`;
      } else {
        pendingPrefix = `${pendingPrefix}${tok}`;
      }
      continue;
    }
    merged.push(pendingPrefix ? `${pendingPrefix}${tok}` : tok);
    pendingPrefix = "";
  }
  if (pendingPrefix && merged.length > 0) {
    merged[merged.length - 1] = `${merged[merged.length - 1]}${pendingPrefix}`;
  }
  return merged;
}

function distributeSpanAcrossTokens(
  tokens: string[],
  spanStart: number,
  spanEnd: number
): AlignedBoundaryWord[] {
  if (tokens.length === 0) return [];
  if (tokens.length === 1) {
    return [{ word: tokens[0], start: round3(spanStart), end: round3(Math.max(spanStart + 0.04, spanEnd)) }];
  }
  const safeEnd = Math.max(spanStart + tokens.length * 0.04, spanEnd);
  const totalSpan = safeEnd - spanStart;
  const weights = tokens.map((t) => Math.max(1, normAlnum(t).length));
  const weightSum = weights.reduce((acc, w) => acc + w, 0);
  const out: AlignedBoundaryWord[] = [];
  let cursor = spanStart;
  for (let i = 0; i < tokens.length; i++) {
    const share = (weights[i] / weightSum) * totalSpan;
    const nextCursor = i === tokens.length - 1 ? safeEnd : cursor + share;
    out.push({
      word: tokens[i],
      start: round3(cursor),
      end: round3(nextCursor),
    });
    cursor = nextCursor;
  }
  return out;
}

function matchesAt(rawNorm: string[], origNorm: string[], rIdx: number, oIdx: number): boolean {
  if (rIdx >= rawNorm.length || oIdx >= origNorm.length) return false;
  if (!origNorm[oIdx]) return false;
  if (rawNorm[rIdx] === origNorm[oIdx]) return true;
  let joined = rawNorm[rIdx];
  for (let k = 2; k <= 5 && rIdx + k - 1 < rawNorm.length; k++) {
    joined += rawNorm[rIdx + k - 1];
    if (joined === origNorm[oIdx]) return true;
    if (joined.length > origNorm[oIdx].length) break;
  }
  return false;
}

export function alignRawWordsToManuscript(
  rawWords: RawBoundaryWord[],
  originalText: string
): AlignedBoundaryWord[] {
  if (!rawWords || rawWords.length === 0) return [];
  const trimmedText = originalText.trim();
  if (!trimmedText) {
    return rawWords.map((w) => ({
      word: w.word,
      start: round3(w.start),
      end: round3(Math.max(w.start + 0.04, w.end)),
    }));
  }

  const origTokens = mergePunctuationOnlyTokens(trimmedText.split(/\s+/).filter(Boolean));
  if (origTokens.length === 0) {
    return rawWords.map((w) => ({
      word: w.word,
      start: round3(w.start),
      end: round3(Math.max(w.start + 0.04, w.end)),
    }));
  }

  const rawNorm = rawWords.map((w) => normAlnum(w.word));
  const origNorm = origTokens.map((t) => normAlnum(t));
  const out: AlignedBoundaryWord[] = [];

  let rIdx = 0;
  let oIdx = 0;

  while (rIdx < rawWords.length && oIdx < origTokens.length) {
    const rVal = rawNorm[rIdx];
    const oVal = origNorm[oIdx];

    if (!rVal) {
      rIdx++;
      continue;
    }

    if (rVal === oVal) {
      out.push({
        word: origTokens[oIdx],
        start: round3(rawWords[rIdx].start),
        end: round3(Math.max(rawWords[rIdx].start + 0.04, rawWords[rIdx].end)),
      });
      rIdx++;
      oIdx++;
      continue;
    }

    // Many raw sub-words -> single hyphenated, reduplicated, em-dash, or contracted manuscript token
    let matchedManyToOne = 0;
    let concatRaw = rVal;
    for (let k = 2; k <= 6 && rIdx + k - 1 < rawWords.length; k++) {
      concatRaw += rawNorm[rIdx + k - 1];
      if (concatRaw === oVal) {
        matchedManyToOne = k;
        break;
      }
      if (concatRaw.length > oVal.length + 2) break;
    }
    if (matchedManyToOne > 0) {
      out.push({
        word: origTokens[oIdx],
        start: round3(rawWords[rIdx].start),
        end: round3(Math.max(rawWords[rIdx].start + 0.04, rawWords[rIdx + matchedManyToOne - 1].end)),
      });
      rIdx += matchedManyToOne;
      oIdx += 1;
      continue;
    }

    // Single raw token -> multiple manuscript tokens merged by TTS
    let matchedOneToMany = 0;
    let concatOrig = oVal;
    for (let m = 2; m <= 4 && oIdx + m - 1 < origTokens.length; m++) {
      concatOrig += origNorm[oIdx + m - 1];
      if (concatOrig === rVal) {
        matchedOneToMany = m;
        break;
      }
      if (concatOrig.length > rVal.length + 2) break;
    }
    if (matchedOneToMany > 0) {
      out.push(
        ...distributeSpanAcrossTokens(
          origTokens.slice(oIdx, oIdx + matchedOneToMany),
          rawWords[rIdx].start,
          rawWords[rIdx].end
        )
      );
      rIdx += 1;
      oIdx += matchedOneToMany;
      continue;
    }

    // Look ahead for the nearest exact anchor to resync after numbers, symbols, or TTS insertions
    let bestDr = -1;
    let bestDo = -1;
    let bestCost = Infinity;
    for (let dr = 0; dr <= 4; dr++) {
      for (let dOrig = 0; dOrig <= 4; dOrig++) {
        if (dr === 0 && dOrig === 0) continue;
        if (matchesAt(rawNorm, origNorm, rIdx + dr, oIdx + dOrig)) {
          const cost = dr + dOrig + Math.abs(dr - dOrig) * 0.25;
          if (cost < bestCost) {
            bestCost = cost;
            bestDr = dr;
            bestDo = dOrig;
          }
        }
      }
    }

    if (bestDr === 0 && bestDo > 0) {
      const prevEnd = out.length > 0 ? out[out.length - 1].end : rawWords[rIdx].start;
      const nextStart = Math.max(prevEnd + bestDo * 0.04, rawWords[rIdx].start);
      out.push(...distributeSpanAcrossTokens(origTokens.slice(oIdx, oIdx + bestDo), prevEnd, nextStart));
      oIdx += bestDo;
      continue;
    }

    if (bestDr > 0 && bestDo === 0) {
      // Extra spoken repetition from TTS (e.g. sound-effect echo): fold timing into preceding word if adjacent
      if (out.length > 0 && rawWords[rIdx + bestDr - 1].end - out[out.length - 1].end <= 0.65) {
        out[out.length - 1].end = round3(Math.max(out[out.length - 1].end, rawWords[rIdx + bestDr - 1].end));
      }
      rIdx += bestDr;
      continue;
    }

    if (bestDr > 0 && bestDo > 0) {
      out.push(
        ...distributeSpanAcrossTokens(
          origTokens.slice(oIdx, oIdx + bestDo),
          rawWords[rIdx].start,
          rawWords[rIdx + bestDr - 1].end
        )
      );
      rIdx += bestDr;
      oIdx += bestDo;
      continue;
    }

    // Tail fallback: distribute remaining raw span across remaining manuscript tokens
    out.push(
      ...distributeSpanAcrossTokens(
        origTokens.slice(oIdx),
        rawWords[rIdx].start,
        rawWords[rawWords.length - 1].end
      )
    );
    rIdx = rawWords.length;
    oIdx = origTokens.length;
  }

  if (oIdx < origTokens.length) {
    const remaining = origTokens.slice(oIdx);
    if (out.length > 0) {
      const last = out.pop()!;
      out.push(...distributeSpanAcrossTokens([last.word, ...remaining], last.start, last.end + remaining.length * 0.12));
    } else {
      out.push(...distributeSpanAcrossTokens(remaining, 0.1, 0.1 + remaining.length * 0.25));
    }
  } else if (rIdx < rawWords.length && out.length > 0) {
    out[out.length - 1].end = round3(Math.max(out[out.length - 1].end, rawWords[rawWords.length - 1].end));
  }

  return out;
}

function stripTrailingQuotes(word: string): string {
  return word.replace(/["'”’)\]]+$/g, "").trim();
}

export function isSentenceTerminalWord(word: string): boolean {
  return /[.!?…]+$/.test(stripTrailingQuotes(word));
}

export function isClauseBoundaryWord(word: string): boolean {
  return /[,;:—–]+$/.test(stripTrailingQuotes(word));
}

export function normalizeKaraokeWords<T extends WordTimingLike>(
  words: T[],
  options: KaraokeNormalizeOptions = {}
): NormalizedWordTiming<T>[] {
  if (!words || words.length === 0) return [];
  const minWordDur = options.minWordDurationSec ?? 0.095;
  const maxBridgeGap = options.maxBridgeGapSec ?? 0.32;
  const clauseHold = options.clauseHoldSec ?? 0.22;
  const sentenceHold = options.sentenceHoldSec ?? 0.2;

  const items: NormalizedWordTiming<T>[] = words.map((w) => {
    const s = Math.max(0, Number(w.start) || 0);
    const e = Math.max(s + 0.02, Number(w.end) || s + 0.12);
    return {
      ...w,
      start: round3(s),
      end: round3(e),
      phoneticEnd: round3(e),
      activeEnd: round3(e),
    };
  });

  // Enforce strictly non-overlapping monotonic base intervals
  for (let i = 1; i < items.length; i++) {
    if (items[i].start < items[i - 1].start + 0.01) {
      items[i].start = round3(items[i - 1].start + 0.01);
    }
    if (items[i - 1].end > items[i].start) {
      items[i - 1].end = items[i].start;
      items[i - 1].phoneticEnd = items[i].start;
    }
    if (items[i].end < items[i].start + 0.02) {
      items[i].end = round3(items[i].start + 0.02);
      items[i].phoneticEnd = items[i].end;
    }
  }

  // Ensure short function words ("di", "ke", "a", "in", "to") stay visible >= ~3 frames at 30fps
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const prev = i > 0 ? items[i - 1] : undefined;
    const next = i + 1 < items.length ? items[i + 1] : undefined;
    let dur = cur.end - cur.start;
    if (dur >= minWordDur) continue;

    let need = minWordDur - dur;
    const rightFree = next ? Math.max(0, next.start - cur.end) : need;
    const takeRight = Math.min(need, rightFree);
    cur.end = round3(cur.end + takeRight);
    need -= takeRight;

    if (need > 0.001) {
      const leftFree = prev ? Math.max(0, cur.start - prev.end) : need;
      const takeLeft = Math.min(need, leftFree);
      cur.start = round3(Math.max(0, cur.start - takeLeft));
      need -= takeLeft;
    }

    if (need > 0.001 && next) {
      const nextExcess = Math.max(0, next.end - next.start - minWordDur);
      const borrowNext = Math.min(need, 0.045, nextExcess);
      if (borrowNext > 0.001) {
        next.start = round3(next.start + borrowNext);
        cur.end = next.start;
        need -= borrowNext;
      }
    }

    if (need > 0.001 && prev) {
      const prevExcess = Math.max(0, prev.end - prev.start - minWordDur);
      const borrowPrev = Math.min(need, 0.04, prevExcess);
      if (borrowPrev > 0.001) {
        prev.end = round3(prev.end - borrowPrev);
        prev.phoneticEnd = Math.min(prev.phoneticEnd, prev.end);
        cur.start = prev.end;
      }
    }

    cur.phoneticEnd = cur.end;
  }

  // Bridge continuous intra-clause micro-gaps and apply gentle clause/sentence holds
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const next = i + 1 < items.length ? items[i + 1] : undefined;
    if (!next) {
      cur.activeEnd = round3(Math.max(cur.end + sentenceHold, cur.start + minWordDur));
      continue;
    }

    const gap = Math.max(0, next.start - cur.end);
    const sameSpeaker = (cur.speaker || "") === (next.speaker || "");
    const sentenceEnd = isSentenceTerminalWord(cur.word);
    const clauseEnd = isClauseBoundaryWord(cur.word);

    if (!sentenceEnd && !clauseEnd && sameSpeaker && gap <= maxBridgeGap) {
      cur.activeEnd = next.start;
    } else if (clauseEnd && sameSpeaker && gap <= 0.24) {
      cur.activeEnd = next.start;
    } else if (clauseEnd) {
      cur.activeEnd = round3(Math.min(next.start, cur.end + clauseHold));
    } else {
      cur.activeEnd = round3(Math.min(next.start, cur.end + sentenceHold));
    }

    const minEnd = Math.min(next.start, round3(cur.start + minWordDur));
    if (cur.activeEnd < minEnd) {
      cur.activeEnd = minEnd;
    }
  }

  return items;
}

export function resolveActiveWordState<T extends WordTimingLike>(
  words: NormalizedWordTiming<T>[],
  currentTime: number
): ActiveWordState<T> {
  if (!words || words.length === 0) {
    return {
      activeIndex: -1,
      lastSpokenIndex: -1,
      activeWord: undefined,
      isSpeakingNow: false,
      wordProgress: 0,
    };
  }

  let activeIndex = -1;
  let lastSpokenIndex = -1;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (currentTime >= w.start) {
      lastSpokenIndex = i;
    }
    const withinEnd = i === words.length - 1 ? currentTime <= w.activeEnd : currentTime < w.activeEnd;
    if (currentTime >= w.start && withinEnd) {
      activeIndex = i;
      break;
    }
  }

  if (activeIndex !== -1) {
    const w = words[activeIndex];
    const phoneticSpan = Math.max(0.08, w.phoneticEnd - w.start);
    const progress = Math.min(1, Math.max(0, (currentTime - w.start) / phoneticSpan));
    return {
      activeIndex,
      lastSpokenIndex,
      activeWord: w,
      isSpeakingNow: true,
      wordProgress: progress,
    };
  }

  const anchor = lastSpokenIndex >= 0 ? words[lastSpokenIndex] : words[0];
  return {
    activeIndex: -1,
    lastSpokenIndex,
    activeWord: anchor,
    isSpeakingNow: false,
    wordProgress: 0,
  };
}

export function buildSentenceAwareGroups<T extends WordTimingLike>(
  words: T[],
  options: { isVertical: boolean; maxWords?: number }
): T[][] {
  if (!words || words.length === 0) return [];
  const maxGroupWords = options.maxWords ?? (options.isVertical ? 9 : 12);
  const minClauseSplit = options.isVertical ? 4 : 5;

  const groups: T[][] = [];
  let currentGroup: T[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = i + 1 < words.length ? words[i + 1] : undefined;
    currentGroup.push(w);

    if (!next) break;

    const gapToNext = Math.max(0, next.start - w.end);
    const speakerChanged = Boolean(w.speaker && next.speaker && w.speaker !== next.speaker);
    const sentenceEnd = isSentenceTerminalWord(w.word);
    const clauseEnd = isClauseBoundaryWord(w.word);

    const splitOnSentence = sentenceEnd && (currentGroup.length >= 2 || gapToNext >= 0.28 || speakerChanged);
    const splitOnClause = clauseEnd && (currentGroup.length >= minClauseSplit || gapToNext >= 0.35);
    const splitOnSpeaker = speakerChanged && currentGroup.length >= 2;
    const splitOnMax = currentGroup.length >= maxGroupWords;

    if (splitOnSentence || splitOnClause || splitOnSpeaker || splitOnMax) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  }

  if (currentGroup.length > 0) {
    const prevGroup = groups.length > 0 ? groups[groups.length - 1] : undefined;
    const prevLast = prevGroup ? prevGroup[prevGroup.length - 1] : undefined;
    const canMergeTinyTail =
      prevGroup &&
      prevLast &&
      currentGroup.length <= 2 &&
      !isSentenceTerminalWord(prevLast.word) &&
      (prevLast.speaker || "") === (currentGroup[0].speaker || "") &&
      prevGroup.length + currentGroup.length <= maxGroupWords + 2;

    if (canMergeTinyTail) {
      prevGroup.push(...currentGroup);
    } else {
      groups.push(currentGroup);
    }
  }

  return groups.length > 0 ? groups : [words];
}
