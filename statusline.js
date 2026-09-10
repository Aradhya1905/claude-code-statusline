#!/usr/bin/env node
// Claude Code status line — single line, Windows-friendly (no jq dependency)
// Config override (optional): ~/.claude/statusline-config.json  (same shape as CONFIG below)

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ─────────────────────────── CONFIG ───────────────────────────
const CONFIG = {
  // Context bar
  bar: {
    width: 10,          // number of cells
    filled: '█',
    empty: '░',
    show: true,
  },
  // Color thresholds for context usage (percent). First match wins, top-down.
  // color = 256-color code. https://www.ditig.com/256-colors-cheat-sheet
  ctxThresholds: [
    { at: 80, color: 196 }, // hard red
    { at: 0,  color: 78  }, // green
  ],
  // Same idea for the 5h / 7d rate-limit meters
  limitThresholds: [
    { at: 90, color: 196 },
    { at: 70, color: 203 },
    { at: 50, color: 210 },
    { at: 0,  color: 78  },
  ],
  colors: {
    model: 45,       // cyan
    effort: 141,     // purple (fallback when level not in effortStyles)
    dir: 220,        // yellow
    git: 176,        // magenta
    worktree: 80,    // teal — worktree marker, distinct from branch
    agent: 203,
    label: 245,      // dim labels
    sep: 240,        // separators
    reset: 117,      // reset-time blue
    fast: 214,
  },
  // Effort badge: reverse-video chip so the level is unmissable at a glance.
  // key = effort level string, bg = 256-color code, fg = text color on that bg.
  // color = per-level 256-color code, mark = optional prefix glyph for the
  // levels worth noticing, bg = fill used only by the 'chip' styles.
  effortStyles: {
    low:    { color: 245, bg: 244, text: 'Low',   mark: ''  },
    medium: { color: 74,  bg: 39,  text: 'Med',   mark: ''  },
    high:   { color: 214, bg: 214, text: 'High',  mark: ''  },
    xhigh:  { color: 207, bg: 201, text: 'XHigh', mark: '▲' },
    max:    { color: 203, bg: 196, text: 'Max',   mark: '▲' },
  },
  // Order defines the effort bar's scale: cell count = number of levels,
  // filled cells = 1-based index of the current level.
  effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  // Effort gauge — heat ramp: cells run cool→hot left to right, filled up to the
  // current level, so both length and temperature say how hard the model is going.
  effortBar: {
    // Bracketed meter: the [ ] frame keeps the unreached part legible on any
    // theme, so the empty cells can stay as light as '·'.
    // Alternatives: '█'/'█' + cellsPerLevel 2 (solid strip), '▰'/'▱' (short),
    // '█'/'░' (context-bar look — ░ is full height, pair it only with █).
    filled: '■',
    empty: '·',
    emptyColor: 236,   // dim track behind the unreached part of the ramp
    cellsPerLevel: 1,  // cells each level is worth — 1 × 5 levels = 5-wide meter
    brackets: ['[', ']'], // frame around the meter; set null to drop it
    bracketColor: 240,
    // Cool→hot ramp sampled across the strip. Set null to fall back to a flat
    // fill in the current level's color.
    ramp: [78, 114, 150, 186, 220, 221, 215, 209, 203, 196],
    rampLabel: false,  // true = color the level text with the hottest lit cell
    showLabel: true,   // print the level text after the bar
    showMark: false,   // print effortStyles.mark before the label (redundant with the bar)
  },
  // 'bar'       → stepped gauge + label (matches the context bar)
  // 'text'      → bold colored text, no fill (subtle; color ramp carries the signal)
  // 'chip-loud' → text for low/med/high, filled chip only for xhigh/max
  // 'chip'      → filled chip for every level
  effortStyle: 'bar',
  // Print the "(⑂ …)" marker after the branch when inside a linked worktree.
  // Off by default — the cwd segment to the left already names the worktree.
  showWorktree: false,
  // What to print inside "branch (⑂ …)" when inside a linked worktree:
  //   'auto' → worktree folder name, or the parent repo name when that would
  //            just repeat the cwd segment already shown to the left
  //   'name' → always the worktree folder name
  //   'repo' → always the parent repo name
  worktreeLabel: 'auto',
  icons: {
    thinkingOn: '🚀',
    thinkingOff: '💤',
    fast: '⚡',
    ctx: '◧',
    fiveHour: '⏳',
    sevenDay: '📅',
    resets: '',
    git: '',   // Nerd Font branch glyph. Fallbacks: '' (git logo), '⎇', '' (none)
    worktree: '⑂', // marks a linked git worktree
  },
  showSeparators: true,
  separator: '│',
  timeFormat: 'h12',   // 'h12' | 'h24'
  showResetCountdown: true, // "↻ 3:30pm (2h10m)"
};

// merge user override
try {
  const p = path.join(os.homedir(), '.claude', 'statusline-config.json');
  if (fs.existsSync(p)) {
    const u = JSON.parse(fs.readFileSync(p, 'utf8'));
    const deep = (a, b) => {
      for (const k of Object.keys(b)) {
        if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k]) deep(a[k], b[k]);
        else a[k] = b[k];
      }
    };
    deep(CONFIG, u);
  }
} catch {}
// ──────────────────────────────────────────────────────────────

const fg = (c, s) => `\x1b[38;5;${c}m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[22m`;
// solid chip: bold text on a filled background — reads as a block, not as words
const chip = (fgc, bgc, s) => `\x1b[1;38;5;${fgc};48;5;${bgc}m ${s} \x1b[0m`;

const pick = (thresholds, pct) => {
  for (const t of thresholds) if (pct >= t.at) return t.color;
  return thresholds[thresholds.length - 1].color;
};

const compact = (n) => {
  if (n == null) return '';
  if (n >= 1e9) return trim(n / 1e9) + 'B';
  if (n >= 1e6) return trim(n / 1e6) + 'M';
  if (n >= 1e3) return trim(n / 1e3) + 'k';
  return String(n);
};
const trim = (v) => {
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v.toFixed(1);
  return s.replace(/\.0$/, '');
};

const clock = (d) => {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  if (CONFIG.timeFormat === 'h24') return `${String(h).padStart(2, '0')}:${m}`;
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m}${ap}`;
};

const until = (secs) => {
  const diff = secs * 1000 - Date.now();
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d${Math.floor((mins % 1440) / 60)}h`;
  return h ? `${h}h${m ? m + 'm' : ''}` : `${m}m`;
};

const bar = (pct, color) => {
  if (!CONFIG.bar.show) return '';
  const w = CONFIG.bar.width;
  let n = Math.min(w, Math.max(0, Math.round((pct / 100) * w)));
  if (pct > 0 && n === 0) n = 1; // never show an empty bar for nonzero usage
  return fg(color, CONFIG.bar.filled.repeat(n)) + fg(238, CONFIG.bar.empty.repeat(w - n));
};

// Heat-ramp gauge for a discrete level: `cellsPerLevel` cells per step, lit up to
// `key`, each lit cell taking its color from the ramp sampled across the full strip.
// Returns null when the level isn't on the configured scale (caller falls back to text).
const effortGauge = (key) => {
  const levels = CONFIG.effortLevels || [];
  const rank = levels.indexOf(key) + 1;
  if (rank < 1) return null;
  const B = CONFIG.effortBar || {};
  const own = CONFIG.effortStyles?.[key]?.color ?? CONFIG.colors.effort;
  const on = B.filled ?? '█', off = B.empty ?? '░';
  const per = Math.max(1, B.cellsPerLevel ?? 1);
  const width = levels.length * per;
  const lit = rank * per;
  const ramp = Array.isArray(B.ramp) && B.ramp.length ? B.ramp : null;
  // color of cell i, or null past the lit region
  const cell = (i) => ramp
    ? ramp[width < 2 ? 0 : Math.round((i * (ramp.length - 1)) / (width - 1))]
    : own;

  // emit one escape per run of same-colored cells instead of one per cell
  let out = '', runColor = null, runGlyph = '', runLen = 0;
  const flush = () => { if (runLen) out += fg(runColor, runGlyph.repeat(runLen)); runLen = 0; };
  for (let i = 0; i < width; i++) {
    const c = i < lit ? cell(i) : (B.emptyColor ?? 238);
    const g = i < lit ? on : off;
    if (c !== runColor || g !== runGlyph) { flush(); runColor = c; runGlyph = g; }
    runLen++;
  }
  flush();
  const br = B.brackets;
  if (Array.isArray(br) && br.length === 2) {
    const bc = B.bracketColor ?? 240;
    out = fg(bc, br[0]) + out + fg(bc, br[1]);
  }
  return { bar: out, hot: cell(lit - 1) };
};

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let d = {};
  try { d = JSON.parse(raw || '{}'); } catch {}

  const C = CONFIG.colors;
  const I = CONFIG.icons;
  const seg = [];

  // ── model + effort + thinking ──
  const model = d?.model?.display_name || 'unknown';
  let head = bold(fg(C.model, model));
  const effort = d?.effort?.level;
  if (effort) {
    const key = String(effort).toLowerCase();
    const st = CONFIG.effortStyles?.[key];
    const mode = CONFIG.effortStyle || 'text';
    const gauge = mode === 'bar' ? effortGauge(key) : null;
    if (gauge) {
      const B = CONFIG.effortBar || {};
      head += ' ' + gauge.bar;
      if (B.showLabel !== false) {
        const label = (B.showMark && st?.mark ? st.mark : '') + (st?.text || effort);
        const lc = B.rampLabel !== false ? gauge.hot : (st?.color ?? C.effort);
        head += ' ' + bold(fg(lc, label));
      }
    } else if (!st) {
      head += ' ' + fg(C.effort, effort);
    } else {
      const label = (st.mark || '') + (st.text || effort);
      const filled = mode === 'chip' || (mode === 'chip-loud' && st.mark);
      head += ' ' + (filled ? chip(231, st.bg, label) : bold(fg(st.color, label)));
    }
  }
  if (d?.fast_mode) head += ' ' + fg(C.fast, I.fast);
  head += ' ' + (d?.thinking?.enabled ? I.thinkingOn : I.thinkingOff);
  seg.push(head);

  // ── cwd + git ──
  const cwd = d?.workspace?.current_dir || d?.cwd || '';
  let place = '';
  if (cwd) place += bold(fg(C.dir, path.basename(cwd)));
  let gitBranch = '';
  let worktree = '';   // name of the linked worktree, '' when in the main working tree
  if (cwd) {
    const run = (cmd) => execSync(cmd, {
      cwd, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    }).toString().trim();
    try {
      // one git call: gitdir, common gitdir, worktree root, branch
      const [gitDir = '', commonDir = '', top = '', head = ''] =
        run('git rev-parse --git-dir --git-common-dir --show-toplevel --abbrev-ref HEAD').split(/\r?\n/);
      gitBranch = head && head !== 'HEAD' ? head : '';
      if (!gitBranch) { try { gitBranch = run('git rev-parse --short HEAD'); } catch {} }
      // linked worktree ⇒ its .git dir differs from the repo's common .git dir
      const norm = (p) => path.resolve(cwd, p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      if (CONFIG.showWorktree && gitDir && commonDir && norm(gitDir) !== norm(commonDir)) {
        const wtName = path.basename(top || gitDir) || 'worktree';
        // commonDir is <repo>/.git → its parent is the main repo folder
        const repoName = path.basename(path.dirname(path.resolve(cwd, commonDir))) || '';
        const mode = CONFIG.worktreeLabel || 'auto';
        worktree = mode === 'repo' ? (repoName || wtName)
          : mode === 'name' ? wtName
          : (wtName.toLowerCase() === path.basename(cwd).toLowerCase() && repoName) ? repoName : wtName;
      }
    } catch {}
  }
  if (gitBranch) {
    place += ' ' + fg(C.git, I.git ? `${I.git} ${gitBranch}` : `(${gitBranch})`);
    // branch (worktree) — parens only when actually inside a linked worktree
    if (worktree) place += ' ' + fg(C.worktree, `(${I.worktree}${worktree})`);
  }
  if (place) seg.push(place);

  const agentName = d?.agent?.name;
  if (agentName) seg.push(fg(C.agent, `⚙ ${agentName}`));
  const style = d?.output_style?.name;
  if (style && style !== 'default') seg.push(fg(C.label, `style:${style}`));
  const vim = d?.vim?.mode;
  if (vim) seg.push(fg(78, `[${vim}]`));

  // ── context ──
  const ctx = d?.context_window || {};
  if (ctx.used_percentage != null) {
    const pct = Math.round(ctx.used_percentage);
    const col = pick(CONFIG.ctxThresholds, pct);
    let s = fg(col, I.ctx) + ' ' + bar(pct, col) + ' ' + bold(fg(col, `${pct}%`));
    if (ctx.context_window_size && ctx.total_input_tokens != null) {
      s += ' ' + fg(C.label, `${compact(ctx.total_input_tokens)}/${compact(ctx.context_window_size)}`);
    }
    seg.push(s);
  }

  // ── rate limits ──
  const meter = (rl, icon, name) => {
    if (!rl || rl.used_percentage == null) return null;
    const pct = Math.round(rl.used_percentage);
    const col = pick(CONFIG.limitThresholds, pct);
    let s = `${icon} ` + fg(C.label, name) + ' ' + bold(fg(col, `${pct}%`));
    if (rl.resets_at) {
      const t = clock(new Date(rl.resets_at * 1000));
      s += ' ' + fg(C.reset, `${I.resets}${t}`);
      if (CONFIG.showResetCountdown) s += fg(C.sep, `·${until(rl.resets_at)}`);
    }
    return s;
  };
  const m5 = meter(d?.rate_limits?.five_hour, I.fiveHour, '5h');
  const m7 = meter(d?.rate_limits?.seven_day, I.sevenDay, '7d');
  if (m5) seg.push(m5);
  if (m7) seg.push(m7);

  const joiner = CONFIG.showSeparators
    ? `  ${fg(C.sep, CONFIG.separator)}  `
    : '  ';
  process.stdout.write(seg.join(joiner) + '\n');
});
