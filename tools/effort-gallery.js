#!/usr/bin/env node
// Effort-display gallery for the Claude Code status line.
// Run:  node tools/effort-gallery.js
//       node tools/effort-gallery.js 7      (only variant 7)

const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const TEXT = { low: 'Low', medium: 'Med', high: 'High', xhigh: 'XHigh', max: 'Max' };
const SHORT = { low: 'L', medium: 'M', high: 'H', xhigh: 'X', max: '!' };
// per-level accent colors (cool → hot)
const COL = { low: 245, medium: 74, high: 214, xhigh: 207, max: 203 };
// bg codes for reverse-video chips (a touch more saturated than the fg)
const BG = { low: 240, medium: 32, high: 208, xhigh: 201, max: 196 };
// 10-cell cool→hot ramp used by the gauge variants
const RAMP = [78, 114, 150, 186, 220, 221, 215, 209, 203, 196];

const fg = (c, s) => `\x1b[38;5;${c}m${s}\x1b[0m`;
const bg = (c, s) => `\x1b[48;5;${c}m${s}\x1b[0m`;
const both = (f, b, s) => `\x1b[1;38;5;${f};48;5;${b}m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[22m`;
const dim = (s) => `\x1b[2m${s}\x1b[22m`;
const und = (s) => `\x1b[4m${s}\x1b[24m`;
const vis = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - vis(s)));

const rank = (k) => LEVELS.indexOf(k) + 1;          // 1..5
const rampAt = (i, w) => RAMP[w < 2 ? 0 : Math.round((i * (RAMP.length - 1)) / (w - 1))];

// generic stepped gauge: `per` cells per level, ramp-colored when hot=true
const gauge = (k, on, off, per, { hot = true, track = 236 } = {}) => {
  const w = LEVELS.length * per, lit = rank(k) * per;
  let out = '';
  for (let i = 0; i < w; i++) {
    out += i < lit ? fg(hot ? rampAt(i, w) : COL[k], on) : fg(track, off);
  }
  return out;
};
const hotColor = (k, per = 2) => rampAt(rank(k) * per - 1, LEVELS.length * per);

// ─────────────────────────── VARIANTS ───────────────────────────
const V = [
  { n: 'ramp bar + label (current)', d: 'heat ramp, 2 cells/level, label takes the hottest lit color',
    f: k => gauge(k, '█', '█', 2) + ' ' + bold(fg(hotColor(k), TEXT[k])) },

  { n: 'ramp bar, no label', d: 'position + temperature alone carry it — shortest of the gauges',
    f: k => gauge(k, '█', '█', 2) },

  { n: 'gapped segments', d: 'discrete steps read as "3 of 5" instead of a continuous fill',
    f: k => gauge(k, '▰', '▱', 1, { track: 238 }) + ' ' + bold(fg(COL[k], TEXT[k])) },

  { n: 'pips', d: 'quietest gauge; scans like a signal-strength dot row',
    f: k => gauge(k, '●', '○', 1, { hot: false, track: 238 }) + ' ' + bold(fg(COL[k], TEXT[k])) },

  { n: 'solid chip', d: 'reverse-video block — highest contrast, impossible to miss',
    f: k => both(231, BG[k], ` ${TEXT[k].toUpperCase()} `) },

  { n: 'powerline chip', d: 'chip with a slanted tail; needs a Nerd Font',
    f: k => both(231, BG[k], ` ${TEXT[k].toUpperCase()} `) + fg(BG[k], '') },

  { n: 'chip + ramp bar', d: 'loud label AND the position on the scale',
    f: k => both(231, BG[k], ` ${SHORT[k]} `) + ' ' + gauge(k, '█', '█', 2) },

  { n: 'rising sparkline', d: 'cells grow in height as effort climbs — shape says the level',
    f: k => {
      const H = ['▁', '▂', '▄', '▆', '█'];
      let out = '';
      for (let i = 0; i < 5; i++) out += i < rank(k) ? fg(RAMP[i * 2], H[i]) : fg(236, H[i]);
      return out + ' ' + bold(fg(COL[k], TEXT[k]));
    } },

  { n: 'background strip', d: 'colored rectangle, no glyphs — a bold slab of pure color',
    f: k => {
      let out = '';
      for (let i = 0; i < 10; i++) out += i < rank(k) * 2 ? bg(rampAt(i, 10), ' ') : bg(236, ' ');
      return out + ' ' + bold(fg(hotColor(k), TEXT[k]));
    } },

  { n: 'thermometer', d: 'icon anchors meaning; mercury column rises',
    f: k => fg(hotColor(k), '🌡') + ' ' + gauge(k, '▮', '▯', 1, { track: 238 }) },

  { n: 'bracketed meter', d: 'the [ ] frame makes the empty part legible on any theme',
    f: k => fg(240, '[') + gauge(k, '■', '·', 1) + fg(240, ']') + ' ' + bold(fg(COL[k], TEXT[k])) },

  { n: 'chevrons', d: 'directional — arrows point at how hard it is pushing',
    f: k => gauge(k, '▸', '▹', 1, { track: 238 }) + ' ' + bold(fg(COL[k], TEXT[k])) },

  { n: 'single glyph', d: 'one character grows in weight; tiniest footprint that still ranks',
    f: k => {
      const G = { low: '·', medium: '▪', high: '◆', xhigh: '▲', max: '⯁' };
      return bold(fg(COL[k], `${G[k]} ${TEXT[k]}`));
    } },

  { n: 'numeric rank', d: 'exact and unambiguous — no glyph literacy required',
    f: k => bold(fg(COL[k], `${TEXT[k]}`)) + fg(240, ` ${rank(k)}/5`) },

  { n: 'underlined label', d: 'no fill at all; the rule under the word carries the color',
    f: k => bold(fg(COL[k], und(` ${TEXT[k]} `))) },

  { n: 'battery', d: 'a familiar fill metaphor with a cap on the right',
    f: k => fg(240, '▐') + gauge(k, '█', ' ', 2, { track: 236 }) + fg(240, '▌') + ' ' + bold(fg(hotColor(k), TEXT[k])) },

  { n: 'dial ticks', d: 'a scale with a marker on it rather than a fill',
    f: k => {
      let out = '';
      for (let i = 0; i < 5; i++) out += i === rank(k) - 1 ? fg(COL[k], '◉') : fg(238, '─');
      return out + ' ' + bold(fg(COL[k], TEXT[k]));
    } },

  { n: 'chip only when loud', d: 'text for low/med/high, chip for xhigh/max — noise only when it matters',
    f: k => (k === 'xhigh' || k === 'max')
      ? both(231, BG[k], ` ${TEXT[k].toUpperCase()} `)
      : bold(fg(COL[k], TEXT[k])) },
];

// ─────────────────────────── RENDER ───────────────────────────
const line = (effort) =>
  [bold(fg(45, 'Opus 5')) + ' ' + effort + ' 🚀',
   bold(fg(220, 'ScratchPad')) + ' ' + fg(176, ' main'),
   fg(78, '◧') + ' ' + fg(78, '███') + fg(238, '░░░░░░░') + ' ' + bold(fg(78, '32%')) + ' ' + fg(245, '64k/200k'),
   '⏳ ' + fg(245, '5h') + ' ' + bold(fg(78, '12%')) + ' ' + fg(117, '3:30pm') + fg(240, '·2h10m'),
  ].join(`  ${fg(240, '│')}  `);

const only = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const W = Math.max(...V.map(v => Math.max(...LEVELS.map(k => vis(v.f(k)))))) + 3;

console.log('');
V.forEach((v, i) => {
  if (only && only !== i + 1) return;
  console.log(bold(fg(231, `${String(i + 1).padStart(2)}. ${v.n}`)) + fg(240, `  — ${v.d}`));
  console.log('    ' + LEVELS.map(k => pad(v.f(k), W)).join(''));
  console.log('    ' + dim(fg(245, 'in situ:')) + ' ' + line(v.f('high')));
  console.log('    ' + dim(fg(245, '   at max:')) + ' ' + line(v.f('max')));
  console.log('');
});
console.log(fg(240, '  Pick one → set effortStyle / effortBar in ~/.claude/statusline-config.json.\n'));
