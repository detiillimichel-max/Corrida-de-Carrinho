(() => {
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio||1, 2);
  let W=0,H=0;
  const resize = () => {
    W = cv.clientWidth = cv.parentElement.clientWidth;
    H = cv.clientHeight = cv.parentElement.clientHeight;
    cv.width = W*DPR; cv.height = H*DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
  };
  addEventListener('resize', resize,{passive:true}); resize();

  // State
  const storeKey = 'corrida_carrinho_v1';
  const save = JSON.parse(localStorage.getItem(storeKey) || '{}');
  let totalCoins = save.totalCoins||0;
  let bestLapMs = save.bestLapMs||0;
  let owned = new Set(save.owned||['classic']);
  let currentSkin = save.currentSkin||'classic';

  const skins = [
    {id:'classic', name:'Clássico', emoji:'🚗', price:0},
    {id:'police', name:'Polícia', emoji:'🚓', price:150},
    {id:'taxi', name:'Táxi', emoji:'🚕', price:200},
    {id:'racer', name:'Racer', emoji:'🏎️', price:350},
    {id:'bug', name:'Fusca', emoji:'🪲', price:500},
    {id:'fire', name:'Bombeiro', emoji:'🚒', price:750},
    {id:'pickup', name:'Pickup', emoji:'🛻', price:1000},
    {id:'sport', name:'Esportivo', emoji:'🚙', price:1500},
  ];

  const persist = () => localStorage.setItem(storeKey, JSON.stringify({
    totalCoins, bestLapMs, owned:[...owned], currentSkin
  }));

  // UI refs
  const $ = s=>document.querySelector(s);
  const coinsEl = $('#coins'), timeEl=$('#time'), lapEl=$('#lap');
  const startScreen=$('#startScreen'), gameOverScreen=$('#gameOverScreen'), shopScreen=$('#shopScreen');
  const playBtn=$('#playBtn'), retryBtn=$('#retryBtn'), menuBtn=$('#menuBtn');
  const openShopBtn=$('#openShopBtn'), shopBtn=$('#shopBtn'), closeShop=$('#closeShop');
  const pauseBtn=$('#pauseBtn');
  const leftBtn=$('#leftBtn'), rightBtn=$('#rightBtn');
  const driftTxt=$('#driftTxt'), lapFlag=$('#lapFlag');
  const bestLapEl=$('#bestLap'), totalCoinsEl=$('#totalCoins'), skinNameEl=$('#skinName');
  const shopCoinsEl=$('#shopCoins'), shopGrid=$('#shopGrid');

  // Track params
  const track = {cx:0,cy:0,outerRx:0,outerRy:0,innerRx:0,innerRy:0,width:0};
  const updateTrack = ()=>{
    track.cx = W/2;
    track.cy = H*0.52;
    track.outerRx = Math.min(W*0.42, 380);
    track.outerRy = Math.min(H*0.32, 260);
    track.width = Math.min(110, W*0.18);
    track.innerRx = track.outerRx - track.width;
    track.innerRy = track.outerRy - track.width;
  };

  // Game vars
  let running=false, paused=false, over=false;
  let car, camY=0, timeMs=0, lap=1, maxLaps=3, lapStartMs=0, lastCheckpoint=false;
  let coins=[], obstacles=[], particles=[], skidMarks=[];
  let steer=0, steerTarget=0, leftDown=false, rightDown=false;
  let speed=0, maxSpeed=6.2, accel=0.12, driftBoost=0;
  let collected=0, lastSpawnDist=0;

  function resetGame(){
    updateTrack();
    car = {t:-Math.PI/2, x:track.cx, y:track.cy-track.outerRy+track.width/2, angle:-Math.PI/2, vx:0, vy:0, w:36, h:56, drift:0, inv:2000};
    camY=0; timeMs=0; lap=1; lapStartMs=0; lastCheckpoint=false;
    coins=[]; obstacles=[]; particles=[]; skidMarks=[];
    speed=3.5; collected=0; lastSpawnDist=0;
    spawnInitial();
    updateHUD();
  }

  function spawnInitial(){
    const nCoins=24, nObs=10;
    for(let i=0;i<nCoins;i++) spawnCoin(i/(nCoins)*Math.PI*2);
    for(let i=0;i<nObs;i++) spawnObstacle((i+0.5)/nObs*Math.PI*2);
    const startT = -Math.PI/2;
    obstacles = obstacles.filter(o=>{
      let d = Math.abs(((o.t - startT + Math.PI) % (2*Math.PI)) - Math.PI);
      return d > 0.9;
    });
  }

  function pointOnTrack(t, lane=0.5){
    const rx = track.innerRx + (track.outerRx-track.innerRx)*lane;
    const ry = track.innerRy + (track.outerRy-track.innerRy)*lane;
    return {x: track.cx + Math.cos(t)*rx, y: track.cy + Math.sin(t)*ry};
  }

  function spawnCoin(t){
    const lane = 0.25+Math.random()*0.5;
    const p = pointOnTrack(t, lane);
    coins.push({x:p.x, y:p.y, t, r:14, taken:false, bob:Math.random()*Math.PI*2, lane});
  }
  function spawnObstacle(t){
    const lane = 0.2+Math.random()*0.6;
    const p = pointOnTrack(t, lane);
    obstacles.push({x:p.x, y:p.y, t, w:34, h:34, type: Math.random()<0.6?'cone':'barrel', lane});
  }

  function updateHUD(){
    coinsEl.textContent = collected;
    timeEl.textContent = fmt(timeMs);
    lapEl.textContent = `${lap}/${maxLaps}`;
    totalCoinsEl.textContent = totalCoins;
    bestLapEl.textContent = bestLapMs? fmt(bestLapMs): '--';
    skinNameEl.textContent = skins.find(s=>s.id===currentSkin)?.name||'';
    shopCoinsEl.textContent = totalCoins;
  }

  function fmt(ms){
    const s = Math.floor(ms/1000);
    const m = Math.floor(s/60).toString().padStart(2,'0');
    const ss = (s%60).toString().padStart(2,'0');
    return `${m}:${ss}`;
  }

  // Input
  const setSteer = ()=>{ steerTarget = (rightDown?1:0) - (leftDown?1:0); };
  leftBtn.addEventListener('touchstart',e=>{e.preventDefault();leftDown=true;setSteer();},{passive:false});
  leftBtn.addEventListener('touchend',e=>{e.preventDefault();leftDown=false;setSteer();});
  leftBtn.addEventListener('mousedown',()=>{leftDown=true;setSteer();});
  addEventListener('mouseup',()=>{leftDown=false;rightDown=false;setSteer();});
  rightBtn.addEventListener('touchstart',e=>{e.preventDefault();rightDown=true;setSteer();},{passive:false});
  rightBtn.addEventListener('touchend',e=>{e.preventDefault();rightDown=false;setSteer();});
  rightBtn.addEventListener('mousedown',()=>{rightDown=true;setSteer();});
  addEventListener('keydown',e=>{
    if(e.code==='ArrowLeft'||e.code==='KeyA'){leftDown=true;setSteer();}
    if(e.code==='ArrowRight'||e.code==='KeyD'){rightDown=true;setSteer();}
    if(e.code==='Space'){paused=!paused}
  });
  addEventListener('keyup',e=>{
    if(e.code==='ArrowLeft'||e.code==='KeyA'){leftDown=false;setSteer();}
    if(e.code==='ArrowRight'||e.code==='KeyD'){rightDown=false;setSteer();}
  });
  pauseBtn.onclick = ()=>{ if(running) paused=!paused; };

  // Screens
  playBtn.onclick = ()=>{ startGame(); };
  retryBtn.onclick = ()=>{ startGame(); };
  menuBtn.onclick = ()=>{ showMenu(); };
  openShopBtn.onclick = shopBtn.onclick = ()=>{ openShop(); };
  closeShop.onclick = ()=>{ shopScreen.classList.add('hidden'); };

  function showMenu(){
    running=false; over=false; paused=false;
    startScreen.classList.remove('hidden');
    gameOverScreen.classList.add('hidden');
    updateHUD();
  }
  function startGame(){
    resetGame();
    running=true; paused=false; over=false;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    shopScreen.classList.add('hidden');
    last = performance.now();
    requestAnimationFrame(loop);
  }
  function endGame(reason){
    running=false; over=true;
    totalCoins += collected;
    const lapTime = timeMs - lapStartMs;
    if(!bestLapMs || lapTime<bestLapMs) bestLapMs = lapTime;
    persist();
    $('#endTitle').textContent = reason==='win'?'VITÓRIA!':'FIM DE JOGO';
    $('#endSub').textContent = reason==='win'?'Você completou as voltas!':'Você bateu!';
    $('#endTime').textContent = fmt(timeMs);
    $('#endCoins').textContent = collected;
    $('#endLaps').textContent = lap;
    gameOverScreen.classList.remove('hidden');
  }

  // Shop
  function openShop(){ shopScreen.classList.remove('hidden'); renderShop(); }
  function renderShop(){
    shopCoinsEl.textContent = totalCoins;
    shopGrid.innerHTML='';
    skins.forEach(s=>{
      const ownedFlag = owned.has(s.id);
      const div = document.createElement('div');
      div.className='skin'+(currentSkin===s.id?' selected':'')+(ownedFlag?'':' locked');
      div.innerHTML = `<div class="emoji">${s.emoji}</div><div style="font-size:12px;margin-top:4px">${s.name}</div><div class="price">${ownedFlag?'✓':`🪙 ${s.price}`}</div>`;
      div.onclick = ()=>{
        if(!ownedFlag){
          if(totalCoins>=s.price){ totalCoins-=s.price; owned.add(s.id); currentSkin=s.id; persist(); renderShop(); updateHUD(); }
          else{ div.animate([{transform:'translateX(0)'},{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:300}); }
        }else{ currentSkin=s.id; persist(); renderShop(); updateHUD(); }
      };
      shopGrid.appendChild(div);
    });
  }

  // Game loop
  let last=performance.now();
  function loop(now){
    if(!running) return;
    const dt = Math.min(32, now-last); last=now;
    if(!paused) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt){
    timeMs += dt;
    steer += (steerTarget - steer)*0.18;
    speed += (maxSpeed - speed)*0.01;
    speed += accel*0.6;
    const isDrifting = Math.abs(steer)>0.5 && speed>4;
    if(isDrifting){
      car.drift = Math.min(1, car.drift+0.04);
      driftBoost = Math.min(1.5, driftBoost+0.01);
      if(Math.random()<0.5) skidMarks.push({x:car.x+Math.random()*6-3, y:car.y+Math.random()*6-3, a:1});
      driftTxt.classList.add('show');
    }else{
      car.drift *=0.92;
      driftBoost *=0.98;
      driftTxt.classList.remove('show');
    }
    const trackLen = (track.outerRx+track.innerRx)/2;
    const angularSpeed = (speed + driftBoost*1.2) / trackLen * 0.8;
    car.t += angularSpeed * (dt/16.7);
    if(car.t > Math.PI*2) car.t -= Math.PI*2;
    const laneBase = 0.5;
    const laneOffset = steer * 0.35;
    const lane = Math.max(0.08, Math.min(0.92, laneBase + laneOffset));
    const p = pointOnTrack(car.t, lane);
    car.x = p.x;
    car.y = p.y - camY;
    const targetCam = p.y - H*0.65;
    camY += (targetCam - camY)*0.08;
    const p2 = pointOnTrack(car.t+0.01, lane);
    car.angle = Math.atan2(p2.y-p.y, p2.x-p.x);
    const crossStart = car.t > -0.1 && car.t < 0.1;
    if(crossStart && !lastCheckpoint){
      if(lap>1){
        const lapTime = timeMs - lapStartMs;
        if(!bestLapMs || lapTime<bestLapMs) bestLapMs = lapTime;
      }
      lapStartMs = timeMs;
      lap++;
      lapFlag.textContent = `VOLTA ${lap}`;
      lapFlag.classList.add('show');
      setTimeout(()=>lapFlag.classList.remove('show'),900);
      if(lap>maxLaps){ endGame('win'); return; }
    }
    lastCheckpoint = crossStart;
    // coins
    for(const c of coins){
      if(c.taken) continue;
      const pc = pointOnTrack(c.t, c.lane);
      const dy = pc.y - camY;
      if(Math.hypot(pc.x-car.x, dy-car.y) < 36){
        c.taken=true; collected++;
        for(let i=0;i<12;i++) particles.push({x:car.x,y:car.y,vx:Math.cos(i/12*Math.PI*2)*3,vy:Math.sin(i/12*Math.PI*2)*3-1,life:1});
        updateHUD();
      }
    }
    // obstacles with grace period
    if(timeMs > 2000 && car.inv<=0){
      for(const o of obstacles){
        const po = pointOnTrack(o.t, o.lane);
        const dy = po.y - camY;
        if(Math.abs(po.x-car.x)<30 && Math.abs(dy-car.y)<38){
          speed*=0.4;
          car.inv=600;
          for(let i=0;i<16;i++) particles.push({x:car.x,y:car.y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,life:1,color:'#ff4'});
          endGame('crash'); return;
        }
      }
    }
    if(car.inv>0) car.inv-=dt;
    particles = particles.filter(p=> (p.life-=0.025)>0 );
    particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=0.12; });
    skidMarks = skidMarks.filter(s=> (s.a-=0.008)>0 );
    const distAhead = car.t + 1.2;
    if(distAhead - lastSpawnDist > 0.35){
      lastSpawnDist = distAhead;
      if(Math.random()<0.6) spawnCoin(car.t + 0.8 + Math.random()*0.5);
      if(Math.random()<0.35) spawnObstacle(car.t + 0.9 + Math.random()*0.4);
    }
    updateHUD();
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    updateTrack();
    ctx.save();
    ctx.translate(0,-camY);
    ctx.fillStyle='#5a9e4a'; ctx.fillRect(0,0,W,H*3);
    ctx.fillStyle='#3a3f4a'; drawEllipse(track.cx, track.cy, track.outerRx, track.outerRy); ctx.fill();
    ctx.globalCompositeOperation='destination-out'; drawEllipse(track.cx, track.cy, track.innerRx, track.innerRy); ctx.fill(); ctx.globalCompositeOperation='source-over';
    ctx.lineWidth=8; ctx.strokeStyle='#e8e8e8'; drawEllipse(track.cx, track.cy, track.outerRx-4, track.outerRy-4); ctx.stroke(); drawEllipse(track.cx, track.cy, track.innerRx+4, track.innerRy+4); ctx.stroke();
    ctx.setLineDash([18,18]); ctx.lineWidth=4; ctx.strokeStyle='rgba(255,255,255,.7)'; drawEllipse(track.cx, track.cy, (track.innerRx+track.outerRx)/2, (track.innerRy+track.outerRy)/2); ctx.stroke(); ctx.setLineDash([]);
    const sp = pointOnTrack(-Math.PI/2,0), ep = pointOnTrack(-Math.PI/2,1);
    ctx.lineWidth=10; ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(sp.x,sp.y); ctx.lineTo(ep.x,ep.y); ctx.stroke();
    ctx.strokeStyle='#000'; ctx.setLineDash([10,10]); ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(sp.x,sp.y); ctx.lineTo(ep.x,ep.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha=0.25; ctx.fillStyle='#222'; skidMarks.forEach(s=>{ ctx.globalAlpha=s.a*0.25; ctx.beginPath(); ctx.arc(s.x, s.y+camY,4,0,Math.PI*2); ctx.fill(); }); ctx.globalAlpha=1;
    coins.forEach(c=>{ if(c.taken) return; const p=pointOnTrack(c.t,c.lane); c.bob+=0.15; drawEmoji('🪙', p.x, p.y+Math.sin(c.bob)*4,28); });
    obstacles.forEach(o=>{ const p=pointOnTrack(o.t,o.lane); drawEmoji(o.type==='cone'?'🚧':'🛢️', p.x, p.y,34); });
    particles.forEach(p=>{ ctx.globalAlpha=p.life; ctx.fillStyle=p.color||'#fff'; ctx.beginPath(); ctx.arc(p.x, p.y+camY,3,0,Math.PI*2); ctx.fill(); }); ctx.globalAlpha=1;
    ctx.restore();
    ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle + Math.PI/2 + steer*0.25*car.drift);
    ctx.globalAlpha=0.25; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(4,4,20,30,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    const skin = skins.find(s=>s.id===currentSkin); drawEmoji(skin?.emoji||'🚗',0,0,48);
    if(car.drift>0.3){ ctx.globalAlpha=0.4*car.drift; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.ellipse(-10,28,12,8,0,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(10,28,12,8,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; }
    ctx.restore();
    const g=ctx.createRadialGradient(W/2,H/2, Math.min(W,H)*0.4, W/2,H/2, Math.max(W,H)*0.7); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,.25)'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }

  function drawEllipse(cx,cy,rx,ry){ ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); }
  function drawEmoji(e,x,y,size){ ctx.font = `${size}px system-ui, Apple Color Emoji, Segoe UI Emoji`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(e,x,y); }

  showMenu(); renderShop(); updateHUD();
})();
