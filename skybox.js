/* =========================================================================
   ███  SKYBOX — céu com ciclo dia/noite (p5.js, modo WEBGL)  ███
   -------------------------------------------------------------------------
   Como usar na cena (já está integrado no index.js):

     function setup() {
       createCanvas(800, 600, WEBGL);
       Skybox.init();                 // gera as estrelas (uma vez)
     }

     function draw() {
       background(0);
       orbitControl();                // ou a câmera de vocês

       Skybox.draw(t);                // t = 0 (amanhecer) .. 1 (anoitecer)
       //  ^ desenhe o céu PRIMEIRO, ANTES de chamar lights()/ambientLight()
       //    da cena. O céu usa cor por vértice e não deve receber luz.

       // ... agora a parte de vocês (terreno, objetos, etc.) ...
     }

   Bônus p/ quem cuida da iluminação da cena — sincronize com o céu:
     const L = Skybox.getLightColor(t);     // cor da luz do sol/lua [r,g,b]
     const dir = Skybox.getSunDir(t);       // direção do sol {x,y,z} (y é p/ baixo)
     directionalLight(L[0], L[1], L[2], -dir.x, -dir.y, -dir.z);
     const A = Skybox.getAmbientColor(t);
     ambientLight(A[0], A[1], A[2]);
   ========================================================================= */
const Skybox = {
  // ---- configuração ----
  R: 2400,          // raio da cúpula (deixe bem maior que a cena; o domo segue a câmera)
  starCount: 320,

  // paletas-chave: cor do topo e do horizonte ao longo do dia (t em 0..1)
  _SKY: [
    { t:0.00, top:[18,22,56],   bot:[58,52,96]  },
    { t:0.10, top:[54,66,126],  bot:[232,138,110]},
    { t:0.18, top:[96,150,214], bot:[250,196,150]},
    { t:0.34, top:[74,142,232], bot:[196,222,248]},
    { t:0.50, top:[58,128,240], bot:[202,228,252]},
    { t:0.68, top:[86,138,220], bot:[226,208,196]},
    { t:0.80, top:[88,80,150],  bot:[252,146,84] },
    { t:0.90, top:[50,42,100],  bot:[206,92,72]  },
    { t:1.00, top:[12,14,40],   bot:[34,32,70]   },
  ],
  _stars: [],

  // ---- inicialização (chame em setup) ----
  init() {
    this._stars = [];
    for (let i = 0; i < this.starCount; i++) {
      const th = Math.random()*Math.PI*2;
      const ph = (0.02 + Math.random()*0.5) * Math.PI;  // perto do topo
      const r = this.R * 0.96;
      this._stars.push({
        x: r*Math.sin(ph)*Math.cos(th),
        y: -r*Math.cos(ph),
        z: r*Math.sin(ph)*Math.sin(th),
        w: 1.2 + Math.random()*1.8,
        ph: Math.random()*Math.PI*2,
      });
    }
  },

  // ---- consultas úteis para o resto da cena ----
  getSunDir(t) {
    const p = this._path(t);
    return this._norm({ x:Math.cos(p), y:-Math.sin(p), z:0.18 });
  },
  getMoonDir(t) {
    const p = this._path(t);
    return this._norm({ x:-Math.cos(p), y:Math.sin(p), z:0.18 });
  },
  getSunElevation(t) { return -this.getSunDir(t).y; },   // >0 = acima do horizonte
  getDarkness(t) {                                        // 0 = dia, 1 = noite cheia
    return this._clamp(this._map(this.getSunElevation(t), 0.05, -0.25, 0, 1), 0, 1);
  },
  getLightColor(t) {   // cor da luz direcional (sol de dia, luar à noite)
    const el = this.getSunElevation(t);
    if (el > 0) {
      const warm = this._clamp(this._map(el, 0.0, 0.5, 1, 0), 0, 1); // baixo = quente
      const inten = this._clamp(this._map(el, -0.02, 0.5, 0.1, 1), 0, 1);
      return [255*inten, this._lerp(150,250,1-warm)*inten, this._lerp(70,225,1-warm)*inten];
    }
    const moon = this._clamp(this.getMoonDir(t).y*-1, 0, 1);
    return [70*moon, 86*moon, 130*moon];   // luar azulado fraco
  },
  getAmbientColor(t) {
    const d = this.getDarkness(t);
    return [this._lerp(120,16,d), this._lerp(126,18,d), this._lerp(140,34,d)];
  },
  getLightDir(t) {
    return this.getSunElevation(t) > 0 ? this.getSunDir(t) : this.getMoonDir(t);
  },
  getSkyColors(t) { return this._sky(t); },

  // ---- desenho (chame em draw, antes das luzes da cena) ----
  draw(t) {
    const sunDir = this.getSunDir(t);
    const moonDir = this.getMoonDir(t);
    const sunEl = -sunDir.y, moonEl = -moonDir.y;
    const darkness = this.getDarkness(t);

    this._dome(t, sunDir, sunEl);
    this._starsDraw(darkness);
    this._orb(sunDir,  this.R*0.85, this._sunBody(sunEl), sunEl, 1.0);
    this._orb(moonDir, this.R*0.85, [232,236,250], moonEl,
              this._clamp(this._map(moonEl,-0.02,0.25,0,1),0,1));
  },

  // ---------- internos ----------
  _path(t){ return this._map(t,0,1,-0.18*Math.PI,1.18*Math.PI); },
  _clamp(v,a,b){ return Math.max(a,Math.min(b,v)); },
  _map(v,a,b,c,d){ return c + (d-c)*((v-a)/(b-a)); },
  _lerp(a,b,m){ return a+(b-a)*m; },
  _lerpArr(a,b,m){ return [a[0]+(b[0]-a[0])*m, a[1]+(b[1]-a[1])*m, a[2]+(b[2]-a[2])*m]; },
  _norm(v){ const m=Math.hypot(v.x,v.y,v.z)||1; return {x:v.x/m,y:v.y/m,z:v.z/m}; },
  _sky(t){
    const S=this._SKY;
    for(let i=0;i<S.length-1;i++){
      if(t>=S[i].t && t<=S[i+1].t){
        const m=(t-S[i].t)/(S[i+1].t-S[i].t);
        return { top:this._lerpArr(S[i].top,S[i+1].top,m), bot:this._lerpArr(S[i].bot,S[i+1].bot,m) };
      }
    }
    const L=S[S.length-1]; return {top:L.top,bot:L.bot};
  },
  _skyAt(up, sunDot, t, sunEl){
    const c=this._sky(t);
    const amt=this._clamp(this._map(up,0.9,-0.2,0,1),0,1);  // topo -> horizonte
    let col=this._lerpArr(c.top,c.bot,amt);
    const warm=this._clamp(this._map(sunEl,0.55,-0.12,0.15,1),0,1);
    const glow=Math.pow(Math.max(0,sunDot),7)*warm;
    return this._lerpArr(col,[255,172,96],glow*0.65);
  },
  _dome(t, sunDir, sunEl){
    noStroke();
    const stacks=22, slices=34, R=this.R;
    for(let st=0; st<stacks; st++){
      const p1=map(st,0,stacks,0,PI), p2=map(st+1,0,stacks,0,PI);
      beginShape(TRIANGLE_STRIP);
      for(let sl=0; sl<=slices; sl++){
        const th=map(sl,0,slices,0,TWO_PI);
        for(const ph of [p1,p2]){
          const x=R*Math.sin(ph)*Math.cos(th);
          const y=-R*Math.cos(ph);
          const z=R*Math.sin(ph)*Math.sin(th);
          const up=Math.cos(ph);
          const sunDot=(x*sunDir.x+y*sunDir.y+z*sunDir.z)/R;
          const col=this._skyAt(up, sunDot, t, sunEl);
          fill(col[0],col[1],col[2]);
          vertex(x,y,z);
        }
      }
      endShape();
    }
  },
  _starsDraw(darkness){
    if(darkness<=0.02) return;
    push();
    for(const s of this._stars){
      const tw=0.55+0.45*Math.sin(frameCount*0.05+s.ph);
      strokeWeight(s.w);
      stroke(255,255,245, 255*darkness*tw);
      point(s.x,s.y,s.z);
    }
    pop();
  },
  _sunBody(el){
    const warm=this._clamp(this._map(el,0.0,0.55,1,0),0,1);
    return [255, this._lerp(150,245,1-warm), this._lerp(60,210,1-warm)];
  },
  _orb(dir, dist, col, el, vis){
    if(el < -0.06 || vis<=0.02) return;
    push();
    translate(dir.x*dist, dir.y*dist, dir.z*dist);
    noStroke();
    for(let i=5;i>=1;i--){ fill(col[0],col[1],col[2], 14*vis); sphere(46+i*22,16,12); }
    fill(col[0],col[1],col[2], 255*vis);
    sphere(46,20,14);
    pop();
  },
};
/* ===========================  FIM DO SKYBOX  =========================== */
