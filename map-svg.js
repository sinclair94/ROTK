/* =============================================================
   简版示意图渲染器（离线兜底）
   原 SVG Albers 投影地图整体封装为渲染器工厂，接口：
     init() / apply() / flyLoc(k) / zoomIn() / zoomOut() / reset() / zoomText()
   供 map.html 在「示意图」模式或 Leaflet / 高德瓦片不可用时调用。
   ============================================================= */
window.makeSVGRenderer=function(ctx){
  var G=window.GEO, MG=window.MAP_GEO, B=ctx.B, T=ctx.T,
      FS=ctx.FS, FN=ctx.FN, state=ctx.state;

  var svg=document.getElementById("svg");
  var W=G.width, H=G.height;

  function P(lng,lat){ return G.project(lng,lat); }

  /* ---------- 反投影：由图上坐标求经纬度（牛顿迭代） ---------- */
  function invP(px,py){
    var lng=105,lat=35,h=0.05;
    for(var i=0;i<40;i++){
      var c=G.project(lng,lat), ex=px-c[0], ey=py-c[1];
      if(Math.abs(ex)<0.02&&Math.abs(ey)<0.02) break;
      var a=G.project(lng+h,lat), b=G.project(lng-h,lat),
          d=G.project(lng,lat+h), e=G.project(lng,lat-h);
      var dxdl=(a[0]-b[0])/(2*h), dydl=(a[1]-b[1])/(2*h),
          dxdb=(d[0]-e[0])/(2*h), dydb=(d[1]-e[1])/(2*h);
      var det=dxdl*dydb-dxdb*dydl; if(!det) break;
      var dl=(dydb*ex-dxdb*ey)/det, db=(-dydl*ex+dxdl*ey)/det;
      if(!isFinite(dl)||!isFinite(db)) break;
      lng+=Math.max(-4,Math.min(4,dl)); lat+=Math.max(-4,Math.min(4,db));
      lng=Math.max(70,Math.min(140,lng)); lat=Math.max(-5,Math.min(58,lat));
    }
    return [lng,lat];
  }

  /* ---------- 视图（viewBox 缩放平移） ---------- */
  var vb={x:0,y:0,w:W,h:H}, MINW=W/16, MAXW=W/0.75;
  function scale(){ return W/vb.w; }

  /* ---------- 绘制底图 ---------- */
  var s='';
  s+='<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="#fbf8f1"/>';
  s+='<g id="provs">'+G.provinces.map(function(p){
    return '<path class="prov" data-n="'+p.name+'" d="'+p.d+'"><title>'+p.name+'</title></path>';
  }).join("")+'</g>';

  /* 南海诸岛插图（右下角） */
  var nh=G.nanhai, nx=W-nh.w-18, ny=H-nh.h-26;
  s+='<g transform="translate('+nx.toFixed(1)+','+ny.toFixed(1)+')">'+
     '<rect class="nh-box" x="-6" y="-14" width="'+(nh.w+12)+'" height="'+(nh.h+30)+'" rx="4"/>'+
     '<text class="nh-label" x="'+(nh.w/2)+'" y="'+(nh.h+9)+'" text-anchor="middle">南海诸岛</text>'+
     nh.paths.map(function(d){return '<path d="'+d+'" fill="#8a7355" stroke="#8a7355" stroke-width=".4"/>';}).join("")+
     '</g>';

  s+='<g id="layerTerr"></g>';
  s+='<g id="layerProvLabel"></g>';
  s+='<g id="layerModern"></g>';
  s+='<g id="layerCity"></g>';
  s+='<g id="layerBat"></g>';
  svg.innerHTML=s;

  var gTerr=svg.querySelector("#layerTerr"),
      gProvL=svg.querySelector("#layerProvLabel"),
      gMod=svg.querySelector("#layerModern"),
      gCity=svg.querySelector("#layerCity"),
      gBat=svg.querySelector("#layerBat");
  var provEls=[].slice.call(svg.querySelectorAll("#provs .prov"));

  var MODERN=[["北京",116.41,39.90],["上海",121.47,31.23],["广州",113.26,23.13],["深圳",114.06,22.55],
    ["天津",117.20,39.13],["重庆",106.55,29.57],["成都",104.07,30.66],["杭州",120.15,30.28],
    ["武汉",114.31,30.52],["西安",108.94,34.34],["南京",118.78,32.06],["沈阳",123.43,41.80],
    ["郑州",113.63,34.75],["长沙",112.94,28.23],["济南",117.00,36.65],["青岛",120.38,36.07],
    ["太原",112.55,37.87],["合肥",117.28,31.86],["福州",119.30,26.08],["南昌",115.89,28.68],
    ["昆明",102.83,24.88],["南宁",108.37,22.82],["兰州",103.83,36.06],["拉萨",91.14,29.65],
    ["台北",121.56,25.03],["香港",114.17,22.32],["澳门",113.55,22.20],["徐州",117.18,34.26],
    ["苏州",120.58,31.30],["洛阳",112.45,34.62],["扬州",119.42,32.39]];

  var OLD=Object.keys(MG.PLACE).map(function(k){
    var q=MG.PLACE[k], p=P(q[0],q[1]); return {n:k,x:p[0],y:p[1]};
  });

  function poly(ring){
    return ring.map(function(c){var p=P(c[0],c[1]);return p[0].toFixed(1)+","+p[1].toFixed(1);}).join(" ");
  }

  function drawTerr(){
    if(!state.terr){gTerr.innerHTML="";return;}
    gTerr.innerHTML=["wei","shu","wu"].map(function(k){
      if(!state.forces[k]) return "";
      return '<polygon class="terr" points="'+poly(MG.TERR[k])+'" fill="'+FS[k]+'" stroke="'+FS[k]+'"/>';
    }).join("");
  }

  var bboxCache=null;
  function drawProvLabel(){
    var z=scale();
    if(z<1.25){ gProvL.innerHTML=""; return; }
    if(!bboxCache){
      bboxCache=provEls.map(function(el){
        try{ var b=el.getBBox(); return {n:el.getAttribute("data-n"),x:b.x+b.width/2,y:b.y+b.height/2,a:b.width*b.height}; }
        catch(e){ return null; }
      }).filter(Boolean);
    }
    var op=Math.min(1,(z-1.25)/0.7);
    gProvL.setAttribute("opacity",op.toFixed(2));
    gProvL.innerHTML=bboxCache.filter(function(o){ return z>=3 || o.a>1400; }).map(function(o){
      return '<text class="prov-label" x="'+o.x.toFixed(1)+'" y="'+o.y.toFixed(1)+'" text-anchor="middle" font-size="'+(11/z).toFixed(2)+'">'+o.n+'</text>';
    }).join("");
  }

  function drawModern(){
    var z=scale();
    if(z<2.0){ gMod.innerHTML=""; return; }
    gMod.setAttribute("opacity",Math.min(1,(z-2.0)/1.0).toFixed(2));
    gMod.innerHTML=MODERN.map(function(m){
      var p=P(m[1],m[2]);
      return '<g><circle class="mod-dot" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+(2.3/z).toFixed(2)+'"/>'+
             '<text class="mod-txt" x="'+(p[0]+4.6/z).toFixed(1)+'" y="'+(p[1]+3.2/z).toFixed(1)+'" font-size="'+(9.5/z).toFixed(2)+'">'+m[0]+'</text></g>';
    }).join("");
  }

  function drawCity(){
    if(!state.city){gCity.innerHTML="";return;}
    var z=scale();
    gCity.innerHTML=MG.CITIES.filter(function(c){return state.forces[c.f];}).map(function(c){
      var q=MG.PLACE[c.n]; if(!q) return "";
      var p=P(q[0],q[1]);
      return '<g><circle class="city-dot" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+(5.2/z).toFixed(2)+'" fill="'+FS[c.f]+'" data-city="'+c.n+'">'+
             '<title>'+c.n+' — '+c.y+'</title></circle>'+
             '<text class="city-txt" x="'+(p[0]+7.5/z).toFixed(1)+'" y="'+(p[1]+3.6/z).toFixed(1)+'" font-size="'+(10.5/z).toFixed(2)+'">'+c.n+'</text></g>';
    }).join("");
  }

  function drawBat(){
    if(!state.bat){gBat.innerHTML="";return;}
    var z=scale();
    var list=ctx.curList();
    gBat.innerHTML=list.map(function(b,i){
      var p=P(b.xy[0],b.xy[1]);
      var sel=state.sel===b;
      return '<circle class="bat-dot'+(sel?' sel':'')+'" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+((sel?6:4.4)/z).toFixed(2)+'" fill="'+FS[b.f]+'" data-i="'+i+'">'+
        '<title>'+b.y+' · '+b.n+'（'+b.a[0]+' 对 '+b.a[1]+'）</title></circle>';
    }).join("");
  }

  /* ---------- 状态读数 ---------- */
  var elZVal=document.getElementById("zVal"), elStZ=document.getElementById("stZ"),
      elStC=document.getElementById("stC"), elProv=document.getElementById("stProv"),
      elOld=document.getElementById("stOld"), elLL=document.getElementById("stLL");

  function provAt(u){
    try{
      var pt=svg.createSVGPoint(); pt.x=u.x; pt.y=u.y;
      for(var i=0;i<provEls.length;i++){
        if(provEls[i].isPointInFill && provEls[i].isPointInFill(pt)) return provEls[i].getAttribute("data-n");
      }
    }catch(e){}
    return null;
  }
  function llText(ll){ return ll? (ll[1].toFixed(2)+"°N "+ll[0].toFixed(2)+"°E") : "—"; }

  function updateCenter(){
    var cx=vb.x+vb.w/2, cy=vb.y+vb.h/2;
    var pn=provAt({x:cx,y:cy});
    var ll=invP(cx,cy);
    elStC.textContent=(pn||"中国")+(ll? " "+ll[1].toFixed(1)+"°N "+ll[0].toFixed(1)+"°E" : "");
  }

  function setVB(){
    vb.w=Math.max(MINW,Math.min(MAXW,vb.w));
    vb.h=vb.w*(H/W);
    vb.x=Math.max(-0.12*W,Math.min(W*1.12-vb.w,vb.x));
    vb.y=Math.max(-0.12*H,Math.min(H*1.12-vb.h,vb.y));
    svg.setAttribute("viewBox",vb.x.toFixed(2)+" "+vb.y.toFixed(2)+" "+vb.w.toFixed(2)+" "+vb.h.toFixed(2));
    var z=scale();
    elZVal.textContent=Math.round(z*100)+"%";
    elStZ.textContent=z.toFixed(1)+"×";
    drawProvLabel(); drawModern(); drawCity(); drawBat(); updateCenter();
  }

  function zoomAt(ux,uy,f){
    var nw=Math.max(MINW,Math.min(MAXW,vb.w/f)), k=nw/vb.w;
    vb.x=ux-(ux-vb.x)*k; vb.y=uy-(uy-vb.y)*k; vb.w=nw;
    setVB();
  }

  var _pt=null;
  function toUser(cx,cy){
    if(!_pt) _pt=svg.createSVGPoint();
    _pt.x=cx; _pt.y=cy;
    var m=svg.getScreenCTM(); if(!m) return null;
    var q=_pt.matrixTransform(m.inverse());
    return {x:q.x,y:q.y};
  }

  /* ---------- 交互 ---------- */
  var drag=null,moved=false;
  svg.addEventListener("wheel",function(e){
    e.preventDefault();
    var u=toUser(e.clientX,e.clientY); if(!u) return;
    var dy=e.deltaY*(e.deltaMode===1?16:1);
    var f=Math.max(0.45,Math.min(2.2,Math.pow(1.0018,-dy)));
    zoomAt(u.x,u.y,f);
  },{passive:false});

  svg.addEventListener("mousedown",function(e){
    if(e.button!==0) return;
    drag={x:e.clientX,y:e.clientY,vx:vb.x,vy:vb.y}; moved=false; svg.classList.add("grabbing");
  });
  function onWinMove(e){
    if(!drag) return;
    var rect=svg.getBoundingClientRect(), k=vb.w/(rect.width||1);
    var dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    if(Math.abs(dx)+Math.abs(dy)>4) moved=true;
    vb.x=drag.vx-dx*k; vb.y=drag.vy-dy*k;
    setVB();
  }
  function onWinUp(){ if(drag){ drag=null; svg.classList.remove("grabbing"); } }
  window.addEventListener("mousemove",onWinMove);
  window.addEventListener("mouseup",onWinUp);

  svg.addEventListener("mousemove",function(e){
    if(drag) return;
    var u=toUser(e.clientX,e.clientY); if(!u) return;
    elProv.textContent=provAt(u)||"图幅外";
    var near=null,best=1e9;
    for(var i=0;i<OLD.length;i++){
      var dx=OLD[i].x-u.x, dy=OLD[i].y-u.y, d=dx*dx+dy*dy;
      if(d<best){best=d;near=OLD[i];}
    }
    elOld.textContent=(near&&best<=Math.pow(30,2))?near.n:"—";
    elLL.textContent=llText(invP(u.x,u.y));
  });
  svg.addEventListener("mouseleave",function(){
    elProv.textContent="—"; elOld.textContent="—"; elLL.textContent="—";
  });
  svg.addEventListener("dblclick",function(e){
    var u=toUser(e.clientX,e.clientY); if(!u) return;
    zoomAt(u.x,u.y,1.8);
  });

  var touch=null,pinch=null;
  function tdist(a,b){ var dx=a.clientX-b.clientX, dy=a.clientY-b.clientY; return Math.sqrt(dx*dx+dy*dy)||1; }
  svg.addEventListener("touchstart",function(e){
    if(e.touches.length===1){ var t=e.touches[0]; touch={x:t.clientX,y:t.clientY,vx:vb.x,vy:vb.y}; moved=false; }
    else if(e.touches.length===2){ touch=null; pinch={d:tdist(e.touches[0],e.touches[1])}; }
  },{passive:true});
  svg.addEventListener("touchmove",function(e){
    if(pinch&&e.touches.length===2){
      e.preventDefault();
      var mx=(e.touches[0].clientX+e.touches[1].clientX)/2, my=(e.touches[0].clientY+e.touches[1].clientY)/2;
      var u=toUser(mx,my); if(!u) return;
      var d2=tdist(e.touches[0],e.touches[1]);
      zoomAt(u.x,u.y,d2/pinch.d); pinch={d:d2}; return;
    }
    if(touch&&e.touches.length===1){
      e.preventDefault();
      var t=e.touches[0], rect=svg.getBoundingClientRect(), k=vb.w/(rect.width||1);
      var dx=t.clientX-touch.x, dy=t.clientY-touch.y;
      if(Math.abs(dx)+Math.abs(dy)>6) moved=true;
      vb.x=touch.vx-dx*k; vb.y=touch.vy-dy*k; setVB();
    }
  },{passive:false});
  svg.addEventListener("touchend",function(e){ if(e.touches.length===0){ touch=null; pinch=null; } });

  svg.addEventListener("click",function(e){
    if(moved){ moved=false; return; }
    var c=e.target.closest(".bat-dot");
    if(c){ var L=ctx.curList(); ctx.select(L[+c.dataset.i]); return; }
    var cc=e.target.closest(".city-dot");
    if(cc){ state.sel=null; ctx.showCity(cc.dataset.city); drawBat(); return; }
  });

  /* ---------- 平滑飞向某个视图框 ---------- */
  var anim=null;
  function flyToBox(x,y,w){
    var h=w*(H/W);
    var to={x:x,y:y,w:Math.max(MINW,Math.min(MAXW,w))};
    if(anim) cancelAnimationFrame(anim);
    var from={x:vb.x,y:vb.y,w:vb.w}, t0=0, dur=420;
    function step(ts){
      if(!t0) t0=ts;
      var k=Math.min(1,(ts-t0)/dur), e2=1-Math.pow(1-k,3);
      vb.x=from.x+(to.x-from.x)*e2; vb.y=from.y+(to.y-from.y)*e2; vb.w=from.w+(to.w-from.w)*e2;
      setVB();
      if(k<1) anim=requestAnimationFrame(step); else anim=null;
    }
    anim=requestAnimationFrame(step);
  }

  var r={};
  r.init=function(){ setVB(); };
  r.apply=function(){ drawTerr(); setVB(); };
  r.zoomIn=function(){ zoomAt(vb.x+vb.w/2,vb.y+vb.h/2,1.5); };
  r.zoomOut=function(){ zoomAt(vb.x+vb.w/2,vb.y+vb.h/2,1/1.5); };
  r.reset=function(){ flyToBox(0,0,W,H); };
  r.flyLoc=function(k){
    if(k==="__all"){ flyToBox(0,0,W,H); return; }
    var q=MG.PLACE[k]; if(!q) return;
    var p=P(q[0],q[1]), w=W/3.4;
    flyToBox(p[0]-w/2,p[1]-w*(H/W)/2,w);
  };
  r.zoomText=function(){ return Math.round(scale()*100)+"%"; };
  r.destroy=function(){
    window.removeEventListener("mousemove",onWinMove);
    window.removeEventListener("mouseup",onWinUp);
  };
  return r;
};
