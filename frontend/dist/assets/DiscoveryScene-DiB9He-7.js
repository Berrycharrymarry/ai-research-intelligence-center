import{r as w,j as U}from"./index-D9Jlxw8P.js";import{v as Te,s as Be,x as Ae,w as Fe,G as K,C as k,J as Ge,p as ge,K as Ve,b as we,B as be,d as _e,X as je,h as Ue,a as ke,Y as De,Z as Ie,D as Ne,S as We,_ as Xe,l as D,V as Z}from"./three.module-C_K-0nRb.js";const v=[["#245bdf","#83ddd9","#bca9f2"],["#5543c7","#9ac8f6","#e6b7d6"],["#167b86","#9de6c4","#9bb2f0"],["#326bd1","#bee9ef","#d1b4e5"]],ye=`
  uniform float uTime;
  uniform float uShape;
  const float PI = 3.14159265359;
  vec3 ribbon(float u, float v) {
    float angle = u * PI * 2.;
    float phase = uTime * .12;
    float radius = 1.46 + .105 * sin(angle * 3. + phase + uShape);
    float twist = angle * 1.5 + .28 * sin(angle * 2. + phase) + uShape * .3;
    float width = (v - .5) * 1.04;
    float radial = radius + width * cos(twist);
    return vec3(
      radial * cos(angle),
      radial * sin(angle),
      width * sin(twist) + .14 * sin(angle * 2. + phase + uShape * .5)
    );
  }
`,Ye=`
  ${ye}
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vec3 p = ribbon(uv.x, uv.y);
    vec3 tangent = ribbon(uv.x + .0005, uv.y) - p;
    vec3 across = ribbon(uv.x, uv.y + .0005) - p;
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    vNormal = normalize(normalMatrix * normalize(cross(tangent, across)));
    vView = -mv.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }
`,qe=`
  uniform vec3 uBlue;
  uniform vec3 uMint;
  uniform vec3 uLilac;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vec3 normal = normalize(vNormal) * (gl_FrontFacing ? 1. : -1.);
    vec3 viewDirection = normalize(vView);
    float fresnel = pow(1. - abs(dot(normal, viewDirection)), 2.);
    float light = dot(normal, normalize(vec3(-.45, .65, 1.)));
    float silk = .5 + .5 * sin(vUv.x * 17. + vUv.y * 5. + normal.z * 3.);
    vec3 iridescent = mix(uMint, uLilac, silk);
    iridescent = mix(iridescent, uBlue, smoothstep(.15, .8, -light) * .86);
    vec3 pearl = vec3(.93, .955, .98);
    vec3 color = mix(iridescent, pearl, smoothstep(-.15, .8, light) * .79);
    color = mix(color, uBlue, fresnel * .32);
    // Narrow highlights and fine silk fibres make the folds legible on white.
    float highlight = pow(max(0., dot(reflect(normalize(vec3(.6, -.4, -1.)), normal), viewDirection)), 32.);
    float fibres = .5 + .5 * sin(vUv.y * 800. + vUv.x * 19.);
    color *= .966 + .034 * fibres;
    color += highlight * .28;
    float edge = pow(abs(vUv.y - .5) * 2., 12.);
    color = mix(color, mix(uBlue, uMint, .55), edge * .36);
    gl_FragColor = vec4(color, 1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;function xe(b){return(Math.trunc(Number(b)||0)%v.length+v.length)%v.length}function $e({activeIndex:b=0,paused:I=!1}){const Q=w.useRef(null),N=w.useRef(null),C=w.useRef({activeIndex:b,paused:I}),[P,W]=w.useState(!1);return C.current={activeIndex:b,paused:I},w.useEffect(()=>{var ae;const a=Q.current;if(!a||P)return;const x=a.closest(".discovery-hero")||((ae=a.parentElement)==null?void 0:ae.parentElement)||a,X=new Set,l=i=>(X.add(i),i),z=window.matchMedia("(prefers-reduced-motion: reduce)"),Y=window.matchMedia("(max-width: 760px)");let n,y,M,d=0,S=0,f=0,R=!0,E=!1,h=()=>{},g=()=>{};const q=new Z,T=new Z,Me=new Z,u=()=>{d&&cancelAnimationFrame(d),d=0,S=0},ee=()=>{document.hidden?u():(h(),g())},te=()=>{u(),h(),g()},ne=i=>{const s=x.getBoundingClientRect();!s.width||!s.height||q.set(D.clamp((i.clientX-s.left)/s.width*2-1,-1,1),D.clamp((i.clientY-s.top)/s.height*2-1,-1,1))},oe=()=>q.set(0,0),ie=i=>{i.preventDefault(),u(),E||W(!0)},H=()=>{E||(E=!0,u(),y==null||y.disconnect(),M==null||M.disconnect(),document.removeEventListener("visibilitychange",ee),z.removeEventListener("change",te),x.removeEventListener("pointermove",ne),x.removeEventListener("pointerleave",oe),n==null||n.domElement.removeEventListener("webglcontextlost",ie),X.forEach(i=>i.dispose()),X.clear(),n==null||n.dispose(),n==null||n.forceContextLoss(),n==null||n.domElement.remove(),N.current=null)};try{const i=document.createElement("canvas"),s={alpha:!0,antialias:!Y.matches,powerPreference:"low-power"},se=i.getContext("webgl2",s)||i.getContext("webgl",s);if(!se)return W(!0),H;n=new Te({canvas:i,context:se,...s}),n.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5)),n.setClearColor(16777215,0),n.outputColorSpace=Be,n.domElement.style.cssText="display:block;width:100%;height:100%;pointer-events:none",n.domElement.setAttribute("aria-hidden","true"),n.domElement.addEventListener("webglcontextlost",ie),a.appendChild(n.domElement);const B=new Ae,m=new Fe(38,1,.1,30);m.position.set(0,0,7.4);const p=new K;B.add(p);const A=xe(C.current.activeIndex),c={uTime:{value:0},uShape:{value:A},uBlue:{value:new k(v[A][0])},uMint:{value:new k(v[A][1])},uLilac:{value:new k(v[A][2])}},O=v.map(e=>e.map(t=>new k(t))),Se=l(new Ge(1,1,Y.matches?160:256,36)),Ee=l(new ge({uniforms:c,vertexShader:Ye,fragmentShader:qe,side:Ve})),re=new we(Se,Ee);re.frustumCulled=!1,p.add(re);const $=Y.matches?720:1800,F=new Float32Array($*3);for(let e=0;e<$;e+=1){const t=e*.61803398875%1;F[e*3]=e/$,F[e*3+1]=t,F[e*3+2]=e*.41421356237%1}const le=l(new be);le.setAttribute("position",new _e(F,3));const Le=l(new ge({uniforms:c,vertexShader:`
          ${ye}
          varying float vAlpha;
          void main() {
            float u = fract(position.x + uTime * .008);
            vec3 p = ribbon(u, position.y * 1.44 - .22);
            float spread = .055 + pow(position.z, 5.) * .68;
            p += normalize(p) * spread;
            p.z += sin(position.x * 80. + uTime * .25) * spread;
            vec4 mv = modelViewMatrix * vec4(p, 1.);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp((1.8 + position.z * 2.) * 5. / -mv.z, 1., 3.);
            vAlpha = .2 + position.z * .4;
          }
        `,fragmentShader:`
          uniform vec3 uBlue;
          uniform vec3 uLilac;
          varying float vAlpha;
          void main() {
            float distanceToCenter = length(gl_PointCoord - .5);
            if (distanceToCenter > .5) discard;
            gl_FragColor = vec4(mix(uBlue, uLilac, .24), vAlpha * (1. - smoothstep(.18, .5, distanceToCenter)));
            #include <colorspace_fragment>
          }
        `,transparent:!0,depthWrite:!1})),ce=new je(le,Le);ce.frustumCulled=!1,p.add(ce);const J=new K;p.add(J);const Ce=l(new Ue({color:"#7895ba",transparent:!0,opacity:.18})),de=[];for(let e=0;e<3;e+=1){const t=new K;t.rotation.set(.52+e*.62,.15+e*.33,e*.78);const o=[],r=2.15+e*.15;for(let L=0;L<192;L+=1){const j=L/192*Math.PI*2;o.push(new ke(Math.cos(j)*r,Math.sin(j)*r,0))}const _=l(new be().setFromPoints(o));t.add(new De(_,Ce)),J.add(t),de.push({orbit:t,radius:r})}B.add(new Ie(16777215,10661322,2.3));const ue=new Ne(16777215,3);ue.position.set(-3,5,7),B.add(ue);const Pe=l(new We(1,18,12)),ze=l(new Xe({color:"#526ac9",metalness:.42,roughness:.25})),Re=de.map(({orbit:e,radius:t},o)=>{const r=new we(Pe,ze);return r.scale.setScalar(o===1?.059:.035),e.add(r),{satellite:r,radius:t,phase:o*2.2,speed:.055+o*.014}});let me=0,G=!1;const V=()=>!E&&R&&!document.hidden&&!z.matches&&!C.current.paused,pe=(e=0)=>{const t=xe(C.current.activeIndex),o=e>0?1-Math.exp(-e*2.8):1;c.uBlue.value.lerp(O[t][0],o),c.uMint.value.lerp(O[t][1],o),c.uLilac.value.lerp(O[t][2],o),c.uShape.value=D.lerp(c.uShape.value,t,o),c.uTime.value=f,T.lerp(z.matches?Me:q,e>0?1-Math.exp(-e*3):1),p.rotation.set(.32+T.y*.075,-.42+T.x*.1,-.18+Math.sin(f*.075)*.065),p.position.set(me+T.x*.055,G?.02:.035+Math.sin(f*.28)*.028,0),J.rotation.z=f*.015,Re.forEach(({satellite:r,radius:_,phase:L,speed:j})=>{const he=f*j+L;r.position.set(Math.cos(he)*_,Math.sin(he)*_,0)}),n.render(B,m)},ve=e=>{if(d=0,!V())return;const t=S?(e-S)/1e3:1/40;t>=1/42&&(S=e,f+=Math.min(t,.06),pe(Math.min(t,.06))),d=requestAnimationFrame(ve)};h=()=>{!E&&!document.hidden&&R&&pe()},g=()=>{V()&&!d?(S=0,d=requestAnimationFrame(ve)):V()||u()},N.current={update:()=>{V()||h(),g()}};const fe=()=>{const e=a.clientWidth,t=a.clientHeight;if(!e||!t){u();return}n.setSize(e,t,!1),m.aspect=e/t,m.updateProjectionMatrix(),G=e<760;const o=2*Math.tan(D.degToRad(m.fov/2))*m.position.z*m.aspect;me=G?o*.035:o*.195,p.scale.setScalar(G?Math.min(.83,o/4.8):Math.min(1.03,o/8)),h(),g()};y=new ResizeObserver(fe),y.observe(a),M=new IntersectionObserver(([e])=>{R=e.isIntersecting,R?(h(),g()):u()},{threshold:.01}),M.observe(a),document.addEventListener("visibilitychange",ee),z.addEventListener("change",te),x.addEventListener("pointermove",ne,{passive:!0}),x.addEventListener("pointerleave",oe,{passive:!0}),fe()}catch{H(),W(!0)}return H},[P]),w.useEffect(()=>{var a;(a=N.current)==null||a.update()},[b,I]),U.jsxs("div",{"aria-hidden":"true",className:"discovery-scene",style:{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"},children:[U.jsx("div",{style:{position:"absolute",inset:0,background:"radial-gradient(ellipse at 72% 46%, rgba(224,236,253,.52), transparent 57%)"}}),U.jsx("div",{ref:Q,style:{position:"absolute",inset:0,opacity:P?0:1}}),P&&U.jsx("div",{style:{position:"absolute",width:"min(58%, 510px)",aspectRatio:"1",right:"8%",top:"50%",transform:"translateY(-50%) rotate(-24deg)",borderRadius:"50%",border:"1px solid #d6e1f1",boxShadow:"inset 25px 8px 55px #b7dcec80, 20px 5px 75px #b2b8f044",background:"conic-gradient(from 25deg, #edf9ff, #afcadf, #c7b8e7, #fafcff, #a2d3e2, #edf9ff)",maskImage:"radial-gradient(ellipse, transparent 35%, #000 36%, #000 65%, transparent 72%)"}})]})}export{$e as default};
