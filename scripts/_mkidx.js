/* 生成 data-detail-index.js：人物名 → 详解分片编号（供 people.html 按需加载） */
const fs = require('fs');
const path = require('path');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_plan.json'), 'utf8'));
const idx = {};
plan.forEach(b => (b.people || []).forEach(n => { idx[n] = b.b; }));
const names = Object.keys(idx);
let s = '/* 事件详解分片索引：人物 → 批次号（1-15）。由 _mkidx.js 生成，勿手改 */\n';
s += '(function(){window.DETAIL_INDEX=' + JSON.stringify(idx) + ';})();\n';
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'data-detail-index.js'), s, 'utf8');
console.log('索引人数: ' + names.length);
console.log('批次分布: ' + JSON.stringify(plan.map(b => b.b + ':' + (b.people || []).length).join(' ')));
console.log('文件: data-detail-index.js (' + (s.length / 1024).toFixed(1) + ' KB)');
