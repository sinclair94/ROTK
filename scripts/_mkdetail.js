/* 生成「事件详解」人选清单：按关系网权重取前 150 人，导出每个人的事件数组供撰写详解 */
const fs=require('fs'),path=require('path'),vm=require('vm');
const DIR=__dirname;                                  // 脚本所在目录（scripts/）
const SRC=path.join(__dirname,'..','docs');            // 站点源目录
const ctx={window:{}};
vm.createContext(ctx);
/* 按 people.html 的装载顺序执行，避免基础数组覆盖 concat 结果 */
const ORDER=['data/data-wei.js','data/data-shu.js','data/data-wu-qun.js','data/data-more-wei.js','data/data-more-wei2.js',
'data/data-more-shu.js','data/data-more-shu2.js','data/data-more-wu.js','data/data-more-wu2.js','data/data-more-wu3.js',
'data/data-more-jin.js','data/data-more-qun.js','data/data-more-qun2.js','data/data-more-qun3.js','data/data-more-qun4.js',
'data/data-more-qun5.js','data/data-more-qun6.js','data/data-more-qun7.js','data/data-more-qun8.js','data/data-more-qun9.js'];
for(const f of ORDER){
  try{ vm.runInContext(fs.readFileSync(path.join(SRC,f),'utf8'),ctx,{filename:f}); }
  catch(e){ console.log('skip',f,e.message.slice(0,80)); }
}
vm.runInContext(fs.readFileSync(path.join(SRC,'data','data-network.js'),'utf8'),ctx,{filename:'data-network.js'});
const W=ctx.window;

/* 汇总全部人物 */
const all=[];
['P_WEI','P_SHU','P_WU','P_QUN','P_JIN'].forEach(k=>{ (W[k]||[]).forEach(p=>all.push(p)); });
console.log('人物总数:',all.length);
const weight={}; (W.NET_NODES||[]).forEach(n=>{ weight[n.n]=n.w||0; });

/* 去重：同名取事件数多的 */
const byName={};
all.forEach(p=>{
  if(!byName[p.n]||p.e.length>byName[p.n].e.length) byName[p.n]=p;
});
const uniq=Object.keys(byName).map(k=>byName[k]);

const top=uniq.slice().sort((a,b)=>(weight[b.n]||0)-(weight[a.n]||0)).slice(0,150);
const FNc={wei:'魏',shu:'蜀',wu:'吴',qun:'群',jin:'晋'};
let evTotal=0;
const manifest=top.map((p,i)=>{
  evTotal+=p.e.length;
  return {rank:i+1,name:p.n,zi:p.z||'',fac:FNc[p.f]||p.f,w:weight[p.n]||0,nev:p.e.length,
          evs:p.e.map(e=>[e[0],e[1]])};
});
fs.writeFileSync(path.join(__dirname,'_detail_manifest.json'),JSON.stringify(manifest,null,1),'utf8');
console.log('前 150 人事件总数:',evTotal);
console.log('权重分布: 头部前10 =',top.slice(0,10).map(p=>p.n+':'+weight[p.n]).join(' | '));
console.log('末位10 =',top.slice(-10).map(p=>p.n+':'+(weight[p.n]||0)).join(' | '));
const cnt={}; top.forEach(p=>{const k=FNc[p.f]||p.f; cnt[k]=(cnt[k]||0)+1;});
console.log('阵营分布:',JSON.stringify(cnt));
