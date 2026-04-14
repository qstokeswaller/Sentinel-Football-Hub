let _=!1;function O(){if(_)return;_=!0;const o=`
/* ── Year Picker Trigger ── */
.yp-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #fff;
    font-family: 'Inter', sans-serif;
    font-size: 0.9rem;
    font-weight: 500;
    color: #1e3a5f;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
    -webkit-user-select: none;
    user-select: none;
}
.yp-trigger:hover { border-color: #2563eb; }
.yp-trigger:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
.yp-trigger .yp-placeholder { color: #94a3b8; font-weight: 400; }
.yp-trigger .yp-chevron {
    font-size: 0.7rem;
    color: #94a3b8;
    transition: transform 0.2s;
}
.yp-trigger.yp-open .yp-chevron { transform: rotate(180deg); }

/* ── Year Picker Dropdown ── */
.yp-dropdown {
    position: fixed;
    z-index: 9999;
    width: 200px;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    font-family: 'Inter', sans-serif;
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    pointer-events: none;
}
.yp-dropdown.yp-visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}

/* ── Wheel container ── */
.yp-wheel-wrapper {
    position: relative;
    height: 200px;
    overflow: hidden;
}

.yp-wheel {
    height: 200px;
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    scroll-padding-top: 80px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
}
.yp-wheel::-webkit-scrollbar { display: none; }

.yp-wheel-item {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.88rem;
    font-weight: 500;
    color: #94a3b8;
    opacity: 0.3;
    cursor: pointer;
    transition: all 0.12s ease;
    -webkit-user-select: none;
    user-select: none;
    scroll-snap-align: start;
}
.yp-wheel-item.yp-spacer {
    scroll-snap-align: none;
    pointer-events: none;
}
.yp-wheel-item.yp-adjacent {
    font-size: 0.95rem;
    color: #64748b;
    opacity: 0.6;
}
.yp-wheel-item.yp-selected {
    font-size: 1.15rem;
    font-weight: 700;
    color: #1e3a5f;
    opacity: 1;
}

/* ── Gradient masks ── */
.yp-mask-top,
.yp-mask-bottom {
    position: absolute;
    left: 0; right: 0;
    height: 80px;
    pointer-events: none;
    z-index: 2;
}
.yp-mask-top {
    top: 0;
    background: linear-gradient(to bottom, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%);
}
.yp-mask-bottom {
    bottom: 0;
    background: linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%);
}

/* ── Selection highlight bar ── */
.yp-highlight {
    position: absolute;
    top: 80px;
    left: 10px; right: 10px;
    height: 40px;
    background: rgba(37, 99, 235, 0.06);
    border-top: 1px solid rgba(37, 99, 235, 0.1);
    border-bottom: 1px solid rgba(37, 99, 235, 0.1);
    border-radius: 6px;
    pointer-events: none;
    z-index: 1;
}

/* ── Done button ── */
.yp-done-bar {
    display: flex;
    justify-content: flex-end;
    padding: 8px 12px;
    border-top: 1px solid #e2e8f0;
}
.yp-done-btn {
    padding: 6px 18px;
    border: none;
    border-radius: 8px;
    background: #2563eb;
    color: #fff;
    font-family: 'Inter', sans-serif;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
}
.yp-done-btn:hover { background: #1e3a5f; }
`,c=document.createElement("style");c.textContent=o,document.head.appendChild(c)}function $(o,c={}){O();const Y=new Date().getFullYear(),G=c.minYear||1970,j=c.maxYear||Y-5,z=c.defaultYear||2005,R=c.placeholder||"Select Year of Birth",p=[];for(let e=j;e>=G;e--)p.push(e);let n=parseInt(o.value)||null;o.style.display="none";const s=document.createElement("button");s.type="button",s.className="yp-trigger";function y(){s.innerHTML=n?`<span class="yp-value">${n}</span><i class="fas fa-chevron-down yp-chevron"></i>`:`<span class="yp-placeholder">${R}</span><i class="fas fa-chevron-down yp-chevron"></i>`}y(),o.parentNode.insertBefore(s,o.nextSibling);const r=document.createElement("div");r.className="yp-dropdown";const d=document.createElement("div");d.className="yp-wheel-wrapper",d.appendChild(Object.assign(document.createElement("div"),{className:"yp-highlight"})),d.appendChild(Object.assign(document.createElement("div"),{className:"yp-mask-top"})),d.appendChild(Object.assign(document.createElement("div"),{className:"yp-mask-bottom"}));const a=document.createElement("div");a.className="yp-wheel";for(let e=0;e<2;e++){const t=document.createElement("div");t.className="yp-wheel-item yp-spacer",a.appendChild(t)}const f=[];p.forEach(e=>{const t=document.createElement("div");t.className="yp-wheel-item",t.dataset.year=e,t.textContent=e,a.appendChild(t),f.push(t)});for(let e=0;e<2;e++){const t=document.createElement("div");t.className="yp-wheel-item yp-spacer",a.appendChild(t)}d.appendChild(a),r.appendChild(d);const g=document.createElement("div");g.className="yp-done-bar";const u=document.createElement("button");u.type="button",u.className="yp-done-btn",u.textContent="Done",g.appendChild(u),r.appendChild(g),document.body.appendChild(r);function w(){const e=s.getBoundingClientRect(),t=Math.max(e.width,200);r.style.left=e.left+"px",r.style.top=e.bottom+4+"px",r.style.width=t+"px"}function b(e){const t=p.indexOf(e);return t===-1?0:(t+2)*40-80}function x(){const t=a.getBoundingClientRect().top+80+40/2;let l=0,h=1/0;for(let m=0;m<f.length;m++){const N=f[m].getBoundingClientRect(),D=N.top+N.height/2,M=Math.abs(D-t);M<h&&(h=M,l=m)}return l}function E(){const e=x();f.forEach((t,l)=>{t.classList.remove("yp-selected","yp-adjacent"),l===e?t.classList.add("yp-selected"):Math.abs(l-e)===1&&t.classList.add("yp-adjacent")})}let v=null,I=null;function S(){v&&cancelAnimationFrame(v),v=requestAnimationFrame(E),clearTimeout(I),I=setTimeout(()=>{const e=x();e>=0&&e<p.length&&(n=p[e]),E()},150)}a.addEventListener("scroll",S,{passive:!0}),a.addEventListener("wheel",e=>{e.preventDefault();const t=e.deltaY>0?1:-1,l=x(),h=Math.max(0,Math.min(f.length-1,l+t));h!==l&&a.scrollTo({top:b(p[h]),behavior:"smooth"})},{passive:!1}),f.forEach(e=>{e.addEventListener("click",()=>{const t=parseInt(e.dataset.year);n=t,a.scrollTo({top:b(t),behavior:"smooth"})})});let i=!1,T=null;function A(){i||(i=!0,T=n,w(),s.classList.add("yp-open"),r.classList.add("yp-visible"),requestAnimationFrame(()=>{const e=n||z;a.scrollTop=b(e),E(),n||(n=e)}))}function H(){i&&(i=!1,s.classList.remove("yp-open"),r.classList.remove("yp-visible"),n&&(o.value=n,y()),o.dispatchEvent(new Event("change",{bubbles:!0})))}function B(){i&&(i=!1,s.classList.remove("yp-open"),r.classList.remove("yp-visible"),n=T)}s.addEventListener("click",e=>{e.stopPropagation(),i?H():A()}),u.addEventListener("click",e=>{e.stopPropagation(),H()}),document.addEventListener("click",e=>{i&&!r.contains(e.target)&&!s.contains(e.target)&&B()}),window.addEventListener("resize",()=>{i&&w()});function k(){return n}function C(e){if(e===""||e==null){n=null,o.value="",y();return}const t=parseInt(e);!isNaN(t)&&p.includes(t)&&(n=t,o.value=t,y())}function L(){s.remove(),r.remove(),o.style.display=""}return o._yearPicker={getValue:k,setValue:C,destroy:L},{getValue:k,setValue:C,destroy:L}}export{$ as c};
