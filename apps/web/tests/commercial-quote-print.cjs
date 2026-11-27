const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const m={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/commercial-quote-print.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);
const q={id:'qa',request_id:'r',title:'<script>alert(1)</script>',version_no:2,total_cents:12500,subtotal_cents:10000,taxes_cents:500,freight_cents:2000,discount_cents:0,valid_until:'2026-12-31',stock_notes:'Cliente aporta 8 paneles',items:[{description:'Montaje & configuración',quantity:8,unit_price_usd_cents:1250,line_total_usd_cents:10000}],internal_notes:'SECRETO_INTERNO',cost_cents:123,customer_decision:{evidence:'SECRETO_EVIDENCIA'}};
const html=m.exports.commercialQuoteHtml(q,false);
assert.match(html,/BORRADOR INTERNO/);assert.match(html,/125\.00 USD/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Montaje &amp; configuración/);assert.match(html,/Cliente aporta 8 paneles/);
assert.doesNotMatch(html,/<script>|SECRETO_INTERNO|SECRETO_EVIDENCIA/);
assert.match(html,/no equivale a la firma del contrato/);
assert.doesNotMatch(m.exports.commercialQuoteHtml(q,true),/BORRADOR INTERNO/);
console.log('PASS commercial proposal: totals, escaped content, no internal data, explicit draft and contract separation');
