#!/usr/bin/env node
/**
 * Re-applies this hackathon's rules to the upstream e2e fixtures.
 *
 * The suites come from the dyamhackathon repo, which runs a different event:
 * teams of 2-3 there vs 3-5 here, a 30-member cap vs 5, and its own challenge
 * tracks. Run this after pulling test files from upstream:
 *
 *   node scripts/tests/adapt-fixtures.js
 *
 * It is idempotent — running it twice changes nothing.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const edits = [];
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(DIR, f), s);
const note = (f, what) => edits.push(`${f}: ${what}`);

// 1) teams need 3-5 members here, so single-member fixtures get a second one
for (const f of ['e2e-golden-path.js', 'e2e-upload-paths.js']) {
  let s = read(f);
  const m = s.match(/fd\.set\('members', JSON\.stringify\(\[\{([^\n]*?)\}\]\)\);/);
  if (m && !s.includes('}, {')) {
    const second = m[1].replace(/\$\{TAG\}([^`'"]*)/, '${TAG}$1-b').replace('عضو الرحلة', 'عضوة ثالثة').replace("'عضو'", "'عضوة ثالثة'");
    s = s.replace(m[0], `fd.set('members', JSON.stringify([{${m[1]}}, {${second}}]));`);
    write(f, s); note(f, 'second team member added');
  }
}
{
  let s = read('e2e-golden-path.js');
  if (/team \+ 2 members persisted/.test(s)) {
    s = s.replace(/check\('team \+ 2 members persisted', ([^,]+)\.length === 2,/, "check('team + 3 members persisted', $1.length === 3,");
    write('e2e-golden-path.js', s); note('e2e-golden-path.js', 'member assertion -> 3');
  }
}

// 2) e2e-notifications: three members, assertion to match
{
  const f = 'e2e-notifications.js';
  let s = read(f);
  if (s.includes("-member@example.invalid") && !s.includes('-member3@')) {
    const line = s.match(/^.*-member@example\.invalid.*$/m)[0];
    const extra = line.replace('عضو ثاني', 'عضو ثالث').replace('-member@', '-member3@').replace("'0500000002'", "'0500000003'");
    s = s.replace(line, `${line}\n${extra}`);
    s = s.replace('team.participants.length === 2', 'team.participants.length === 3');
    write(f, s); note(f, 'third member + assertion');
  }
}

// 3) teamless fixture participants must be approved to be eligible for bulk email
{
  const f = 'e2e-phase3.js';
  let s = read(f);
  if (s.includes("bulkData.push({ email: e, fullName: `مشارك ${i}` })")) {
    s = s.replace("bulkData.push({ email: e, fullName: `مشارك ${i}` })", "bulkData.push({ email: e, fullName: `مشارك ${i}`, status: 'approved' })");
    write(f, s); note(f, 'bulk participants approved');
  }
}
{
  const f = 'e2e-phase4.js';
  let s = read(f), before = s;
  s = s.replace(/(const p[23] = await prisma\.participant\.create\(\{ data: \{ email: `\$\{TAG\}-p[23]@t\.test`, fullName: 'مشارك [^']*' )\} \}\);/g,
                "$1, status: 'approved' } });");
  if (s !== before) { write(f, s); note(f, 'teamless participants approved'); }
}

// 4) the member cap is 5 here, not 30
{
  const f = 'e2e-member-add-window.js';
  let s = read(f), before = s;
  s = s.replace("check('GET returns 200 with maxMembers=30', g.status === 200 && g.json?.maxMembers === 30, JSON.stringify(g.json));",
                "check('GET returns 200 with maxMembers=5', g.status === 200 && g.json?.maxMembers === 5, JSON.stringify(g.json));");
  s = s.replace('for (let i = current; i < 30; i++)', 'for (let i = current; i < 5; i++)');
  s = s.replace("check('31st member is refused (400) with cap message',", "check('member beyond the cap is refused (400) with cap message',");
  s = s.replace("add5.json.error.includes('30')", "add5.json.error.includes('5')");
  if (s !== before) { write(f, s); note(f, 'cap assertions -> 5'); }
}

// 5) the import suite must use this hackathon's tracks
{
  const f = 'e2e-import.js';
  let s = read(f), before = s;
  const pairs = [
    ["const TRACK = 'البنية التحتية للمياه';", "const TRACK = 'إثراء تجربة ضيوف الرحمن في المدن المقدسة';"],
    ["['', 'Digital Technologies & AI']", "['', 'Sustainable Social Solutions']"],
    ["subTrack:'Digital Technologies & AI'", "subTrack:'Sustainable Social Solutions'"],
    ["subTrack:'Water Infrastructure'", "subTrack:'Social Inclusion for Elderly and Blind'"],
    ["c1.hackathonTrack === 'التقنيات الرقمية والذكاء الاصطناعي'", "c1.hackathonTrack === 'الحلول الاجتماعية المستدامة'"],
    ["check('Water Infrastructure mapped, Female -> أنثى, No -> FALSE',", "check('English alias mapped, Female -> أنثى, No -> FALSE',"],
    ["c2.hackathonTrack === 'البنية التحتية للمياه'", "c2.hackathonTrack === 'تعزيز الدمج المجتمعي لكبار السن والمكفوفين'"],
  ];
  for (const [a, b] of pairs) s = s.split(a).join(b);
  if (s !== before) { write(f, s); note(f, 'tracks swapped'); }
}

console.log(edits.length ? edits.map((e) => '  ' + e).join('\n') : '  (nothing to adapt — already up to date)');
