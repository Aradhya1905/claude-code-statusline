#!/usr/bin/env node
// Installer for the Claude Code status line.
//
//   node install.js            install into ~/.claude
//   node install.js --dir DIR  install into a different Claude home (e.g. a second profile)
//   node install.js --print    show what it would do, change nothing
//
// Copies statusline.js next to your settings.json and points the
// "statusLine" key at it. Any existing settings.json is backed up first.

const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const dryRun = args.includes('--print') || args.includes('-n');
const dirFlag = args.indexOf('--dir');
const claudeHome = dirFlag !== -1 && args[dirFlag + 1]
  ? path.resolve(args[dirFlag + 1])
  : path.join(os.homedir(), '.claude');

const src = path.join(__dirname, 'statusline.js');
const dest = path.join(claudeHome, 'statusline-command.js');
const settingsPath = path.join(claudeHome, 'settings.json');
const toPosix = (p) => p.split(path.sep).join('/');
const command = `node ${toPosix(dest)}`;

const say = (...a) => console.log(...a);

if (!fs.existsSync(src)) {
  console.error(`missing ${src} — run this from inside the cloned repo`);
  process.exit(1);
}
if (!fs.existsSync(claudeHome)) {
  console.error(`no Claude home at ${claudeHome} — is Claude Code installed? (pass --dir to override)`);
  process.exit(1);
}

say(`script   ${src}`);
say(`     ->  ${dest}`);
say(`settings ${settingsPath}`);
say(`command  ${command}`);

if (dryRun) { say('\n--print: nothing written.'); process.exit(0); }

fs.copyFileSync(src, dest);

let settings = {};
if (fs.existsSync(settingsPath)) {
  const backup = `${settingsPath}.bak-${Date.now()}`;
  fs.copyFileSync(settingsPath, backup);
  say(`backup   ${backup}`);
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    console.error(`\n${settingsPath} is not valid JSON (${e.message}).`);
    console.error('Fix it, or add this block by hand:\n');
    console.error(JSON.stringify({ statusLine: { type: 'command', command } }, null, 2));
    process.exit(1);
  }
}

settings.statusLine = { type: 'command', command };
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

say('\ninstalled. Restart Claude Code (or run /statusline) to see it.');
