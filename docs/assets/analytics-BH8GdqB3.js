import"./modulepreload-polyfill-B5Qt9EMX.js";import{a as ce,s as ve}from"./squad-manager-KIMjEl7t.js";import{m as ge,i as Re}from"./page-init-zYDgsuAY.js";import{s as D}from"./supabase-CNU450ah.js";import"./auth-Cf7XUdJT.js";import"./preload-helper-BlTxHScW.js";import"./rbac-LN74jxRk.js";function He(){ke(),xe(),document.getElementById("analyticsTeamSelector").addEventListener("change",xe)}function ke(){const e=document.getElementById("analyticsTeamSelector");if(!e)return;const t=ce.getSquads();e.innerHTML='<option value="all">All Teams</option>',t.forEach(s=>{const o=document.createElement("option");o.value=s.id,o.textContent=s.name,e.appendChild(o)})}function xe(){const e=document.getElementById("analyticsTeamSelector").value,t=ge.matches.filter(o=>o.isPast);let s=t;e!=="all"&&(s=t.filter(o=>o.squadId===e)),De(s),window.updateAnalyticsCharts&&window.updateAnalyticsCharts(s)}function De(e){const t=e.reduce((a,c)=>a+(c.homeScore||0),0),s=e.reduce((a,c)=>a+(c.awayScore||0),0),o=e.length>0?Math.round(e.reduce((a,c)=>a+(c.stats?.home?.possession||0),0)/e.length):0,f=e.reduce((a,c)=>a+(c.stats?.home?.xG||0),0),y=e.reduce((a,c)=>a+(c.stats?.away?.xG||0),0),u=(f-y).toFixed(1),i=document.querySelectorAll(".stat-card");if(i.length<4)return;i[0].querySelector(".value").textContent=t,i[0].querySelector(".sub-label").textContent=`${(t/(e.length||1)).toFixed(1)} per game`,i[1].querySelector(".value").textContent=s,i[1].querySelector(".sub-label").textContent=`${(s/(e.length||1)).toFixed(1)} per game`;const $=i[2].querySelector(".value");$.textContent=(u>=0?"+":"")+u,$.className=`value ${u>=0?"text-positive":"text-red"}`,i[2].querySelector(".sub-label").textContent=`xG: ${f.toFixed(1)} | xGA: ${y.toFixed(1)}`,i[3].querySelector(".value").textContent=`${o}%`,i[3].querySelector(".sub-label").textContent=`${e.length} matches tracked`}function Se(){const e=sessionStorage.getItem("impersonating_club_id");return e||ce.clubId||ge.clubId||null}function V(e){const t=Se();return t?e.eq("club_id",t):e}let fe=!1;window.switchAnalyticsTab=function(e){document.querySelectorAll(".analytics-tab").forEach(o=>{o.classList.toggle("active",o.dataset.tab===e)}),document.querySelectorAll(".tab-content").forEach(o=>{o.classList.toggle("active",o.id===`tab-${e}`)});const t=document.getElementById("teamExportBtn");t&&(t.style.display=e==="team"?"":"none"),e==="player"&&!fe&&(fe=!0,Ee());const s=new URL(window.location);s.searchParams.set("tab",e),window.history.replaceState(null,"",s)};function de(){const e=ce.getSquads(),t=window._coachSquadIds;return t?e.filter(s=>t.includes(s.id)):e}async function Oe(){const e=de();if(window._profile?.clubs?.settings?.archetype==="private_coaching"||e.length===0){document.querySelector(".analytics-tabs").style.display="none";const s=document.getElementById("tab-team");s&&(s.classList.remove("active"),s.style.display="none"),document.getElementById("tab-player").classList.add("active");const o=document.getElementById("teamExportBtn");o&&(o.style.display="none"),fe=!0,Ee();return}ze(),le(),He(),document.getElementById("filterAgeGroup").addEventListener("change",le),document.getElementById("filterCoach").addEventListener("change",le),document.getElementById("filterTeam").addEventListener("change",le)}function ze(){const e=document.getElementById("filterAgeGroup"),t=document.getElementById("filterCoach"),s=document.getElementById("filterTeam"),o=de(),f=new Set,y=new Set;o.forEach(u=>{u.ageGroup&&f.add(u.ageGroup),u.coaches&&u.coaches.length>0&&u.coaches.forEach(i=>y.add(i))}),f.forEach(u=>{const i=document.createElement("option");i.value=u,i.textContent=u,e.appendChild(i)}),y.forEach(u=>{const i=document.createElement("option");i.value=u,i.textContent=u,t.appendChild(i)}),o.forEach(u=>{const i=document.createElement("option");i.value=u.id,i.textContent=u.name,s.appendChild(i)})}function we(e){if(!e.isPast||e.homeScore===void 0||e.homeScore===null||e.homeScore==="")return null;const t=parseInt(e.homeScore,10),s=parseInt(e.awayScore,10),o=e.ourSide||"home";return t===s?"D":o==="home"?t>s?"W":"L":s>t?"W":"L"}function $e(e){let t=e.homeTeam,s=e.awayTeam;if(!t||!s){const o=ce.getSquad(e.squadId)?.name||"UP - Tuks";e.ourSide==="away"?(t=e.opponent||"Home Team",s=o):(t=o,s=e.opponent||"Away Team")}return{home:t,away:s}}function le(){const e=document.getElementById("filterAgeGroup").value,t=document.getElementById("filterCoach").value,s=document.getElementById("filterTeam").value,f=de().filter(l=>{const h=e==="all"||l.ageGroup===e,E=t==="all"||l.coaches&&l.coaches.includes(t),A=s==="all"||l.id===s;return h&&E&&A}).map(l=>l.id),i=ge.matches.filter(l=>f.includes(l.squadId)).filter(l=>l.isPast&&l.homeScore!==void 0&&l.homeScore!==null&&l.homeScore!=="");let $=0,a=0,c=0,C=0,n=0,M=0;i.forEach(l=>{const h=parseInt(l.homeScore,10)||0,E=parseInt(l.awayScore,10)||0,A=l.ourSide||"home";if(A==="home"?($+=h,a+=E):($+=E,a+=h),l.stats&&l.stats.home){const R=A==="home"?l.stats.home||l.stats:l.stats.away||l.stats.home||l.stats,z=A==="home"?l.stats.away||{}:l.stats.home||l.stats;R.possession&&(c+=parseInt(R.possession,10),C++),R.xG&&(n+=parseFloat(R.xG)),z.xG&&(M+=parseFloat(z.xG))}});const d=i.length,x=d?($/d).toFixed(1):"0.0",p=d?(a/d).toFixed(1):"0.0",b=C?Math.round(c/C):0,m=(n-M).toFixed(1),g=m>0?"+"+m:m;document.getElementById("statGoalsScored").innerText=$,document.getElementById("statGoalsScoredAvg").innerText=`${x} per game`,document.getElementById("statGoalsConceded").innerText=a,document.getElementById("statGoalsConcededAvg").innerText=`${p} per game`,document.getElementById("statAvgPossession").innerText=`${b}%`,document.getElementById("statMatchesTrackedPos").innerText=`${C} matches tracked`,document.getElementById("statXgDiff").innerText=g,document.getElementById("statXgDetails").innerText=`xG: ${n.toFixed(1)} | xGA: ${M.toFixed(1)}`;const w=[...i].sort((l,h)=>new Date(h.date)-new Date(l.date)),S=w.slice(0,5),T=[...S].reverse(),F=document.getElementById("recentFormContainer");F.innerHTML="";let L=0;S.length===0?(F.innerHTML='<div style="color: var(--text-muted); font-size: 0.9rem;">No completed matches found.</div>',document.getElementById("formWinRate").innerText="Win Rate: 0%"):(T.forEach(l=>{const h=we(l);h==="W"&&L++;let E="#64748b",A="#f8fafc";h==="W"?(E="#166534",A="#dcfce7"):h==="L"&&(E="#991b1b",A="#fee2e2");const{home:R,away:z}=$e(l),_=l.ourSide==="home"?z:R,Y=document.createElement("div");Y.style.cssText=`width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;color:${E};background:${A};border:1px solid ${E}30;cursor:pointer;`,Y.innerText=h,Y.title=`vs ${_} (${l.homeScore}-${l.awayScore})`,Y.onclick=()=>window.location.href=`match-analysis.html?id=${l.id}`,F.appendChild(Y)}),document.getElementById("formWinRate").innerText=`Win Rate: ${Math.round(L/T.length*100)}%`);const r=document.getElementById("formHistoryTableBody");r.innerHTML="",w.forEach(l=>{const h=we(l);let E="bg-secondary";h==="W"&&(E="bg-success"),h==="L"&&(E="bg-danger");const{home:A,away:R}=$e(l),z=l.ourSide==="home"?R:A,_=document.createElement("tr");_.style.verticalAlign="middle",_.innerHTML=`
            <td style="padding:16px 24px;font-weight:500;color:#1e293b;">${l.date}</td>
            <td style="color:#64748b;font-size:0.9rem;">${l.competition||"-"}</td>
            <td style="font-weight:600;color:#1e293b;">${z}</td>
            <td style="text-align:center;"><span class="badge ${E}" style="min-width:28px;">${h}</span></td>
            <td style="text-align:center;font-weight:800;color:#0f172a;font-size:1.1rem;">${l.homeScore} - ${l.awayScore}</td>
            <td style="padding:16px 24px;text-align:right;">
                <a href="match-analysis.html?id=${l.id}" class="dash-btn outline sm" style="font-size:0.8rem;padding:6px 14px;border-radius:8px;">
                    <i class="fas fa-chart-pie"></i> View Analysis
                </a>
            </td>
        `,r.appendChild(_)})}window.exportAnalyticsReport=function(){if(!window.jspdf){ve("PDF library not loaded","error");return}const{jsPDF:e}=window.jspdf,t=document.getElementById("statGoalsScored").innerText,s=document.getElementById("statGoalsScoredAvg").innerText,o=document.getElementById("statGoalsConceded").innerText,f=document.getElementById("statGoalsConcededAvg").innerText,y=document.getElementById("statAvgPossession").innerText,u=document.getElementById("statXgDiff").innerText,i=document.getElementById("statXgDetails").innerText,$=document.getElementById("formWinRate").innerText,a=document.getElementById("filterAgeGroup").value,c=document.getElementById("filterCoach").value,C=document.getElementById("filterTeam").options[document.getElementById("filterTeam").selectedIndex].text,n=new e,M=n.internal.pageSize.getWidth(),d=20,x=M-d*2;n.setFillColor(30,58,138),n.rect(0,0,M,40,"F"),n.setTextColor(255),n.setFontSize(22),n.setFont("helvetica","bold"),n.text("PERFORMANCE ANALYTICS REPORT",d,25),n.setFontSize(10),n.setFont("helvetica","normal"),n.text(`UP PERFORMANCE HUB · ${C}`,d,33);let p=55;n.setTextColor(30,58,138),n.setFontSize(16),n.setFont("helvetica","bold"),n.text(C,d,p),p+=7,n.setFontSize(10),n.setTextColor(100),n.setFont("helvetica","normal"),n.text(`Age Group: ${a==="all"?"All":a} | Coach: ${c==="all"?"All":c} | ${$}`,d,p),p+=15;const b=(w,S,T,F,L,r)=>{n.setFillColor(241,245,249),n.roundedRect(F,L,r,30,3,3,"F"),n.setTextColor(100),n.setFontSize(8),n.text(w.toUpperCase(),F+5,L+8),n.setTextColor(30,58,138),n.setFontSize(14),n.setFont("helvetica","bold"),n.text(S,F+5,L+18),n.setTextColor(150),n.setFontSize(8),n.setFont("helvetica","normal"),n.text(T,F+5,L+26)};b("Goals Scored",t,s,d,p,x/2-5),b("Goals Conceded",o,f,d+x/2+5,p,x/2-5),p+=35,b("Avg Possession",y,"Team Average",d,p,x/2-5),b("xG Difference",u,i,d+x/2+5,p,x/2-5),p+=45,n.setFontSize(14),n.setTextColor(30,58,138),n.setFont("helvetica","bold"),n.text("MATCH HISTORY SUMMARY",d,p),p+=10,n.setFillColor(30,58,138),n.rect(d,p,x,8,"F"),n.setTextColor(255),n.setFontSize(8),n.text("DATE",d+2,p+5),n.text("OPPONENT",d+40,p+5),n.text("RES",d+110,p+5),n.text("SCORE",d+130,p+5),p+=12,document.querySelectorAll("#formHistoryTableBody tr").forEach(w=>{p>270&&(n.addPage(),p=20);const S=w.querySelectorAll("td");S.length<5||(n.setTextColor(40),n.setFont("helvetica","normal"),n.text(S[0].innerText,d+2,p),n.text(S[2].innerText,d+40,p),n.text(S[3].innerText,d+110,p),n.text(S[4].innerText,d+130,p),p+=8,n.setDrawColor(241,245,249),n.line(d,p-2,M-d,p-2))}),n.setFontSize(8),n.setTextColor(150),n.text(`Generated on ${new Date().toLocaleString()} | UP Performance Hub`,M/2,285,{align:"center"});const g=`Performance_Analytics_${C.replace(/\s+/g,"_")}_${new Date().toISOString().split("T")[0]}.pdf`;try{const w=n.output("blob"),S=URL.createObjectURL(w),T=document.createElement("a");T.href=S,T.download=g,document.body.appendChild(T),T.click(),document.body.removeChild(T),URL.revokeObjectURL(S),ve(`PDF Exported: ${g}`,"success")}catch(w){console.error("PDF Save failed:",w)}};function Ee(){Ne(),je(),document.getElementById("filterSquad").addEventListener("change",Ue),document.getElementById("filterPlayer").addEventListener("change",me),document.getElementById("filterMonth").addEventListener("change",Ye),document.getElementById("filterYear").addEventListener("change",be),document.getElementById("filterPerfMonth").addEventListener("change",We),document.getElementById("filterPerfYear").addEventListener("change",ye),document.getElementById("squadStatsSortBy").addEventListener("change",()=>{Ie(ie)}),Me(),Le()}function Ne(){const e=new Date,t=e.getFullYear();for(const s of["filterYear","filterPerfYear"]){const o=document.getElementById(s);for(let f=t;f>=t-3;f--){const y=document.createElement("option");y.value=f,y.textContent=f,o.appendChild(y)}}document.getElementById("filterMonth").value=e.getMonth()+1,document.getElementById("filterPerfYear").style.display="none"}function We(){const e=document.getElementById("filterPerfMonth").value;document.getElementById("filterPerfYear").style.display=e==="all"?"none":"",ye()}function Ye(){const e=document.getElementById("filterMonth").value;document.getElementById("filterYear").style.display=e==="all"?"none":"";const t=document.getElementById("attSessionsHeader");t&&(t.textContent=e==="all"?"Total Sessions":"Sessions This Month"),be()}async function je(){try{const e=de(),t=document.getElementById("filterSquad");e.forEach(s=>{const o=document.createElement("option");o.value=s.id,o.textContent=s.name,t.appendChild(o)})}catch(e){console.warn("Could not load squads for filter:",e)}await Ce("all"),me()}async function Ue(){const e=document.getElementById("filterSquad").value;await Ce(e),me(),Me(),Le()}async function Ce(e){try{let t=V(D.from("players").select("id, name").order("name"));e&&e!=="all"?t=t.eq("squad_id",e):window._coachSquadIds&&(t=t.in("squad_id",window._coachSquadIds));const{data:s,error:o}=await t;if(o)throw o;const f=document.getElementById("filterPlayer"),y=f.value;f.innerHTML='<option value="all">All Players</option>',(s||[]).forEach(u=>{const i=document.createElement("option");i.value=u.id,i.textContent=u.name,f.appendChild(i)}),(s||[]).some(u=>String(u.id)===String(y))&&(f.value=y)}catch(t){console.warn("Could not load players for filter:",t)}}function me(){ye(),be()}async function ye(){const e=document.getElementById("filterSquad").value,t=document.getElementById("filterPlayer").value,s=document.getElementById("filterPerfMonth").value,o=document.getElementById("filterPerfYear").value,f=document.getElementById("performanceTableBody"),y=document.getElementById("perfMatrixMeta"),u=document.getElementById("perf-mobile-cards");f.innerHTML='<tr><td colspan="7" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>',u.innerHTML='<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';try{let i=V(D.from("players").select("id, name, position, squad_id"));e!=="all"&&(i=i.eq("squad_id",e)),t!=="all"&&(i=i.eq("id",t));const{data:$,error:a}=await i;if(a)throw a;if(!$||$.length===0){f.innerHTML='<tr><td colspan="7" class="table-empty"><i class="fas fa-users" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>',u.innerHTML='<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-users"></i><br>No players found.</div>',y.textContent="";return}const c=$.map(r=>r.id);let C=D.from("assessments").select("*").in("player_id",c);if(s!=="all"){const r=String(s).padStart(2,"0"),l=`${o}-${r}`;C=C.like("date",`${l}%`)}const{data:n,error:M}=await C;if(M)throw M;const{data:d,error:x}=await D.from("match_player_stats").select("*").in("player_id",c).eq("appeared",!0);x&&console.error("Error fetching match player stats:",x);const p={};(d||[]).forEach(r=>{p[r.player_id]||(p[r.player_id]=[]),p[r.player_id].push(r)});const b={};(n||[]).forEach(r=>{b[r.player_id]||(b[r.player_id]=[]),b[r.player_id].push(r)});const m=r=>{if(!r||typeof r!="object")return typeof r=="number"?r:null;const l=Object.values(r).filter(h=>h!=null&&h>0);return l.length>0?l.reduce((h,E)=>h+E,0)/l.length:null},g=$.map(r=>{const l=b[r.id]||[],h=l.length;let E=null,A=null,R=null,z=null;if(h>0){let B=0,I=0,N=0,W=0,X=0,Z=0,J=0,ee=0;l.forEach(te=>{let K={};try{K=typeof te.ratings=="string"?JSON.parse(te.ratings):te.ratings||{}}catch{}const se=m(K.tactical),ne=m(K.technical),oe=m(K.physical),ue=m(K.psychological);se!=null&&(B+=se,I++),ne!=null&&(N+=ne,W++),oe!=null&&(X+=oe,Z++),ue!=null&&(J+=ue,ee++)}),E=I>0?+(B/I).toFixed(1):null,A=W>0?+(N/W).toFixed(1):null,R=Z>0?+(X/Z).toFixed(1):null,z=ee>0?+(J/ee).toFixed(1):null}const _=p[r.id]||[],Y=_.length,v=_.reduce((B,I)=>B+(I.goals||0),0),P=_.reduce((B,I)=>B+(I.assists||0),0),H=_.reduce((B,I)=>B+(I.yellow_cards||0),0),j=_.reduce((B,I)=>B+(I.red_cards||0),0),O=[];l.forEach(B=>{let I={};try{I=typeof B.ratings=="string"?JSON.parse(B.ratings):B.ratings||{}}catch{}const N=[m(I.tactical),m(I.technical),m(I.physical),m(I.psychological)].filter(W=>W!=null);N.length>0&&O.push(N.reduce((W,X)=>W+X,0)/N.length)}),_.forEach(B=>{B.rating!=null&&B.rating>0&&O.push(B.rating)});const ae=O.length>0?+(O.reduce((B,I)=>B+I,0)/O.length).toFixed(1):null;return{id:r.id,name:r.name,position:r.position||"-",tactical:E,technical:A,physical:R,psychological:z,globalAvg:ae,assessmentCount:h+_.filter(B=>B.rating!=null&&B.rating>0).length,apps:Y,goals:v,assists:P,yellowCards:H,redCards:j}});if(g.length===0){f.innerHTML='<tr><td colspan="7" class="table-empty"><i class="fas fa-users" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>',u.innerHTML='<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-users"></i><br>No players found.</div>',y.textContent="";return}const w=g.filter(r=>r.assessmentCount>0).length;y.textContent=`${g.length} players · ${w} with data`;const T=document.getElementById("filterSquad").value!=="all",F=T?[...g].sort((r,l)=>{const h=re[U(r.position)]??4,E=re[U(l.position)]??4;return h!==E?h-E:r.name.localeCompare(l.name)}):g;f.innerHTML="";let L=null;F.forEach(r=>{if(T){const h=U(r.position);if(h!==L){const E=Te[h]||"Other",A=document.createElement("tr");A.innerHTML=`<td colspan="7" style="background:#f8fafc;padding:8px 16px;font-weight:700;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;"><i class="fas fa-layer-group" style="margin-right:6px;opacity:0.5;"></i>${E}</td>`,f.appendChild(A),L=h}}const l=document.createElement("tr");l.innerHTML=`
                <td>
                    <div class="player-name-cell">
                        <div class="player-avatar">${Q(r.name)}</div>
                        <span class="player-name-text">${G(r.name)}</span>
                    </div>
                </td>
                <td><span class="position-badge">${G(r.position)}</span></td>
                <td class="center">${r.tactical!=null?`<span style="font-weight:700;color:#6366f1;">${r.tactical.toFixed(1)}</span>`:'<span style="color:#94a3b8;">-</span>'}</td>
                <td class="center">${r.technical!=null?`<span style="font-weight:700;color:#0ea5e9;">${r.technical.toFixed(1)}</span>`:'<span style="color:#94a3b8;">-</span>'}</td>
                <td class="center">${r.physical!=null?`<span style="font-weight:700;color:#10b981;">${r.physical.toFixed(1)}</span>`:'<span style="color:#94a3b8;">-</span>'}</td>
                <td class="center">${r.psychological!=null?`<span style="font-weight:700;color:#f59e0b;">${r.psychological.toFixed(1)}</span>`:'<span style="color:#94a3b8;">-</span>'}</td>
                <td class="center">${r.globalAvg!=null?`<span class="perf-global-avg" data-player-id="${r.id}" style="cursor:pointer;font-weight:700;color:#0f172a;text-decoration:underline dotted;text-underline-offset:3px;" title="Click for detail">${Ae(r.globalAvg)}</span>`:'<span style="color:#94a3b8;">-</span>'}</td>
            `,f.appendChild(l)}),f.querySelectorAll(".perf-global-avg").forEach(r=>{r.addEventListener("click",()=>{const l=r.dataset.playerId,h=F.find(E=>E.id===l);h&&Be(h)})}),u.innerHTML=F.map(r=>Ke(r)).join("")}catch(i){console.error("Failed to load player ratings:",i),f.innerHTML='<tr><td colspan="7" class="table-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</td></tr>',u.innerHTML='<div style="padding:30px;text-align:center;color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</div>'}}function Ke(e){return`
    <div class="player-bubble-card">
        <div class="player-bubble-header" onclick="toggleBubble(this)">
            <div class="player-avatar">${Q(e.name)}</div>
            <div class="player-bubble-info">
                <span class="player-bubble-name">${G(e.name)}</span>
                <span class="position-badge">${G(e.position)}</span>
            </div>
            <i class="fas fa-chevron-down player-bubble-arrow"></i>
        </div>
        <div class="player-bubble-body">
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-chart-line" style="color:#0f172a;"></i> Global Avg</span>
                ${Ae(e.globalAvg)}
            </div>
            <div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px;">
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-brain" style="color:#6366f1;"></i> Tactical</span>
                    <span style="font-weight:700;color:${e.tactical!=null?"#6366f1":"#94a3b8"};">${e.tactical!=null?e.tactical.toFixed(1):"-"}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-futbol" style="color:#0ea5e9;"></i> Technical</span>
                    <span style="font-weight:700;color:${e.technical!=null?"#0ea5e9":"#94a3b8"};">${e.technical!=null?e.technical.toFixed(1):"-"}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-running" style="color:#10b981;"></i> Physical</span>
                    <span style="font-weight:700;color:${e.physical!=null?"#10b981":"#94a3b8"};">${e.physical!=null?e.physical.toFixed(1):"-"}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-heart" style="color:#f59e0b;"></i> Psychological</span>
                    <span style="font-weight:700;color:${e.psychological!=null?"#f59e0b":"#94a3b8"};">${e.psychological!=null?e.psychological.toFixed(1):"-"}</span>
                </div>
            </div>
            <div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px; font-size:0.75rem; color:#94a3b8; text-align:center;">
                ${e.assessmentCount||0} assessment${e.assessmentCount!==1?"s":""}
            </div>
        </div>
    </div>`}function Be(e){const t=document.getElementById("pillarPopupOverlay");t&&t.remove();const s=document.createElement("div");s.id="pillarPopupOverlay",s.style.cssText="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;",s.addEventListener("click",u=>{u.target===s&&s.remove()});const f=[{key:"tactical",label:"Tactical",icon:"fa-brain",color:"#6366f1"},{key:"technical",label:"Technical",icon:"fa-futbol",color:"#00C49A"},{key:"physical",label:"Physical",icon:"fa-running",color:"#10b981"},{key:"psychological",label:"Psychological",icon:"fa-heart",color:"#f59e0b"}].map(u=>{const i=e[u.key],$=i!=null?Math.round(i/5*100):0;return`
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <div style="width:130px;font-size:0.85rem;font-weight:600;color:${u.color};display:flex;align-items:center;gap:6px;">
                    <i class="fas ${u.icon}"></i> ${u.label}
                </div>
                <div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">
                    <div style="width:${$}%;height:100%;background:${u.color};border-radius:4px;"></div>
                </div>
                <span style="font-weight:700;min-width:35px;text-align:right;color:${i!=null?"#0f172a":"#94a3b8"};">${i!=null?i.toFixed(1):"-"}</span>
            </div>`}).join(""),y=document.createElement("div");y.style.cssText="background:#fff;border-radius:16px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);",y.innerHTML=`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <div>
                <h3 style="margin:0;font-size:1.1rem;color:#0f172a;">${G(e.name)}</h3>
                <span style="font-size:0.8rem;color:#64748b;">${e.assessmentCount||0} assessments &middot; Global Avg: <b>${e.globalAvg!=null?e.globalAvg.toFixed(1):"-"}</b>/5</span>
            </div>
            <button onclick="this.closest('#pillarPopupOverlay').remove()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:#94a3b8;padding:4px 8px;">&times;</button>
        </div>
        ${f}
    `,s.appendChild(y),document.body.appendChild(s)}window.showPillarPopup=Be;let ie=[];async function Me(){const e=document.getElementById("filterSquad").value,t=document.getElementById("filterPerfYear").value,s=document.getElementById("filterPerfMonth").value,o=document.getElementById("squadStatsTableBody"),f=document.getElementById("squadStatsMeta"),y=document.getElementById("squad-stats-mobile-cards");o.innerHTML='<tr><td colspan="14" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>',y.innerHTML='<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';try{let i=V(D.from("players").select("id, name, position, squad_id"));e!=="all"&&(i=i.eq("squad_id",e));const{data:$,error:a}=await i;if(a)throw a;if(!$||$.length===0){o.innerHTML='<tr><td colspan="14" class="table-empty"><i class="fas fa-users" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>',y.innerHTML='<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-users"></i><br>No players found.</div>',f.textContent="",ie=[];return}const c=$.map(v=>v.id),{data:C,error:n}=await D.from("match_player_stats").select("*").in("player_id",c);if(n)throw n;const M=(C||[]).filter(v=>v.appeared===!0),d=C||[],x=Se();let p=D.from("matches").select("id, date, home_score, away_score, our_side, is_past");x&&(p=p.eq("club_id",x)),p=p.eq("is_past",!0);const{data:b,error:m}=await p;m&&console.error("Error fetching season matches:",m);let g=[...new Set((M||[]).map(v=>v.match_id))],w={};var u={};if(g.length>0){const{data:v,error:P}=await D.from("matches").select("id, date, home_score, away_score, our_side").in("id",g);P&&console.error("Error fetching matches for dates:",P),(v||[]).forEach(H=>{w[H.id]=H.date,u[H.id]=H})}const S=b||[],T=S.length,F=T*90,L={};S.forEach(v=>{L[v.id]=v.date});let r=M||[],l=T;if(s!=="all"){const v=String(s).padStart(2,"0"),P=`${t}-${v}`;r=r.filter(H=>{const j=w[H.match_id];return j&&j.startsWith(P)}),l=S.filter(H=>H.date&&H.date.startsWith(P)).length}const h=l*90;let E=d;if(s!=="all"){const v=String(s).padStart(2,"0"),P=`${t}-${v}`;E=E.filter(H=>{const j=w[H.match_id]||L[H.match_id];return j&&j.startsWith(P)})}const A={};E.forEach(v=>{A[v.player_id]||(A[v.player_id]=[]),A[v.player_id].push(v)});const R={};r.forEach(v=>{R[v.player_id]||(R[v.player_id]=[]),R[v.player_id].push(v)});const z={};$.forEach(v=>{z[v.id]=v});const _=$.map(v=>{const P=R[v.id]||[],H=P.length,j=P.filter(q=>q.started===!0).length,O=P.reduce((q,k)=>q+(k.minutes_played||0),0),ae=P.filter(q=>(q.minutes_played||0)>0),B=ae.length>0?Math.round(O/ae.length):0,I=P.reduce((q,k)=>q+(k.goals||0),0),N=P.reduce((q,k)=>q+(k.assists||0),0),W=I+N,X=P.reduce((q,k)=>q+(k.yellow_cards||0),0),Z=P.reduce((q,k)=>q+(k.red_cards||0),0),J=P.filter(q=>q.rating!=null&&q.rating>0),ee=J.length>0?+(J.reduce((q,k)=>q+k.rating,0)/J.length).toFixed(1):null,te=P.filter(q=>q.motm===!0).length,K=O>0?+(I/O*90).toFixed(2):0,se=O>0?+(N/O*90).toFixed(2):0,ne=P.filter(q=>{const k=u[q.match_id];if(!k)return!1;const he=Number(k.our_side==="away"?k.home_score:k.away_score);return he===0&&!isNaN(he)}).length,oe=h>0?+(O/h*100).toFixed(1):0,pe=(A[v.id]||[]).length*90,Ge=pe>0?+(O/pe*100).toFixed(1):0;return{id:v.id,name:v.name,position:v.position||"-",apps:H,starts:j,totalMinutes:O,avgMinutes:B,goals:I,assists:N,contributions:W,yellowCards:X,redCards:Z,avgRating:ee,motmCount:te,per90Goals:K,per90Assists:se,cleanSheets:ne,seasonMinutes:h,pctOfSeason:oe,squadMinutes:pe,pctOfSquadMinutes:Ge}});ie=_;const Y=_.filter(v=>v.apps>0).length;f.textContent=`${_.length} players · ${Y} with appearances`,Ie(_)}catch(i){console.error("Failed to load squad match stats:",i),o.innerHTML='<tr><td colspan="14" class="table-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</td></tr>',y.innerHTML='<div style="padding:30px;text-align:center;color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</div>',ie=[]}}const re={GK:0,DEF:1,MID:2,FWD:3,"":4},Te={GK:"Goalkeepers",DEF:"Defenders",MID:"Midfielders",FWD:"Forwards","":"Other"};function U(e){if(!e)return"";const t=e.toUpperCase().trim().split(/[,/]/)[0].trim();return t.includes("GK")||t.includes("GOAL")?"GK":["CB","LB","RB","LWB","RWB","SW"].some(s=>t.includes(s))||t.includes("DEF")||t.includes("BACK")?"DEF":["CM","CDM","CAM","LM","RM","DM","AM"].some(s=>t.includes(s))||t.includes("MID")?"MID":["ST","CF","LW","RW","SS"].some(s=>t.includes(s))||t.includes("FWD")||t.includes("WING")||t.includes("STRIKER")||t.includes("FORWARD")?"FWD":""}function Ie(e){const t=document.getElementById("squadStatsTableBody"),s=document.getElementById("squad-stats-mobile-cards"),o=document.getElementById("squadStatsSortBy").value,y=document.getElementById("filterSquad").value!=="all",u=[...e].sort((a,c)=>{if(y){const C=re[U(a.position)]??4,n=re[U(c.position)]??4;if(C!==n)return C-n}switch(o){case"motm":return c.motmCount-a.motmCount||c.goals-a.goals;case"goals":return c.goals-a.goals||c.motmCount-a.motmCount;case"assists":return c.assists-a.assists||c.goals-a.goals;case"contributions":return c.contributions-a.contributions||c.goals-a.goals;case"apps":return c.apps-a.apps||c.contributions-a.contributions;case"rating":return(c.avgRating||0)-(a.avgRating||0)||c.apps-a.apps;case"minutes":return c.totalMinutes-a.totalMinutes||c.apps-a.apps;case"cleansheets":return c.cleanSheets-a.cleanSheets||c.apps-a.apps;default:return c.motmCount-a.motmCount||c.goals-a.goals}});if(u.length===0){t.innerHTML='<tr><td colspan="14" class="table-empty"><i class="fas fa-users" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>',s.innerHTML='<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-users"></i><br>No players found.</div>';return}t.innerHTML="";let i=null,$=0;u.forEach(a=>{const c=U(a.position)==="GK";if(y){const d=U(a.position);if(d!==i){const x=Te[d]||"Other",p=document.createElement("tr");p.innerHTML=`<td colspan="14" style="background:#f8fafc;padding:8px 16px;font-weight:700;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;"><i class="fas fa-layer-group" style="margin-right:6px;opacity:0.5;"></i>${x}</td>`,t.appendChild(p),i=d}}$++;const C=a.avgRating!==null?a.avgRating.toFixed(1):"-",n=a.avgRating!==null?a.avgRating>=8?"#10b981":a.avgRating>=6?"#0ea5e9":a.avgRating>=4?"#f59e0b":"#ef4444":"#94a3b8",M=document.createElement("tr");c?M.innerHTML=`
                <td class="center" style="font-weight:700;color:#64748b;">${$}</td>
                <td>
                    <div class="player-name-cell">
                        <div class="player-avatar">${Q(a.name)}</div>
                        <span class="player-name-text">${G(a.name)}</span>
                    </div>
                </td>
                <td><span class="position-badge">${G(a.position)}</span></td>
                <td class="center"><span style="font-weight:700;color:${a.apps>0?"#0f172a":"#94a3b8"};">${a.apps}</span></td>
                <td class="center"><span style="font-weight:700;color:${a.starts>0?"#0f172a":"#94a3b8"};">${a.starts}</span></td>
                <td class="center"><span style="font-weight:700;color:${a.totalMinutes>0?"#0f172a":"#94a3b8"};">${a.totalMinutes} / ${a.seasonMinutes}</span></td>
                <td class="center"><span style="font-weight:700;color:${a.pctOfSeason>0?"#0ea5e9":"#94a3b8"};">${a.pctOfSeason}%</span></td>
                <td class="center"><span style="font-weight:700;color:${a.pctOfSquadMinutes>0?"#6366f1":"#94a3b8"};">${a.pctOfSquadMinutes}%</span></td>
                <td class="center" colspan="3" style="text-align:center;">
                    <span style="font-weight:700;color:${a.cleanSheets>0?"#10b981":"#94a3b8"};"><i class="fas fa-shield-alt" style="margin-right:4px;"></i>${a.cleanSheets} CS</span>
                </td>
                <td class="center"><span style="font-weight:700;color:${a.yellowCards>0?"#facc15":"#94a3b8"};">${a.yellowCards}</span> / <span style="font-weight:700;color:${a.redCards>0?"#ef4444":"#94a3b8"};">${a.redCards}</span></td>
                <td class="center"><span style="font-weight:700;color:${n};">${C}</span></td>
                <td class="center"><span style="font-weight:800;color:${a.motmCount>0?"#f59e0b":"#94a3b8"};">${a.motmCount>0?"⭐ "+a.motmCount:"0"}</span></td>
            `:M.innerHTML=`
                <td class="center" style="font-weight:700;color:#64748b;">${$}</td>
                <td>
                    <div class="player-name-cell">
                        <div class="player-avatar">${Q(a.name)}</div>
                        <span class="player-name-text">${G(a.name)}</span>
                    </div>
                </td>
                <td><span class="position-badge">${G(a.position)}</span></td>
                <td class="center"><span style="font-weight:700;color:${a.apps>0?"#0f172a":"#94a3b8"};">${a.apps}</span></td>
                <td class="center"><span style="font-weight:700;color:${a.starts>0?"#0f172a":"#94a3b8"};">${a.starts}</span></td>
                <td class="center"><span style="font-weight:700;color:${a.totalMinutes>0?"#0f172a":"#94a3b8"};">${a.totalMinutes} / ${a.seasonMinutes}</span></td>
                <td class="center"><span style="font-weight:700;color:${a.pctOfSeason>0?"#0ea5e9":"#94a3b8"};">${a.pctOfSeason}%</span></td>
                <td class="center"><span style="font-weight:700;color:${a.pctOfSquadMinutes>0?"#6366f1":"#94a3b8"};">${a.pctOfSquadMinutes}%</span></td>
                <td class="center"><span style="font-weight:700;color:${a.goals>0?"#10b981":"#94a3b8"};">${a.goals}</span></td>
                <td class="center"><span style="font-weight:700;color:${a.assists>0?"#8b5cf6":"#94a3b8"};">${a.assists}</span></td>
                <td class="center"><span style="font-weight:800;color:${a.contributions>0?"#f97316":"#94a3b8"};">${a.contributions}</span></td>
                <td class="center"><span style="font-weight:700;color:${a.yellowCards>0?"#facc15":"#94a3b8"};">${a.yellowCards}</span> / <span style="font-weight:700;color:${a.redCards>0?"#ef4444":"#94a3b8"};">${a.redCards}</span></td>
                <td class="center"><span style="font-weight:700;color:${n};">${C}</span></td>
                <td class="center"><span style="font-weight:800;color:${a.motmCount>0?"#f59e0b":"#94a3b8"};">${a.motmCount>0?"⭐ "+a.motmCount:"0"}</span></td>
            `,t.appendChild(M)}),s.innerHTML=u.map((a,c)=>Qe(a,c+1)).join("")}function Qe(e,t){const s=e.avgRating!==null?e.avgRating.toFixed(1):"-",o=e.avgRating!==null?e.avgRating>=8?"#10b981":e.avgRating>=6?"#0ea5e9":e.avgRating>=4?"#f59e0b":"#ef4444":"#94a3b8",y=U(e.position)==="GK"?`
            <div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px;">
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-shield-alt" style="color:#10b981;"></i> Clean Sheets</span>
                    <span style="font-weight:700;color:${e.cleanSheets>0?"#10b981":"#94a3b8"};">${e.cleanSheets}</span>
                </div>
            </div>`:`
            <div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px;">
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-bullseye" style="color:#10b981;"></i> Goals</span>
                    <span style="font-weight:700;color:${e.goals>0?"#10b981":"#94a3b8"};">${e.goals}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-hands-helping" style="color:#8b5cf6;"></i> Assists</span>
                    <span style="font-weight:700;color:${e.assists>0?"#8b5cf6":"#94a3b8"};">${e.assists}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-plus-circle" style="color:#f97316;"></i> G+A</span>
                    <span style="font-weight:800;color:${e.contributions>0?"#f97316":"#94a3b8"};">${e.contributions}</span>
                </div>
            </div>`;return`
    <div class="player-bubble-card">
        <div class="player-bubble-header" onclick="toggleBubble(this)">
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-weight:700;color:#64748b;font-size:0.8rem;min-width:20px;">#${t}</span>
                <div class="player-avatar">${Q(e.name)}</div>
            </div>
            <div class="player-bubble-info">
                <span class="player-bubble-name">${G(e.name)}</span>
                <span class="position-badge">${G(e.position)}</span>
            </div>
            <i class="fas fa-chevron-down player-bubble-arrow"></i>
        </div>
        <div class="player-bubble-body">
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-futbol" style="color:#0f172a;"></i> Apps / Starts</span>
                <span style="font-weight:700;">${e.apps} / ${e.starts}</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-clock" style="color:#64748b;"></i> Minutes / Total</span>
                <span style="font-weight:700;">${e.totalMinutes} / ${e.seasonMinutes}</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-percentage" style="color:#0ea5e9;"></i> % Season</span>
                <span style="font-weight:700;color:${e.pctOfSeason>0?"#0ea5e9":"#94a3b8"};">${e.pctOfSeason}%</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-percentage" style="color:#6366f1;"></i> % Squad</span>
                <span style="font-weight:700;color:${e.pctOfSquadMinutes>0?"#6366f1":"#94a3b8"};">${e.pctOfSquadMinutes}%</span>
            </div>
            ${y}
            <div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px;">
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><span style="display:inline-block;width:10px;height:14px;background:#facc15;border-radius:2px;vertical-align:middle;"></span> / <span style="display:inline-block;width:10px;height:14px;background:#ef4444;border-radius:2px;vertical-align:middle;"></span> Cards</span>
                    <span><span style="font-weight:700;color:${e.yellowCards>0?"#facc15":"#94a3b8"};">${e.yellowCards}</span> / <span style="font-weight:700;color:${e.redCards>0?"#ef4444":"#94a3b8"};">${e.redCards}</span></span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-star" style="color:#0ea5e9;"></i> Rating</span>
                    <span style="font-weight:700;color:${o};">${s}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-trophy" style="color:#f59e0b;"></i> MOTM</span>
                    <span style="font-weight:800;color:${e.motmCount>0?"#f59e0b":"#94a3b8"};">${e.motmCount>0?"⭐ "+e.motmCount:"0"}</span>
                </div>
            </div>
        </div>
    </div>`}async function be(){const e=document.getElementById("filterSquad").value,t=document.getElementById("filterPlayer").value,s=document.getElementById("filterMonth").value,o=document.getElementById("filterYear").value,f=document.getElementById("attendanceTableBody"),y=document.getElementById("att-mobile-cards");f.innerHTML='<tr><td colspan="6" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>',y.innerHTML='<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';try{let u=D.from("reports").select("id, session_id, absent_player_ids"),i=D.from("training_attendance").select("id, session_id, absent_player_ids");if(s&&s!=="all"){const g=String(s).padStart(2,"0"),w=`${o}-${g}`;u=u.like("date",`${w}%`),i=i.like("date",`${w}%`)}const[{data:$,error:a},{data:c,error:C}]=await Promise.all([u,i]);if(a)throw a;if(C)throw C;const n=[],M=new Set;(c||[]).forEach(g=>{g.session_id&&M.add(g.session_id),n.push(g)}),($||[]).forEach(g=>{(!g.session_id||!M.has(g.session_id))&&n.push(g)});let d=V(D.from("players").select("id, name, position, squad_id"));e!=="all"&&(d=d.eq("squad_id",e)),t!=="all"&&(d=d.eq("id",t));const{data:x,error:p}=await d;if(p)throw p;if(!x||x.length===0){f.innerHTML='<tr><td colspan="6" class="table-empty"><i class="fas fa-calendar" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>',y.innerHTML='<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-calendar"></i><br>No players found.</div>';return}const b=n.length,m=x.map(g=>{let w=0;n.forEach(F=>{let L=[];try{L=typeof F.absent_player_ids=="string"?JSON.parse(F.absent_player_ids):F.absent_player_ids||[]}catch{}Array.isArray(L)&&L.includes(g.id)&&w++});const S=b-w,T=b>0?Math.round(S/b*100):null;return{id:g.id,name:g.name,position:g.position||"-",totalSessions:b,attendedSessions:S,missedSessions:w,attendancePct:T}});if(m.length===0){f.innerHTML='<tr><td colspan="6" class="table-empty"><i class="fas fa-calendar" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>',y.innerHTML='<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-calendar"></i><br>No players found.</div>';return}f.innerHTML="",m.forEach(g=>{const w=document.createElement("tr"),S=g.attendancePct,T=S!==null?`${S}%`:"—",F=Fe(S);w.innerHTML=`
                <td>
                    <div class="player-name-cell">
                        <div class="player-avatar">${Q(g.name)}</div>
                        <span class="player-name-text">${G(g.name)}</span>
                    </div>
                </td>
                <td><span class="position-badge">${G(g.position)}</span></td>
                <td class="center" style="font-weight:600;">${g.totalSessions}</td>
                <td class="center" style="font-weight:600;color:#166534;">${g.attendedSessions}</td>
                <td class="center">${qe(g.missedSessions)}</td>
                <td class="center">
                    ${S!==null?`
                        <span class="att-pct-bar">
                            <span class="att-pct-fill att-pct-${F}" style="width:${S}%;"></span>
                        </span>
                        <span style="font-weight:700;color:${Pe(S)};">${T}</span>
                    `:'<span style="color:#94a3b8;">No sessions</span>'}
                </td>
            `,f.appendChild(w)}),y.innerHTML=m.map(g=>Xe(g)).join("")}catch(u){console.error("Failed to load attendance:",u),f.innerHTML='<tr><td colspan="6" class="table-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</td></tr>',y.innerHTML='<div style="padding:30px;text-align:center;color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</div>'}}function Xe(e){const t=e.attendancePct,s=t!==null?`${t}%`:"—",o=Fe(t),f=t!==null?`<div style="display:flex;align-items:center;gap:6px;">
            <span class="att-pct-bar-mobile"><span class="att-pct-fill att-pct-${o}" style="width:${t}%;"></span></span>
            <span style="font-weight:700;color:${Pe(t)};">${s}</span>
           </div>`:'<span style="color:#94a3b8;font-size:0.82rem;">No sessions</span>';return`
    <div class="player-bubble-card">
        <div class="player-bubble-header" onclick="toggleBubble(this)">
            <div class="player-avatar">${Q(e.name)}</div>
            <div class="player-bubble-info">
                <span class="player-bubble-name">${G(e.name)}</span>
                <span class="position-badge">${G(e.position)}</span>
            </div>
            <i class="fas fa-chevron-down player-bubble-arrow"></i>
        </div>
        <div class="player-bubble-body">
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-calendar" style="color:#64748b;"></i> Sessions</span>
                <span style="font-weight:600;">${e.totalSessions}</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-check" style="color:#166534;"></i> Attended</span>
                <span style="font-weight:600;color:#166534;">${e.attendedSessions}</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-times" style="color:#991b1b;"></i> Missed</span>
                ${qe(e.missedSessions)}
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-percent" style="color:#00a882;"></i> Attendance</span>
                ${f}
            </div>
        </div>
    </div>`}function Je(e){const t=e.nextElementSibling,s=e.querySelector(".player-bubble-arrow"),o=t.classList.contains("open");t.classList.toggle("open",!o),s.style.transform=o?"":"rotate(180deg)"}window.toggleBubble=Je;function Ae(e){if(e==null)return'<span class="rating-badge none">No data</span>';const t=parseFloat(e);let s;return t>=4.5?s="green":t>=3.5?s="blue":t>=2.5?s="amber":s="red",`<span class="rating-badge ${s}">
        <span class="rating-stars">${Ve(t)}</span>
        ${t.toFixed(1)}
    </span>`}function Ve(e){const t=Math.floor(e),s=e-t>=.25&&e-t<.75?1:0,o=5-t-s;return"★".repeat(t)+(s?"½":"")+"☆".repeat(o)}function qe(e){return e===0?'<span class="missed-badge none">0</span>':e<=2?`<span class="missed-badge low">${e}</span>`:`<span class="missed-badge high">${e}</span>`}function Fe(e){return e===null?"blue":e>=90?"green":e>=75?"blue":e>=60?"amber":"red"}function Pe(e){return e===null?"#94a3b8":e>=90?"#166534":e>=75?"#00a882":e>=60?"#92400e":"#991b1b"}function Q(e){if(!e)return"?";const t=e.trim().split(/\s+/);return t.length>=2?(t[0][0]+t[t.length-1][0]).toUpperCase():e.slice(0,2).toUpperCase()}function G(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}async function Le(){const e=document.getElementById("filterSquad").value;let t=V(D.from("players").select("id, name, position"));e!=="all"&&(t=t.eq("squad_id",e));const{data:s}=await t,o='<option value="">Select player...</option>'+(s||[]).sort((f,y)=>f.name.localeCompare(y.name)).map(f=>`<option value="${f.id}">${G(f.name)} (${f.position||"-"})</option>`).join("");document.getElementById("h2hPlayerA").innerHTML=o,document.getElementById("h2hPlayerB").innerHTML=o}window.compareHeadToHead=async function(){const e=document.getElementById("h2hPlayerA").value,t=document.getElementById("h2hPlayerB").value,s=document.getElementById("h2hResult"),o=document.getElementById("h2hEmpty");if(!e||!t||e===t){s&&(s.style.display="none"),o&&(o.style.display="block",o.querySelector("p").textContent=e===t?"Please select two different players.":"Select two players above to compare.");return}const{data:f}=await D.from("match_player_stats").select("*").eq("player_id",e).eq("appeared",!0),{data:y}=await D.from("match_player_stats").select("*").eq("player_id",t).eq("appeared",!0),{data:u}=await V(D.from("players").select("id, name")).in("id",[e,t]),i={};(u||[]).forEach(d=>{i[d.id]=d.name});const $=d=>{const x=d||[],p=x.reduce((b,m)=>b+(m.minutes_played||0),0);return{apps:x.length,starts:x.filter(b=>b.started).length,minutes:p,goals:x.reduce((b,m)=>b+(m.goals||0),0),assists:x.reduce((b,m)=>b+(m.assists||0),0),yellowCards:x.reduce((b,m)=>b+(m.yellow_cards||0),0),redCards:x.reduce((b,m)=>b+(m.red_cards||0),0),motm:x.filter(b=>b.motm).length,avgRating:(()=>{const b=x.filter(m=>m.rating);return b.length>0?+(b.reduce((m,g)=>m+g.rating,0)/b.length).toFixed(1):0})(),per90Goals:p>0?+(x.reduce((b,m)=>b+(m.goals||0),0)/p*90).toFixed(2):0,per90Assists:p>0?+(x.reduce((b,m)=>b+(m.assists||0),0)/p*90).toFixed(2):0}},a=$(f),c=$(y),C=i[e]||"Player A",n=i[t]||"Player B",M=[{label:"Appearances",vA:a.apps,vB:c.apps},{label:"Starts",vA:a.starts,vB:c.starts},{label:"Minutes",vA:a.minutes,vB:c.minutes},{label:"Goals",vA:a.goals,vB:c.goals},{label:"Assists",vA:a.assists,vB:c.assists},{label:"G+A",vA:a.goals+a.assists,vB:c.goals+c.assists},{label:"Goals/90",vA:a.per90Goals,vB:c.per90Goals},{label:"Assists/90",vA:a.per90Assists,vB:c.per90Assists},{label:"Avg Rating",vA:a.avgRating,vB:c.avgRating},{label:"MOTM",vA:a.motm,vB:c.motm},{label:"Yellow Cards",vA:a.yellowCards,vB:c.yellowCards},{label:"Red Cards",vA:a.redCards,vB:c.redCards}];o.style.display="none",s.style.display="block",s.innerHTML=`
        <div style="display: flex; justify-content: space-between; margin-bottom: 16px; padding: 0 8px;">
            <span style="font-weight: 800; color: #0ea5e9; font-size: 0.95rem;">${G(C)}</span>
            <span style="font-weight: 800; color: #f97316; font-size: 0.95rem;">${G(n)}</span>
        </div>
        ${M.map(d=>{const x=Math.max(d.vA,d.vB,1),p=(d.vA/x*100).toFixed(0),b=(d.vB/x*100).toFixed(0),m=d.vA>d.vB,g=d.vB>d.vA,w=d.label.includes("Card"),S=w?m?"#94a3b8":g?"#10b981":"#64748b":m?"#0ea5e9":"#94a3b8",T=w?g?"#94a3b8":m?"#10b981":"#64748b":g?"#f97316":"#94a3b8",F=m&&!w||g&&w?"800":"600",L=g&&!w||m&&w?"800":"600";return`<div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: ${F}; color: ${S}; font-size: 0.9rem; min-width: 50px;">${d.vA}</span>
                    <span style="font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.3px;">${d.label}</span>
                    <span style="font-weight: ${L}; color: ${T}; font-size: 0.9rem; min-width: 50px; text-align: right;">${d.vB}</span>
                </div>
                <div style="display: flex; gap: 4px; height: 8px;">
                    <div style="flex: 1; display: flex; justify-content: flex-end;">
                        <div style="width: ${p}%; background: ${S}; border-radius: 4px 0 0 4px; min-width: 4px; transition: width 0.3s;"></div>
                    </div>
                    <div style="flex: 1;">
                        <div style="width: ${b}%; background: ${T}; border-radius: 0 4px 4px 0; min-width: 4px; transition: width 0.3s;"></div>
                    </div>
                </div>
            </div>`}).join("")}
    `};document.addEventListener("DOMContentLoaded",async()=>{if(!await Re("analytics",{match:!0}))return;Oe();const t=new URLSearchParams(window.location.search).get("tab");t&&["team","player"].includes(t)&&switchAnalyticsTab(t)});
