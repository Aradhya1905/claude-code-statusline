#!/usr/bin/env node
// Render the status line with fake-but-plausible data, without Claude Code.
//
//   node tools/preview.js                 one line, the defaults
//   node tools/preview.js --all           every effort level, and a near-limit line
//   node tools/preview.js --ctx 92        override context usage percent
//
// Timestamps are generated relative to now, so the reset countdowns read true.

const { execFileSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const script = path.join(__dirname, '..', 'statusline.js');
const inHours = (h) => Math.floor(Date.now() / 1000 + h * 3600);

const payload = (over = {}) => ({
  model: { display_name: 'Opus 5' },
  effort: { level: 'high' },
  fast_mode: false,
  thinking: { enabled: true },
  workspace: { current_dir: process.cwd() },
  output_style: { name: 'Concise' },
  context_window: {
    used_percentage: Number(flag('--ctx', 45)),
    total_input_tokens: 453_000,
    context_window_size: 1_000_000,
  },
  rate_limits: {
    five_hour: { used_percentage: 43, resets_at: inHours(4.5) },
    seven_day: { used_percentage: 48, resets_at: inHours(73) },
  },
  ...over,
});

const render = (data) =>
  execFileSync('node', [script], { input: JSON.stringify(data) }).toString().trimEnd();

if (!args.includes('--all')) {
  console.log(render(payload()));
  process.exit(0);
}

for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
  console.log(render(payload({ effort: { level } })));
}
console.log();
console.log(render(payload({
  context_window: { used_percentage: 92, total_input_tokens: 920_000, context_window_size: 1_000_000 },
  rate_limits: {
    five_hour: { used_percentage: 94, resets_at: inHours(0.4) },
    seven_day: { used_percentage: 71, resets_at: inHours(30) },
  },
})));
