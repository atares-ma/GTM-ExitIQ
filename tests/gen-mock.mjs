// Builds mock Supabase REST responses from the constants embedded in the page,
// with a visible "[DB]" marker so the UI test can prove the DB bank is live.
// Usage: node tests/gen-mock.mjs   (writes mock-*.json next to this script)
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const start = html.indexOf('const L = (en, de)');
const end = html.indexOf('class Component');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(html.slice(start, end) + '\n;__out = { PILLARS, QUESTIONS, MORE_QUESTIONS, RED_FLAG_IDS };', ctx);
const { PILLARS, QUESTIONS, MORE_QUESTIONS, RED_FLAG_IDS } = ctx.__out;

const all = QUESTIONS.concat(MORE_QUESTIONS);
const rows = all.map((q, i) => ({
  question_key: q.id,
  text_en: (i === 0 ? '[DB] ' : '') + q.q.en,
  text_de: (i === 0 ? '[DB] ' : '') + q.q.de,
  info_en: q.info ? q.info.en : null,
  info_de: q.info ? q.info.de : null,
  is_red_flag: RED_FLAG_IDS.includes(q.id),
  sort_order: i * 10,
  sectors: q.sectors || null,
  is_follow_up: !!q.followUpFor,
  follow_up_question_key: q.followUpFor || null,
  follow_up_condition: q.followUpFor ? q.condition : null,
  qv_categories: { key: q.p },
  question_options: q.opts
    .map((o, oi) => ({ text_en: o.en, text_de: o.de, score: 2 - oi, sort_order: oi }))
    // reversed + an extra 'na' row to prove the client filters and re-sorts
    .reverse()
    .concat([{ text_en: 'Not applicable', text_de: 'Nicht zutreffend', score: -1, sort_order: 3 }]),
}));
const cats = PILLARS.map((p) => ({ key: p.key, weight_x: p.wx, weight_y: p.wy }));

writeFileSync(new URL('mock-questions.json', import.meta.url), JSON.stringify(rows));
writeFileSync(new URL('mock-categories.json', import.meta.url), JSON.stringify(cats));
console.log('mock rows:', rows.length, 'cats:', cats.length);
