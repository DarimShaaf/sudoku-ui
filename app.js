/* Sudoku UI (static, no backend) */

const BOARD_SIZE = 9;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

/**
 * puzzle strings use '.' for empty, '1'-'9' for givens
 * (kept in-app for simplicity; no generator needed for UI demo)
 */
const PUZZLES = [
  {
    id: "easy-1",
    difficulty: "Easy",
    grid:
      "53..7...." +
      "6..195..." +
      ".98....6." +
      "8...6...3" +
      "4..8.3..1" +
      "7...2...6" +
      ".6....28." +
      "...419..5" +
      "....8..79",
  },
  {
    id: "easy-2",
    difficulty: "Easy",
    grid:
      "9.3.4...8" +
      "4.....3.." +
      "..8.7...." +
      ".7.....4." +
      "...8.3..." +
      ".5.....1." +
      "....2.8.." +
      "..3.....6" +
      "1...5.7.2",
  },
  {
    id: "medium-1",
    difficulty: "Medium",
    grid:
      "..3.2.6.." +
      "9..3.5..1" +
      "..18.64.." +
      "..81.29.." +
      "7.......8" +
      "..67.82.." +
      "..26.95.." +
      "8..2.3..9" +
      "..5.1.3..",
  },
  {
    id: "medium-2",
    difficulty: "Medium",
    grid:
      ".4.1....." +
      "1.....2.9" +
      "6..8.5..2" +
      "..4..1..." +
      ".2.....3." +
      "...5..4.." +
      "7..9.3..5" +
      "8.3.....6" +
      ".....7.1.",
  },
  {
    id: "hard-1",
    difficulty: "Hard",
    grid:
      "1....7.9." +
      ".3..2...8" +
      "..96..5.." +
      "..53..9.." +
      ".1..8...2" +
      "6....4..." +
      "3......1." +
      ".4......7" +
      "..7...3..",
  },
  {
    id: "hard-2",
    difficulty: "Hard",
    grid:
      "..5.3...." +
      "8.......9" +
      ".....6.2." +
      ".2.4.3.7." +
      "..3.8.5.." +
      ".1.7.9.4." +
      ".4.1....." +
      "2.......8" +
      "....5.9..",
  },
];

const els = {
  board: document.getElementById("board"),
  pad: document.getElementById("pad"),
  newPuzzleBtn: document.getElementById("newPuzzleBtn"),
  resetBtn: document.getElementById("resetBtn"),
  checkBtn: document.getElementById("checkBtn"),
  notesToggle: document.getElementById("notesToggle"),
  difficultyPill: document.getElementById("difficultyPill"),
  statusPill: document.getElementById("statusPill"),
};

/** @type {number} */
let selectedIdx = -1;

/** @type {number} */
let puzzleIdx = 0;
let currentDifficulty = "Easy";
const puzzleCycleByDifficulty = {
  Easy: [],
  Medium: [],
  Hard: [],
};
let puzzlePool = null;

/** @type {Uint8Array} 0 if empty else 1-9 */
let given = new Uint8Array(CELL_COUNT);

/** @type {Uint8Array} 0 if empty else 1-9 (includes givens) */
let values = new Uint8Array(CELL_COUNT);

/** @type {Uint16Array} notes bitmask (bits 0..8) */
let notes = new Uint16Array(CELL_COUNT);

/** snapshots used by Reset */
let initialValues = new Uint8Array(CELL_COUNT);
let initialNotes = new Uint16Array(CELL_COUNT);

/** cache cell nodes for fast updates */
/** @type {HTMLButtonElement[]} */
let cellButtons = [];
/** @type {HTMLSpanElement[]} */
let cellValueEls = [];
/** @type {HTMLSpanElement[][]} */
let cellNoteEls = [];

function idxToRC(idx) {
  return { r: Math.floor(idx / 9), c: idx % 9 };
}

function rcToIdx(r, c) {
  return r * 9 + c;
}

function boxIndex(r, c) {
  return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

function inBounds(r, c) {
  return r >= 0 && r < 9 && c >= 0 && c < 9;
}

function setStatus(text) {
  els.statusPill.textContent = text;
}

function setDifficulty(text) {
  els.difficultyPill.textContent = `Difficulty: ${text}`;
}

function parsePuzzleGrid(gridStr) {
  if (typeof gridStr !== "string" || gridStr.length !== CELL_COUNT) {
    throw new Error("Invalid puzzle grid string");
  }

  const g = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    const ch = gridStr[i];
    if (ch === ".") g[i] = 0;
    else if (ch >= "1" && ch <= "9") g[i] = ch.charCodeAt(0) - 48;
    else throw new Error(`Invalid char at ${i}: ${ch}`);
  }
  return g;
}

function shuffleCopy(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = out[i];
    out[i] = out[j];
    out[j] = temp;
  }
  return out;
}

function transformPuzzleGrid(gridStr) {
  const bands = shuffleCopy([0, 1, 2]);
  const stacks = shuffleCopy([0, 1, 2]);

  const rowPerm = [];
  for (const band of bands) {
    const within = shuffleCopy([0, 1, 2]);
    for (const w of within) rowPerm.push(band * 3 + w);
  }

  const colPerm = [];
  for (const stack of stacks) {
    const within = shuffleCopy([0, 1, 2]);
    for (const w of within) colPerm.push(stack * 3 + w);
  }

  const digits = shuffleCopy(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  const digitMap = {
    "1": digits[0], "2": digits[1], "3": digits[2],
    "4": digits[3], "5": digits[4], "6": digits[5],
    "7": digits[6], "8": digits[7], "9": digits[8],
  };

  let out = "";
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const srcR = rowPerm[r];
      const srcC = colPerm[c];
      const ch = gridStr[srcR * 9 + srcC];
      out += ch === "." ? "." : digitMap[ch];
    }
  }
  return out;
}

function gridHasGivenConflicts(gridStr) {
  const vals = parsePuzzleGrid(gridStr);

  const hasDupes = (indices) => {
    const seen = new Uint8Array(10);
    for (const i of indices) {
      const v = vals[i];
      if (v === 0) continue;
      if (seen[v]) return true;
      seen[v] = 1;
    }
    return false;
  };

  for (let r = 0; r < 9; r++) {
    const rowIndices = [];
    for (let c = 0; c < 9; c++) rowIndices.push(rcToIdx(r, c));
    if (hasDupes(rowIndices)) return true;
  }

  for (let c = 0; c < 9; c++) {
    const colIndices = [];
    for (let r = 0; r < 9; r++) colIndices.push(rcToIdx(r, c));
    if (hasDupes(colIndices)) return true;
  }

  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const boxIndices = [];
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) boxIndices.push(rcToIdx(r, c));
      }
      if (hasDupes(boxIndices)) return true;
    }
  }

  return false;
}

function getPuzzlePool() {
  if (puzzlePool) return puzzlePool;

  const targetPerDifficulty = 6;
  const levels = ["Easy", "Medium", "Hard"];
  const byDiff = { Easy: [], Medium: [], Hard: [] };

  for (const puzzle of PUZZLES) {
    if (levels.includes(puzzle.difficulty) && !gridHasGivenConflicts(puzzle.grid)) {
      byDiff[puzzle.difficulty].push(puzzle);
    }
  }

  for (const level of levels) {
    const baseList = byDiff[level].slice();
    const seen = new Set(baseList.map((p) => p.grid));
    let attempts = 0;

    while (byDiff[level].length < targetPerDifficulty && baseList.length > 0 && attempts < 500) {
      attempts++;
      const base = baseList[Math.floor(Math.random() * baseList.length)];
      const variantGrid = transformPuzzleGrid(base.grid);
      if (seen.has(variantGrid)) continue;
      if (gridHasGivenConflicts(variantGrid)) continue;

      seen.add(variantGrid);
      byDiff[level].push({
        id: `${base.id}-v${byDiff[level].length + 1}`,
        difficulty: level,
        grid: variantGrid,
      });
    }
  }

  puzzlePool = [...byDiff.Easy, ...byDiff.Medium, ...byDiff.Hard];
  return puzzlePool;
}

function loadPuzzleFromData(puzzleData, baseIndex = puzzleIdx) {
  const poolSize = getPuzzlePool().length;
  puzzleIdx = poolSize > 0 ? (baseIndex + poolSize) % poolSize : 0;
  const parsed = parsePuzzleGrid(puzzleData.grid);

  given = parsed;
  values = new Uint8Array(parsed);
  notes = new Uint16Array(CELL_COUNT);

  initialValues = new Uint8Array(values);
  initialNotes = new Uint16Array(notes);

  selectedIdx = -1;
  setDifficulty(puzzleData.difficulty);
  setStatus("Ready");
  renderAll();
}

function puzzleIndexesByDifficulty(level) {
  const pool = getPuzzlePool();
  const out = [];
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].difficulty === level) out.push(i);
  }
  return out;
}

function refillPuzzleCycle(level) {
  const pool = puzzleIndexesByDifficulty(level);
  const cycle = pool.slice();
  for (let i = cycle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = cycle[i];
    cycle[i] = cycle[j];
    cycle[j] = temp;
  }
  puzzleCycleByDifficulty[level] = cycle;
}

function loadRandomPuzzleByDifficulty(level) {
  if (level !== "Easy" && level !== "Medium" && level !== "Hard") return;

  if (!puzzleCycleByDifficulty[level] || puzzleCycleByDifficulty[level].length === 0) {
    refillPuzzleCycle(level);
  }

  let pick = puzzleCycleByDifficulty[level].shift();
  if (pick === undefined) return;

  if (pick === puzzleIdx && puzzleCycleByDifficulty[level].length > 0) {
    pick = puzzleCycleByDifficulty[level].shift();
  }

  loadPuzzle(pick);
}

function loadPuzzle(nextPuzzleIdx) {
  const pool = getPuzzlePool();
  if (pool.length === 0) return;
  puzzleIdx = (nextPuzzleIdx + pool.length) % pool.length;
  const p = pool[puzzleIdx];
  loadPuzzleFromData(p, puzzleIdx);
}

function resetPuzzle() {
  values = new Uint8Array(initialValues);
  notes = new Uint16Array(initialNotes);
  setStatus("Reset");
  renderAll();
}

function isEditable(idx) {
  return given[idx] === 0;
}

function valueAt(r, c) {
  return values[rcToIdx(r, c)];
}

function setValueAt(idx, digit) {
  if (!isEditable(idx)) return;

  const d = Math.max(0, Math.min(9, digit | 0));
  values[idx] = d;
  if (d !== 0) notes[idx] = 0; // entering a value clears notes for that cell
}

function toggleNoteAt(idx, digit) {
  if (!isEditable(idx)) return;
  const d = digit | 0;
  if (d < 1 || d > 9) return;
  if (values[idx] !== 0) return; // don't store notes when a value exists

  const bit = 1 << (d - 1);
  notes[idx] ^= bit;
}

function clearCell(idx) {
  if (!isEditable(idx)) return;
  values[idx] = 0;
  notes[idx] = 0;
}

function computeConflicts() {
  // Returns a boolean array marking conflicting cells (duplicate non-zero in any unit)
  const conflict = new Uint8Array(CELL_COUNT);

  const seen = new Int8Array(10);
  const firstPos = new Int16Array(10);
  const resetUnitState = () => {
    seen.fill(0);
    firstPos.fill(-1);
  };

  const visitCell = (cellIdx) => {
    const v = values[cellIdx];
    if (v === 0) return;
    if (seen[v]) {
      conflict[cellIdx] = 1;
      conflict[firstPos[v]] = 1;
    } else {
      seen[v] = 1;
      firstPos[v] = cellIdx;
    }
  };

  for (let r = 0; r < 9; r++) {
    resetUnitState();
    for (let c = 0; c < 9; c++) visitCell(rcToIdx(r, c));
  }

  for (let c = 0; c < 9; c++) {
    resetUnitState();
    for (let r = 0; r < 9; r++) visitCell(rcToIdx(r, c));
  }

  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      resetUnitState();
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) visitCell(rcToIdx(r, c));
      }
    }
  }

  return conflict;
}

function isCompleteAndValid() {
  const conflict = computeConflicts();
  for (let i = 0; i < CELL_COUNT; i++) {
    if (values[i] === 0) return { ok: false, reason: "Incomplete" };
    if (conflict[i]) return { ok: false, reason: "Conflicts" };
  }
  return { ok: true, reason: "Solved" };
}

function buildBoardDomOnce() {
  els.board.innerHTML = "";
  cellButtons = [];
  cellValueEls = [];
  cellNoteEls = [];

  for (let idx = 0; idx < CELL_COUNT; idx++) {
    const { r, c } = idxToRC(idx);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell";
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-rowindex", String(r + 1));
    btn.setAttribute("aria-colindex", String(c + 1));
    btn.dataset.idx = String(idx);

    // thicker 3x3 boundaries
    if (c === 2 || c === 5) btn.classList.add("bR");
    if (r === 2 || r === 5) btn.classList.add("bB");

    const valueSpan = document.createElement("span");
    valueSpan.className = "value";
    valueSpan.textContent = "";

    const notesWrap = document.createElement("div");
    notesWrap.className = "notes";
    const notesForCell = [];
    for (let d = 1; d <= 9; d++) {
      const n = document.createElement("span");
      n.textContent = String(d);
      notesForCell.push(n);
      notesWrap.appendChild(n);
    }

    btn.appendChild(valueSpan);
    btn.appendChild(notesWrap);

    btn.addEventListener("click", () => {
      selectCell(idx);
    });

    cellButtons.push(btn);
    cellValueEls.push(valueSpan);
    cellNoteEls.push(notesForCell);
    els.board.appendChild(btn);
  }
}

function selectCell(idx) {
  if (idx < 0 || idx >= CELL_COUNT) {
    selectedIdx = -1;
    renderAll();
    return;
  }
  selectedIdx = idx;
  renderAll();
  cellButtons[idx]?.focus();
}

function moveSelection(dr, dc) {
  if (selectedIdx === -1) return;
  const { r, c } = idxToRC(selectedIdx);
  const nr = r + dr;
  const nc = c + dc;
  if (!inBounds(nr, nc)) return;
  selectCell(rcToIdx(nr, nc));
}

function renderCell(idx, conflictArr) {
  const btn = cellButtons[idx];
  if (!btn) return;

  const v = values[idx];
  const isGiven = given[idx] !== 0;
  const isFilled = v !== 0;

  btn.classList.toggle("given", isGiven);
  btn.classList.toggle("filled", !isGiven && isFilled);
  btn.classList.toggle("selected", idx === selectedIdx);
  btn.classList.toggle("conflict", conflictArr[idx] === 1);

  // selection relationships
  let related = false;
  let sameValue = false;
  if (selectedIdx !== -1) {
    const a = idxToRC(selectedIdx);
    const b = idxToRC(idx);
    related = a.r === b.r || a.c === b.c || boxIndex(a.r, a.c) === boxIndex(b.r, b.c);
    const sv = values[selectedIdx];
    sameValue = sv !== 0 && values[idx] === sv;
  }
  btn.classList.toggle("related", selectedIdx !== -1 && related && idx !== selectedIdx);
  btn.classList.toggle("sameValue", selectedIdx !== -1 && sameValue && idx !== selectedIdx);

  // content
  const valueSpan = cellValueEls[idx];
  if (valueSpan) valueSpan.textContent = v === 0 ? "" : String(v);

  // notes
  const noteMask = notes[idx];
  const showNotes = v === 0 && noteMask !== 0;
  btn.classList.toggle("showNotes", showNotes);

  const noteEls = cellNoteEls[idx];
  if (noteEls && noteEls.length === 9) {
    for (let d = 1; d <= 9; d++) {
      const on = (noteMask & (1 << (d - 1))) !== 0;
      noteEls[d - 1].classList.toggle("on", on);
    }
  }

  // ARIA
  const { r, c } = idxToRC(idx);
  const labelParts = [`Row ${r + 1}`, `Col ${c + 1}`];
  if (isGiven) labelParts.push(`Given ${v}`);
  else if (v !== 0) labelParts.push(`Value ${v}`);
  else if (showNotes) labelParts.push("Notes");
  else labelParts.push("Empty");
  btn.setAttribute("aria-label", labelParts.join(", "));
}

function renderAll() {
  if (cellButtons.length !== CELL_COUNT) buildBoardDomOnce();

  const conflictArr = computeConflicts();
  for (let i = 0; i < CELL_COUNT; i++) renderCell(i, conflictArr);

  // lightweight status
  let conflicts = 0;
  for (let i = 0; i < CELL_COUNT; i++) conflicts += conflictArr[i] ? 1 : 0;
  if (conflicts > 0) setStatus(`Conflicts: ${conflicts}`);
}

function handleDigit(digit) {
  if (selectedIdx === -1) return;
  if (!isEditable(selectedIdx)) return;

  const notesMode = !!els.notesToggle.checked;
  if (notesMode) toggleNoteAt(selectedIdx, digit);
  else setValueAt(selectedIdx, digit);

  renderAll();
}

function handleErase() {
  if (selectedIdx === -1) return;
  if (!isEditable(selectedIdx)) return;

  // erase clears value if present; otherwise clears notes
  if (values[selectedIdx] !== 0) values[selectedIdx] = 0;
  else notes[selectedIdx] = 0;

  renderAll();
}

function runCheck() {
  const result = isCompleteAndValid();
  if (result.ok) setStatus("Solved!");
  else if (result.reason === "Conflicts") setStatus("Fix conflicts first");
  else setStatus("Not solved yet");
  renderAll();
}

function wireEvents() {
  els.pad.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const digit = t.dataset.digit;
    const action = t.dataset.action;
    if (digit) handleDigit(Number(digit));
    else if (action === "erase") handleErase();
    else if (action === "deselect") selectCell(-1);
  });

  els.newPuzzleBtn.addEventListener("click", () => {
    loadRandomPuzzleByDifficulty(currentDifficulty);
  });

  document.querySelectorAll("[data-difficulty]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const level = btn.getAttribute("data-difficulty");
      if (level !== "Easy" && level !== "Medium" && level !== "Hard") return;

      currentDifficulty = level;

      document.querySelectorAll("[data-difficulty]").forEach((b) => {
        b.classList.toggle("isActive", b.getAttribute("data-difficulty") === level);
      });

      loadRandomPuzzleByDifficulty(level);
    });
  });

  els.resetBtn.addEventListener("click", () => resetPuzzle());
  els.checkBtn.addEventListener("click", () => runCheck());

  document.addEventListener("keydown", (e) => {
    // don't steal shortcuts with ctrl/cmd/alt
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const k = e.key;

    if (k === "Escape") {
      selectCell(-1);
      return;
    }

    if (k === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1, 0);
      return;
    }
    if (k === "ArrowDown") {
      e.preventDefault();
      moveSelection(1, 0);
      return;
    }
    if (k === "ArrowLeft") {
      e.preventDefault();
      moveSelection(0, -1);
      return;
    }
    if (k === "ArrowRight") {
      e.preventDefault();
      moveSelection(0, 1);
      return;
    }

    if (k === "Backspace" || k === "Delete" || k === "0") {
      e.preventDefault();
      handleErase();
      return;
    }

    if (k === "n" || k === "N") {
      els.notesToggle.checked = !els.notesToggle.checked;
      setStatus(els.notesToggle.checked ? "Notes: ON" : "Notes: OFF");
      return;
    }

    if (k >= "1" && k <= "9") {
      e.preventDefault();
      handleDigit(Number(k));
    }
  });
}

function init() {
  buildBoardDomOnce();
  wireEvents();
  currentDifficulty = "Easy";
  loadRandomPuzzleByDifficulty(currentDifficulty);
}

init();

