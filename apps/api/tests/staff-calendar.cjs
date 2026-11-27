const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const source=fs.readFileSync(path.resolve(__dirname,'../src/staff-calendar.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function('module','exports',js)(mod,mod.exports);
const {calendarMonthWindow}=mod.exports;
assert.equal(calendarMonthWindow('2026-11').monthStart,'2026-11-01');
assert.equal(calendarMonthWindow('2026-11').monthEnd,'2026-12-01');
assert.equal(calendarMonthWindow('2028-02').monthEnd,'2028-03-01');
for(const bad of ['2026-13','2026-00','2026-1','2026-11-01','1999-12','2101-01',''])
  assert.equal(calendarMonthWindow(bad),null);
assert.ok(calendarMonthWindow('2026-11').start<'2026-11-01T00:00:00Z');
assert.ok(calendarMonthWindow('2026-11').end>'2026-12-01T00:00:00Z');
console.log('PASS staff-calendar: validación, meses y ventana UTC Cuba');
