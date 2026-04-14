import"./modulepreload-polyfill-B5Qt9EMX.js";import{a as b,s as I}from"./squad-manager-D2hlnoPD.js";import{m as j,i as X}from"./page-init-BoM5fSij.js";import{s as E}from"./supabase-CNU450ah.js";import"./auth-Cf7XUdJT.js";import"./preload-helper-BlTxHScW.js";import"./rbac-LN74jxRk.js";const B={reports:[],sessions:[]};async function Q(){F(),te(),pe(),document.getElementById("match-repo-team-filter")&&document.getElementById("match-repo-team-filter").addEventListener("change",V);const s=document.getElementById("team-report-league-filter");s&&s.addEventListener("change",ne),document.getElementById("team-report-squad-filter").addEventListener("change",z),document.getElementById("player-report-squad-filter").addEventListener("change",ae),document.getElementById("player-report-position-filter").addEventListener("change",P),document.getElementById("player-report-search-filter").addEventListener("input",P);const a=document.getElementById("btnAssessTeam");a&&a.addEventListener("click",me);const n=document.getElementById("btnSaveSquadAssessment");n&&n.addEventListener("click",ge),document.querySelectorAll(".btn-close-modal").forEach(p=>{p.addEventListener("click",()=>{document.querySelectorAll(".modal-overlay").forEach(f=>f.classList.remove("active"))})});const t=new URLSearchParams(window.location.search).get("tab");U(t&&["sessions","match-repo","matches","players"].includes(t)?t:"sessions")}function U(s){document.querySelectorAll(".tab-btn").forEach(n=>n.classList.remove("active")),document.getElementById(`tab-btn-${s}`).classList.add("active"),document.querySelectorAll(".main-view").forEach(n=>n.style.display="none"),document.getElementById(`view-${s}`).style.display="block",s==="match-repo"&&V();const a=new URL(window.location);a.searchParams.set("tab",s),window.history.replaceState(null,"",a)}function W(s){s==="new"?(document.getElementById("session-sub-view-list").style.display="none",document.getElementById("session-sub-view-new").style.display="block"):(document.getElementById("session-sub-view-list").style.display="block",document.getElementById("session-sub-view-new").style.display="none",F())}function q(){const s=b.getSquads(),a=window._coachSquadIds;return a?s.filter(n=>a.includes(n.id)):s}function ee(){const s=b.players,a=window._coachSquadIds;return a?s.filter(n=>a.includes(n.squadId)):s}function te(){const s=document.getElementById("match-repo-team-filter"),a=document.getElementById("team-report-squad-filter"),n=document.getElementById("team-report-league-filter"),t=document.getElementById("player-report-squad-filter"),p=document.getElementById("player-report-position-filter"),f=document.getElementById("report-team-select"),r=q(),d=ee();if(f&&(f.innerHTML='<option value="">-- No Team / General --</option>'+r.map(c=>`<option value="${c.id}">${c.name}</option>`).join("")),n){const c=new Set;r.forEach(e=>{e.leagues&&e.leagues.length>0&&e.leagues.forEach(o=>c.add(o))});const i=Array.from(c).sort();n.innerHTML='<option value="all">All Leagues</option>'+i.map(e=>`<option value="${e}">${e}</option>`).join("")}const g=r.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");if(s&&(s.innerHTML='<option value="all">All Teams</option>'+g),a&&(a.innerHTML='<option value="all">All Teams</option>'+g),t&&(t.innerHTML='<option value="">Select Team</option>'+g),p){const c=new Set(["GK","DEF","MID","FWD"]);d.forEach(e=>{e.position&&c.add(e.position)});const i=Array.from(c).sort().map(e=>`<option value="${e}">${e}</option>`).join("");p.innerHTML='<option value="all">All Positions</option>'+i}}function ne(){const s=document.getElementById("team-report-league-filter").value,a=document.getElementById("team-report-squad-filter");if(!a)return;let n=q();s!=="all"&&(n=n.filter(t=>t.leagues&&t.leagues.includes(s))),a.innerHTML='<option value="all">All Teams</option>'+n.map(t=>`<option value="${t.id}">${t.name}</option>`).join(""),z()}function ae(){P()}async function F(){const s=document.getElementById("report-grid");if(s){s.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light);"><i class="fas fa-circle-notch fa-spin"></i> Loading...</div>';try{const a=sessionStorage.getItem("impersonating_club_id")||window._profile?.club_id;let n=E.from("reports").select("*").order("created_at",{ascending:!1}),t=E.from("sessions").select("*").order("created_at",{ascending:!1});a&&(n=n.eq("club_id",a),t=t.eq("club_id",a));const{data:p,error:f}=await n;if(f)throw f;const{data:r,error:d}=await t;if(d)throw d;const g=window._coachSquadIds;let c=r,i=p;if(g){const l=q().map(y=>y.name.toLowerCase());c=r.filter(y=>y.team?y.team.split(",").map(m=>m.trim().toLowerCase()).some(m=>l.some(v=>m.includes(v)||v.includes(m))):!1);const u=new Set(c.map(y=>y.id));i=p.filter(y=>!y.session_id||u.has(y.session_id))}B.reports=i,B.sessions=c;const e=document.getElementById("session-select");if(e&&(e.innerHTML='<option value="">-- Select a Session --</option>',c.sort((l,u)=>new Date(u.date||u.createdAt)-new Date(l.date||l.createdAt)).forEach(l=>{const u=document.createElement("option");u.value=l.id;const y=l.date?l.date:new Date(l.createdAt).toLocaleDateString();u.textContent=`${l.title} (${y})`,e.appendChild(u)})),i.length===0){s.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-light);"><p>No reports found.</p></div>';return}const o=i.filter(l=>l.id&&l.id!=="null");s.innerHTML=o.sort((l,u)=>new Date(u.date||u.createdAt)-new Date(l.date||l.createdAt)).map(l=>{const u=c.find(v=>v.id===l.sessionId),y=u?u.title:"General Report",h=new Date(l.date||Date.now()).toLocaleDateString(void 0,{month:"short",day:"numeric"});let m="";for(let v=1;v<=5;v++)m+=v<=(l.rating||0)?'<i class="fas fa-star" style="color:var(--warning)"></i>':'<i class="far fa-star"></i>';return`
                <div class="dash-card history-item" style="padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; cursor: pointer;" onclick="openDailyReportDetails('${l.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 700; color: var(--navy-dark); font-size: 1rem;">${y}</span>
                        <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600; background: var(--primary-light); padding: 4px 10px; border-radius: 999px;">${h}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-medium); line-height: 1.5; height: 3em; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${l.notes||"No notes provided."}</div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--border-light);">
                        <div style="font-size: 0.85rem;">${m}</div>
                        <div style="display: flex; align-items: center; gap: 4px; font-size: 0.8rem; font-weight: 700; color: var(--primary);">
                            <i class="fas fa-users"></i> ${l.attendanceCount||0}/${l.attendanceTotal||0}
                        </div>
                    </div>
                </div>
            `}).join("")}catch{s.innerHTML="Error loading reports."}}}async function se(s){const a=document.getElementById("modalViewDailyReport"),n=document.getElementById("viewDailyReportContent");if(!a||!n)return;if(a.classList.add("active"),!s||s==="null"||s==="undefined"){n.innerHTML='<div style="color:orange;padding:20px;">This report has no ID — it may have been saved incorrectly. Please delete and re-save it.</div>';return}const t=B.reports.find(i=>i.id===s);if(!t){n.innerHTML='<div style="color:red;padding:20px;">Report not found in cache. Please refresh the page and try again. refreshed.</div>';return}const p=B.sessions.find(i=>i.id===t.sessionId)||null,f=t.date?new Date(t.date):p?new Date(p.date):new Date,r=isNaN(f)?"No date":f.toLocaleDateString();let d="None";t.absentPlayerIds&&Array.isArray(t.absentPlayerIds)&&t.absentPlayerIds.length>0&&(d=t.absentPlayerIds.map(i=>{const e=b.players.find(o=>o.id===i);return e?e.name:"Unknown Player"}).join(", "));const g=typeof t.drillNotes=="string"?JSON.parse(t.drillNotes||"{}"):t.drillNotes||{},c=Object.entries(g);n.innerHTML=`
        <div style="background: var(--bg-light); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
            <h3 style="margin-top:0; color:var(--primary);">${p?p.title:"General Report"}</h3>
            <div style="display: flex; gap: 15px; font-size: 0.9rem; opacity: 0.8;">
                <span><i class="far fa-calendar-alt"></i> ${r}</span>
                <span><i class="fas fa-users"></i> ${t.attendanceCount||0}/${t.attendanceTotal||0} Attendance</span>
            </div>
            ${t.absentPlayerIds&&t.absentPlayerIds.length>0?`
            <div style="margin-top:10px; font-size: 0.85rem; color: #e53e3e; font-weight: 600;">
                <i class="fas fa-user-times"></i> Absent: ${d}
            </div>`:""}
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
            <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--primary);">
                <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Intensity Focus</div>
                <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">${t.intensity||"Normal"}</div>
            </div>
            <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--warning);">
                <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Overall Rating</div>
                <div style="font-weight: 700; color: var(--warning); font-size: 1.2rem; letter-spacing: 2px;">${"★".repeat(t.rating||0)}${"☆".repeat(5-(t.rating||0))}</div>
            </div>
        </div>

        ${t.absentPlayerIds&&t.absentPlayerIds.length>0?`
            <h4 style="margin-bottom: 12px; color: var(--navy-dark);">Absent Players (${t.absentPlayerIds.length})</h4>
            <div class="dash-card" style="padding: 12px; margin-bottom: 20px; background: #fff1f2; border: 1px solid #fecaca;">
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${t.absentPlayerIds.map(i=>{const e=b.getPlayer(i);return`<span style="background: white; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; border: 1px solid #fecaca; color: #b91c1c;">${e?e.name:"Unknown Player"}</span>`}).join("")}
                </div>
            </div>
        `:""}

        <h4 style="margin-bottom: 12px; color: var(--navy-dark);">Session Focus</h4>
        <div class="dash-card" style="padding: 16px; margin-bottom: 20px; background: white;">
            ${t.focus||"No specific focus documented."}
        </div>

        <h4 style="margin-bottom: 12px; color: var(--navy-dark);">Coaching Notes & Observations</h4>
        <div class="dash-card" style="padding: 16px; background: white; white-space: pre-wrap; line-height: 1.6;">
            ${t.notes||"No general notes."}
        </div>

        ${c.length>0?`
            <h4 style="margin: 24px 0 12px 0; color: var(--navy-dark);">Drill-Specific Feedback</h4>
            <div class="dash-card" style="padding: 16px; background: #f8fafc;">
                ${c.map(([i,e])=>`
                    <div style="margin-bottom: 12px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;">
                        <div style="font-weight: 700; font-size: 0.85rem; color: var(--primary);">Drill Update</div>
                        <div style="font-size: 0.9rem;">${e}</div>
                    </div>
                `).join("")}
            </div>
        `:""}
    `}window.openSessionReportDetails=se;function V(){const s=document.getElementById("match-reports-grid");if(!s)return;const a=document.getElementById("match-repo-team-filter").value;s.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light);"><i class="fas fa-circle-notch fa-spin"></i> Loading repository...</div>';let n=j.getMatches().filter(r=>r.isPast);if(a!=="all"?n=n.filter(r=>r.squadId===a):window._coachSquadIds&&(n=n.filter(r=>window._coachSquadIds.includes(r.squadId))),n.sort((r,d)=>new Date(d.date)-new Date(r.date)),n.length===0){s.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-light);"><p>No match reports found.</p></div>';return}const t=(r,d,g)=>{const c=g||"home";return r===d?{color:"#64748b",text:"DRAW"}:c==="home"?r>d?{color:"#10b981",text:"WIN"}:{color:"#ef4444",text:"LOSS"}:d>r?{color:"#10b981",text:"WIN"}:{color:"#ef4444",text:"LOSS"}},p=r=>{let d=r.homeTeam,g=r.awayTeam;if(!d||!g){const c=b.getSquad(r.squadId)?.name||"UP - Tuks";r.ourSide==="away"?(d=r.opponent||"Home Team",g=c):(d=c,g=r.opponent||"Away Team")}return{home:d,away:g}},f=r=>{if(r.notes&&r.notes.trim()!==""&&r.notes!=="No notes provided.")return!0;const d=r.stats||{};return!!(d.tactical_lineup_home||d.tactical_lineup_away||d.tactical_timeline||d.tactical_in_possession||d.tactical_out_possession||d.tactical_transitions||d.tactical_set_pieces||d.tactical_lineup)};s.innerHTML=n.map(r=>{const{home:d,away:g}=p(r),c=r.homeScore||0,i=r.awayScore||0,e=t(c,i,r.ourSide),o=e.color,l=e.text,u=l.toLowerCase(),y=f(r),h=y?'<span style="background: #f0fdf4; color: #166534; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem; border: 1px solid #16653430;">COMPLETED</span>':'<span style="background: #fff7ed; color: #9a3412; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem; border: 1px solid #9a341230;">FILL REPORT</span>',m=y?`<button onclick="event.stopPropagation(); exportMatchReportPDF('${r.id}')" class="dash-btn outline sm" style="padding: 4px 8px; font-size: 0.7rem; height: auto;">
                 <i class="fas fa-print"></i> Print
               </button>`:"";return`
            <div class="dash-card match-card" style="padding: 20px; cursor: pointer;" onclick="window.location.href='match-details.html?id=${r.id}'">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
                        <span>${new Date(r.date).toLocaleDateString()}</span>
                        ${h}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 700; color: ${o}; font-size: 0.75rem;">${l}</span>
                        ${m}
                    </div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <div style="text-align: center; flex: 1;">
                        <div style="font-weight: 800; font-size: 1.1rem; color: var(--navy-dark);">${d}</div>
                    </div>
                    <div class="match-score-badge past ${u}">
                        ${c} - ${i}
                    </div>
                    <div style="text-align: center; flex: 1;">
                        <div style="font-weight: 800; font-size: 1.1rem; color: var(--navy-dark);">${g}</div>
                    </div>
                </div>
                <div style="border-top: 1px solid var(--border-light); padding-top: 12px; font-size: 0.85rem; color: var(--text-medium);">
                    ${r.venue||"Venue TBD"} • ${r.competition||"Friendly"}
                </div>
            </div>
        `}).join("")}async function z(){const s=document.getElementById("team-report-squad-filter").value,a=document.getElementById("team-history-timeline");if(a){if(s==="all"){a.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-light);"><p>Select a specific team to view report history.</p></div>';return}a.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-light);"><i class="fas fa-circle-notch fa-spin"></i> Loading team history...</div>';try{const n=await b.getSquadAssessments(s);if(n.length===0){a.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-light);"><p>No team assessments found for this squad.</p></div>';return}const t=n.sort((p,f)=>new Date(f.date)-new Date(p.date));a.innerHTML=t.map(p=>{const f=new Date(p.date),r=f.getDate(),d=f.toLocaleDateString(void 0,{month:"short"});return`
                <div class="history-item" onclick="openSquadAssessmentDetails('${p.id}')" style="border-left: 3px solid var(--primary);">
                    <div class="history-date">
                        <div class="day">${r}</div>
                        <div class="month">${d}</div>
                    </div>
                    <div class="history-content">
                        <div class="history-title">${p.context} Assessment</div>
                        <div class="history-meta">Overall Rating: <strong>${p.ratings?.overall||0}/10</strong></div>
                        <div class="history-tags">
                            <span class="badge badge-primary">Squad Review</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; color: var(--primary);">
                        <i class="fas fa-eye"></i>
                    </div>
                </div>
            `}).join("")}catch(n){console.error("Error loading team reports:",n),a.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-light);"><p>Error loading team reports. Please try again.</p></div>'}}}async function P(s){const a=typeof s=="string"?s:null,n=document.getElementById("player-report-squad-filter").value,t=document.getElementById("player-report-position-filter").value,p=document.getElementById("player-report-search-filter").value.toLowerCase(),f=document.getElementById("player-history-timeline");if(!f)return;let r=window._coachSquadIds?b.players.filter(o=>window._coachSquadIds.includes(o.squadId)):b.players;if(a?r=r.filter(o=>String(o.id)===String(a)):(n&&(r=r.filter(o=>o.squadId===n)),t!=="all"&&(r=r.filter(o=>o.position===t)),p&&(r=r.filter(o=>o.name.toLowerCase().includes(p)))),r.length===0){f.innerHTML='<div style="text-align:center;padding:80px 40px;color:var(--text-light); border: 2px dashed var(--border-light); border-radius: 16px;"><i class="fas fa-search" style="font-size:48px; margin-bottom: 16px; opacity: 0.1;"></i><p style="font-weight: 500;">No players matching your filters.</p></div>';return}if(r.length>1){f.innerHTML=`
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px;">
                ${r.map(o=>`
                    <div class="dash-card" style="padding: 16px; cursor: pointer; display: flex; align-items: center; gap: 12px;" onclick="viewPlayerTimeline('${o.id}')">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700;">
                            ${o.name.charAt(0)}
                        </div>
                        <div>
                            <div style="font-weight: 700; color: var(--navy-dark);">${o.name}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">${o.position}</div>
                        </div>
                    </div>
                `).join("")}
            </div>
        `;return}const d=r[0];f.innerHTML=`
        <div style="text-align: center; padding: 40px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i>
            <p>Loading reports...</p>
        </div>
    `;let g=[],c=[];try{g=await b.getAssessments(d.id)}catch(o){console.error("Error loading assessments:",o)}try{c=await b.getDevStructures(d.id)}catch(o){console.error("Error loading dev structures:",o)}const i=g.filter(o=>o.matchId&&o.matchId.trim()!=="");g.filter(o=>!o.matchId||o.matchId.trim()==="");const e=o=>o.length===0?'<p style="padding: 24px; text-align: center; color: var(--text-light); font-size: 0.9rem;">No reports found in this category.</p>':o.sort((l,u)=>new Date(u.date)-new Date(l.date)).map(l=>{const u=new Date(l.date),y=u.getDate(),h=u.toLocaleString("default",{month:"short"});let m=l.feedback||{strength:"None",comments:"No comments"};try{l.notes&&l.notes.startsWith("{")&&!l.feedback&&(m=JSON.parse(l.notes))}catch{}return`
                <div class="dash-card history-item" onclick="openAssessmentDetails('${l.id}')" style="cursor: pointer; margin-bottom: 12px; border-left: 3px solid var(--primary);">
                    <div class="history-date">
                        <span class="day">${y||"--"}</span>
                        <span class="month">${h||"VAL"}</span>
                    </div>
                    <div class="history-content">
                        <div style="margin-top: 12px; font-size: 0.9rem; color: var(--text-dark); line-height: 1.5; border-top: 1px dashed var(--border-light); padding-top: 12px;">
                            <strong>Strengths:</strong> ${m.strength||"None"}<br>
                            <strong>Comments:</strong> ${m.comments||"No comments"}
                        </div>
                    </div>
                </div>
            `}).join("");f.innerHTML=`
        <div style="background: var(--navy-dark); color: white; border-radius: 12px; padding: 20px; margin-bottom: 24px; display: flex; align-items: center; gap: 20px;">
            <div style="width: 60px; height: 60px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 800;">
                ${d.name.charAt(0)}
            </div>
            <div>
                <h3 style="margin: 0; font-size: 1.25rem;">${d.name}</h3>
                <p style="margin: 0; font-size: 0.9rem; opacity: 0.8;">Intelligence & Scouting Reports</p>
            </div>
            <div style="margin-left: auto;">
                <button class="dash-btn primary sm" onclick="window.location.href='player-profile.html?id=${d.id}'">View Full Profile</button>
            </div>
        </div>

        <h3 style="margin: 32px 0 16px 0; font-size: 1.1rem; color: var(--navy-dark); display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-futbol" style="color: var(--blue-accent);"></i> Match Performance Assessments
        </h3>
        <div class="history-list">
            ${e(i)}
        </div>

        <h3 style="margin: 40px 0 16px 0; font-size: 1.1rem; color: var(--navy-dark); display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-clipboard-list" style="color: var(--blue-accent);"></i> Overall Assessments
        </h3>
        <div class="history-list">
            ${oe(c)}
        </div>
    `}function oe(s){return!s||s.length===0?'<p style="padding: 24px; text-align: center; color: var(--text-light); font-size: 0.9rem;">No overall assessments found for this player.</p>':s.sort((a,n)=>new Date(n.date||n.createdAt)-new Date(a.date||a.createdAt)).map(a=>{const n=new Date(a.date||a.createdAt),t=n.getDate(),p=n.toLocaleString("default",{month:"short"}),f=a.structures||{},d=Object.keys(f).slice(0,3).map(g=>{const c=(f[g]||"").toString().replace(/<[^>]*>/g,"").substring(0,50);return`<strong>${g}:</strong> ${c}${c.length>=50?"...":""}`}).join("<br>");return`
            <div class="dash-card history-item" onclick="viewDevStructureDetails('${a.id}')" style="cursor: pointer; margin-bottom: 12px; border-left: 3px solid var(--green-accent);">
                <div class="history-date">
                    <span class="day">${t||"--"}</span>
                    <span class="month">${p||"VAL"}</span>
                </div>
                <div class="history-content">
                    <div class="history-title">Overall Assessment</div>
                    <div style="margin-top: 8px; font-size: 0.85rem; color: var(--text-dark); line-height: 1.5;">
                        ${d||"No details recorded."}
                    </div>
                </div>
            </div>
        `}).join("")}async function ie(s){const a=document.getElementById("modalViewAssessment"),n=document.getElementById("viewPlayerAssessContent");if(!(!a||!n)){n.innerHTML='<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>',a.classList.add("active");try{const{data:t,error:p}=await E.from("dev_structures").select("*").eq("id",s).single();if(p)throw p;const r=(await b.getPlayers()).find(i=>i.id==t.playerId),d=document.getElementById("viewPlayerAssessTitle");d&&(d.textContent=`${r?r.name:"Player"} - Overall Assessment`);const g=t.structures||{},c=Object.entries(g).map(([i,e])=>`
                <div style="margin-bottom: 16px;">
                    <h4 style="color: var(--blue-accent); margin: 0 0 8px; font-size: 0.95rem; border-bottom: 1px solid var(--border-light); padding-bottom: 6px;">${i}</h4>
                    <div style="background: #f8fafc; border-radius: 8px; padding: 12px; font-size: 0.9rem; color: var(--text-dark); line-height: 1.6; border: 1px solid var(--border-light);">
                        ${e||"No data."}
                    </div>
                </div>
            `).join("");n.innerHTML=`
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--green-accent);">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Assessment Date</div>
                    <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">${new Date(t.date||t.createdAt).toLocaleDateString()}</div>
                </div>
                <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--green-accent);">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Type</div>
                    <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">Overall Assessment</div>
                </div>
            </div>

            <h3 style="margin-bottom: 16px; color: var(--navy-dark); font-size: 1.1rem; border-bottom: 2px solid var(--green-accent); display: inline-block;">Development Structures</h3>
            <div style="margin-bottom: 24px;">
                ${c||'<p style="color: var(--text-light);">No structures recorded.</p>'}
            </div>
        `}catch{n.innerHTML='<div style="color:red;padding:20px;">Error loading assessment details.</div>'}}}window.viewDevStructureDetails=ie;window.viewPlayerTimeline=de;window.openAssessmentDetails=re;window.openSquadAssessmentDetails=le;async function re(s){const a=document.getElementById("modalViewAssessment"),n=document.getElementById("viewPlayerAssessContent");if(!(!a||!n)){n.innerHTML='<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>',a.classList.add("active");try{const{data:t,error:p}=await E.from("assessments").select("*").eq("id",s).single();if(p)throw p;const r=(await b.getPlayers()).find(e=>e.id==t.playerId),d=document.getElementById("viewPlayerAssessTitle");d&&(d.textContent=`${r?r.name:"Player"} - Performance Report`);let g="";const c={tactical:"Tactical Analysis",technical:"Technical Skills",physical:"Physical Performance",psychological:"Psychological Assessment"};t.ratings&&Object.entries(t.ratings).forEach(([e,o])=>{if(o&&typeof o=="object"){const l=c[e]||e.replace(/([A-Z])/g," $1").replace(/^./,u=>u.toUpperCase());g+=`
                        <div style="margin-bottom: 20px;">
                            <h4 style="color: var(--blue-accent); margin: 0 0 12px; font-size: 0.95rem; border-bottom: 1px solid var(--border-light); padding-bottom: 8px;">${l}</h4>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${Object.entries(o).map(([u,y])=>{const h=parseInt(y)||0;let m="";for(let w=1;w<=5;w++)m+=`<i class="${w<=h?"fas":"far"} fa-star" style="color: ${w<=h?"#f59e0b":"#cbd5e1"}; font-size: 0.85rem; margin-left: 2px;"></i>`;return`
                                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: var(--bg-light); border-radius: 6px;">
                                            <span style="font-size: 0.85rem; color: var(--text-dark);">${u.replace(/([A-Z])/g," $1").replace(/^./,w=>w.toUpperCase())}</span>
                                            <div>${m}</div>
                                        </div>
                                    `}).join("")}
                            </div>
                        </div>
                    `}else{const l=parseInt(o)||0;let u="";for(let h=1;h<=5;h++)u+=`<i class="${h<=l?"fas":"far"} fa-star" style="color: ${h<=l?"#f59e0b":"#cbd5e1"}; font-size: 0.85rem; margin-left: 2px;"></i>`;const y=e.replace(/([A-Z])/g," $1").replace(/^./,h=>h.toUpperCase());g+=`
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-light); border-radius: 8px; margin-bottom: 8px;">
                            <span style="font-size: 0.9rem; text-transform: capitalize;">${y}</span>
                            <div>${u}</div>
                        </div>
                    `}});let i=t.notes||"No detailed notes provided.";try{if(t.notes&&t.notes.startsWith("{")){const e=JSON.parse(t.notes);i=Object.entries(e).map(([o,l])=>`<p><strong>${o.replace(/([A-Z])/g," $1").replace(/^./,y=>y.toUpperCase())}:</strong> ${l}</p>`).join("")}}catch{}n.innerHTML=`
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--primary);">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Assessment Date</div>
                    <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">${new Date(t.date).toLocaleDateString()}</div>
                </div>
                <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--primary);">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Review Type</div>
                    <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">${t.type||"Standard"}</div>
                </div>
            </div>

            <h3 style="margin-bottom: 16px; color: var(--navy-dark); font-size: 1.1rem; border-bottom: 2px solid var(--primary); display: inline-block;">Technical & Tactical Ratings</h3>
            <div style="margin-bottom: 24px;">
                ${g||'<p style="color: var(--text-light);">No ratings recorded.</p>'}
            </div>

            <h3 style="margin-bottom: 16px; color: var(--navy-dark); font-size: 1.1rem; border-bottom: 2px solid var(--primary); display: inline-block;">Detailed Observations</h3>
            <div class="dash-card" style="padding: 20px; background: white; line-height: 1.6; color: var(--text-dark);">
                ${i}
            </div>
        `}catch{n.innerHTML='<div style="color:red;padding:20px;">Error loading report details.</div>'}}}async function le(s){const a=document.getElementById("modalViewSquadAssessment"),n=document.getElementById("viewSquadAssessContent");if(!(!a||!n)){n.innerHTML='<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>',a.classList.add("active");try{const t=await b.getSquadAssessment(s);if(!t)throw new Error("Not found");n.innerHTML=`
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div class="dash-card" style="padding: 16px;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">Report Date</div>
                    <div style="font-weight: 700; color: var(--navy-dark);">${new Date(t.date).toLocaleDateString()}</div>
                </div>
                <div class="dash-card" style="padding: 16px;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">Context</div>
                    <div style="font-weight: 700; color: var(--navy-dark);">${t.context||"General"}</div>
                </div>
            </div>

            <h3 style="margin-bottom: 16px; color: var(--navy-dark); font-size: 1.1rem; border-bottom: 2px solid var(--primary); display: inline-block;">Squad Ratings (1-10)</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px;">
                <div style="background: var(--bg-light); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.85rem;">Tactical</span>
                    <span style="font-weight: 700; color: var(--primary);">${t.ratings?.tactical||0}/10</span>
                </div>
                <div style="background: var(--bg-light); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.85rem;">Physical</span>
                    <span style="font-weight: 700; color: var(--primary);">${t.ratings?.physical||0}/10</span>
                </div>
                <div style="background: var(--bg-light); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.85rem;">Mentality</span>
                    <span style="font-weight: 700; color: var(--primary);">${t.ratings?.mentality||0}/10</span>
                </div>
                <div style="background: var(--bg-light); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 2px solid var(--primary);">
                    <span style="font-size: 0.85rem; font-weight: 700;">Overall</span>
                    <span style="font-weight: 800; color: var(--primary);">${t.ratings?.overall||0}/10</span>
                </div>
            </div>

            <h3 style="margin-bottom: 12px; color: var(--navy-dark); font-size: 1.05rem;">Strengths</h3>
            <div class="dash-card" style="padding: 16px; margin-bottom: 16px; background: white; border-left: 4px solid var(--green-accent);">
                ${t.feedback?.strengths||"None recorded."}
            </div>

            <h3 style="margin-bottom: 12px; color: var(--navy-dark); font-size: 1.05rem;">Areas for Improvement</h3>
            <div class="dash-card" style="padding: 16px; margin-bottom: 16px; background: white; border-left: 4px solid var(--red-accent);">
                ${t.feedback?.improvements||"None recorded."}
            </div>

            <h3 style="margin-bottom: 12px; color: var(--navy-dark); font-size: 1.05rem;">Additional Observations</h3>
            <div class="dash-card" style="padding: 16px; background: #f8fafc; font-style: italic;">
                ${t.feedback?.notes||"No additional notes."}
            </div>
        `}catch{n.innerHTML='<div style="color:red;padding:20px;">Error loading report details.</div>'}}}async function de(s){if(!s)return;const a=document.querySelector('[data-tab="player-reports"]');a&&a.click();const n=document.getElementById("player-report-search-filter"),t=document.getElementById("player-report-squad-filter"),p=document.getElementById("player-report-position-filter");n&&(n.value=""),t&&(t.value=""),p&&(p.value="all"),P(s)}async function ce(){const s=document.getElementById("session-select").value,a=document.getElementById("session-preview");if(!s||!a){a&&a.classList.remove("visible");return}try{const{data:n,error:t}=await E.from("sessions").select("*, drills(*)").eq("id",s).single();if(t)throw t;a.classList.add("visible");const p=document.getElementById("sp-title"),f=document.getElementById("sp-meta"),r=document.getElementById("sp-drills");p&&(p.textContent=n.title||"Untitled Session"),f&&(f.textContent=`Created: ${n.createdAt?new Date(n.createdAt).toLocaleDateString():"Unknown"}`),r&&(r.innerHTML=(n.drills||[]).length>0?n.drills.map((i,e)=>`<div class="sp-drill-item">${e+1}. ${i.title}</div>`).join(""):'<div style="font-size: 12px; color: var(--text-light); padding: 8px;">No drills in this session.</div>');const d=document.getElementById("report-date");if(d&&n.date){const i=n.date.includes("T")?n.date.split("T")[0]:n.date;d.value=i}const g=document.getElementById("report-team-select");if(g&&n.team){const i=n.team.trim().toLowerCase(),e=b.getSquads().find(o=>o.name.trim().toLowerCase()===i);e?(g.value=e.id,k()):(g.value="",k())}else g&&(g.value="",k());const c=document.getElementById("att-total");if(c&&n.playersCount&&(!g||!g.value)){c.value=n.playersCount;const i=document.getElementById("att-count");i&&(i.value=n.playersCount)}try{const{data:i}=await E.from("training_attendance").select("absent_player_ids, attendance_count, attendance_total").eq("session_id",s).maybeSingle();if(i&&i.absent_player_ids){const e=Array.isArray(i.absent_player_ids)?i.absent_player_ids:typeof i.absent_player_ids=="string"?JSON.parse(i.absent_player_ids):[];e.length>0&&setTimeout(()=>{e.forEach(l=>{const u=document.querySelector(`#absent-players-list .player-chip[data-id="${l}"]`);u&&_(u)});const o=document.getElementById("absent-players-section");o&&!document.getElementById("regPreloadBanner")&&o.insertAdjacentHTML("afterbegin",`<div id="regPreloadBanner" style="padding: 8px 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 0.8rem; color: #1e40af; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-info-circle"></i> Attendance loaded from Training Register
                                </div>`)},100)}}catch(i){console.warn("Could not pre-load register attendance:",i)}}catch(n){console.error("Error fetching session preview:",n),a&&a.classList.remove("visible")}}function k(){const s=document.getElementById("report-team-select").value,a=document.getElementById("absent-players-section"),n=document.getElementById("absent-players-list"),t=document.getElementById("absent-count-label"),p=document.getElementById("att-total"),f=document.getElementById("att-count");if(!a||!n||(a.style.display="none",n.innerHTML="",t&&(t.textContent="0 Absences"),!s))return;if(b.getSquad(s)){const d=b.players.filter(g=>g.squadId===s);p&&(p.value=d.length,f&&(f.value=d.length)),d.length>0&&(a.style.display="block",d.sort((g,c)=>g.name.localeCompare(c.name)).forEach(g=>{const c=document.createElement("div");c.className="player-chip",c.dataset.id=g.id,c.innerHTML=`<i class="fas fa-user"></i> ${g.name}`,c.onclick=()=>_(c),n.appendChild(c)}))}}function _(s){s.classList.toggle("absent");const a=s.querySelector("i");s.classList.contains("absent")?a.className="fas fa-user-times":a.className="fas fa-user";const n=parseInt(document.getElementById("att-total").value)||0,t=document.querySelectorAll(".player-chip.absent").length,p=Math.max(0,n-t),f=document.getElementById("att-count");f&&(f.value=p);const r=document.getElementById("absent-count-label");r&&(r.textContent=`${t} Absence${t===1?"":"s"}`)}function pe(){document.querySelectorAll(".star").forEach(s=>{s.addEventListener("click",function(){const a=this.dataset.val,n=document.getElementById("rating-val");n&&(n.value=a),document.querySelectorAll(".star").forEach(t=>{t.classList.toggle("active",t.dataset.val<=a),t.classList.toggle("fas",t.dataset.val<=a),t.classList.toggle("far",t.dataset.val>a)})})})}function me(){if(document.getElementById("team-report-squad-filter").value==="all"){alert("Please select a specific team to assess.");return}const a=document.getElementById("squadAssessDate");a&&(a.value=new Date().toISOString().split("T")[0]),document.getElementById("modalSquadAssessment").classList.add("active")}async function ge(){const s=document.getElementById("team-report-squad-filter").value,a=document.getElementById("btnSaveSquadAssessment");if(!a||s==="all")return;const n=a.innerHTML;a.innerHTML='<i class="fas fa-spinner fa-spin"></i> Saving...',a.disabled=!0;const t={squadId:s,date:document.getElementById("squadAssessDate").value,context:document.getElementById("squadAssessContext").value,ratings:{tactical:parseInt(document.getElementById("squadAssessTactical").value)||0,physical:parseInt(document.getElementById("squadAssessPhysical").value)||0,mentality:parseInt(document.getElementById("squadAssessMentality").value)||0,overall:parseInt(document.getElementById("squadAssessOverall").value)||0},feedback:{strengths:document.getElementById("squadAssessStrengths").value,improvements:document.getElementById("squadAssessImprovements").value,notes:document.getElementById("squadAssessNotes").value}};console.log("Saving Team Assessment:",t);try{if(await b.saveSquadAssessment(t))a.innerHTML='<i class="fas fa-check"></i> Saved!',a.style.background="var(--green-accent)",setTimeout(()=>{a.innerHTML=n,a.style.background="",a.disabled=!1,document.getElementById("modalSquadAssessment").classList.remove("active"),I("Team Assessment Saved Successfully"),z()},1e3);else throw new Error("Persistence failure")}catch(p){console.error("SERVER ERROR during team assessment save:",p),a.innerHTML=n,a.disabled=!1,alert("Error saving assessment to database. Please check server logs.")}}async function ue(){const s=document.getElementById("session-select").value,a=document.getElementById("report-date").value,n=document.getElementById("att-count").value,t=document.getElementById("att-total").value,p=document.getElementById("rating-val").value,f=document.getElementById("gen-notes").value;if(!s&&!a){I("Please select a session or date","error");return}const r=Array.from(document.querySelectorAll(".player-chip.absent")).map(g=>g.dataset.id),d={session_id:s||null,date:a,attendance_count:parseInt(n)||0,attendance_total:parseInt(t)||0,absent_player_ids:r,rating:parseInt(p)||0,notes:f};try{const{error:g}=await E.from("reports").insert(d);if(g)throw g;if(s)try{const c=document.getElementById("report-team-select")?.value;if(c){const i=sessionStorage.getItem("impersonating_club_id")||window._profile?.club_id;i&&await E.from("training_attendance").upsert({club_id:i,session_id:s,squad_id:c,date:a||new Date().toISOString().split("T")[0],absent_player_ids:r,attendance_count:parseInt(n)||0,attendance_total:parseInt(t)||0,notes:"",updated_at:new Date().toISOString()},{onConflict:"session_id,squad_id"})}}catch(c){console.warn("Could not sync attendance to register:",c)}I("Session Report Saved Successfully!","success"),W("list"),F()}catch(g){console.error(g),I("Error saving report","error")}}window.saveReport=ue;function fe(s){if(!window.jspdf){I("PDF library not loaded","error");return}const{jsPDF:a}=window.jspdf;let n=s.homeTeam,t=s.awayTeam;if(!n||!t){const x=window.squadManager&&b.getSquad(s.squadId)?b.getSquad(s.squadId).name:"Home";s.ourSide==="away"?(n=s.opponent||"Home Team",t=x):(n=x,t=s.opponent||"Away Team")}const p=s.homeScore!==void 0?s.homeScore:0,f=s.awayScore!==void 0?s.awayScore:0,r=`${p} - ${f}`,d=s.date||"TBD",g=s.competition||"Friendly",c=s.venue||"Venue TBD";let i=[100,116,139];if(p!==f){const x=s.ourSide||"home";i=x==="home"&&p>f||x==="away"&&f>p?[16,185,129]:[239,68,68]}const e=new a,o=20,l=e.internal.pageSize.getWidth(),u=e.internal.pageSize.getHeight(),y=l-o*2,h=y/2;e.setFillColor(30,58,138),e.rect(0,0,l,44,"F"),e.setTextColor(255,255,255),e.setFontSize(20),e.setFont("helvetica","bold"),e.text("MATCH ANALYSIS REPORT",o,22),e.setFontSize(9),e.setFont("helvetica","normal"),e.text("UP PERFORMANCE HUB  ·  CONFIDENTIAL",o,31),e.text(`Generated: ${new Date().toLocaleString()}`,l-o,31,{align:"right"});let m=54;e.setFillColor(241,245,249),e.roundedRect(o,m,y,36,4,4,"F"),e.setFontSize(12),e.setFont("helvetica","bold"),e.setTextColor(30,58,138),e.text(n,o+6,m+13,{maxWidth:h-20}),e.text(t,l-o-6,m+13,{align:"right",maxWidth:h-20}),e.setFontSize(18),e.setFont("helvetica","bold"),e.setTextColor(...i),e.text(r,l/2,m+15,{align:"center"}),e.setFontSize(8),e.setFont("helvetica","normal"),e.setTextColor(100),e.text(`${g}  ·  ${c}  ·  ${d}`,l/2,m+28,{align:"center"}),m+=46;const v=s.stats||{},w=v.home||{},S=v.away||{},G=[{label:"Goals",key:"goals"},{label:"Possession",key:"possession",suffix:"%"},{label:"Shots",key:"shots"},{label:"Shots on Target",key:"shotsOnTarget"},{label:"Corners",key:"corners"},{label:"Fouls",key:"fouls"},{label:"Yellow Cards",key:"yellowCards"},{label:"Red Cards",key:"redCards"}];e.setFontSize(11),e.setFont("helvetica","bold"),e.setTextColor(30,58,138),e.text("KEY STATISTICS",o,m),m+=5,e.setFontSize(9),e.setFont("helvetica","bold"),e.setTextColor(30,58,138),e.text(n,o,m+4),e.setTextColor(100,116,139),e.text(t,l-o,m+4,{align:"right"}),m+=10,e.setDrawColor(226,232,240),e.line(o,m,l-o,m),m+=6,G.forEach(x=>{const T=parseFloat(w[x.key])||0,L=parseFloat(S[x.key])||0,A=x.suffix||"",H=T+L||1;e.setFontSize(10),e.setFont("helvetica","bold"),e.setTextColor(30,58,138),e.text(`${T}${A}`,o,m),e.setTextColor(100),e.setFont("helvetica","normal"),e.text(x.label,l/2,m,{align:"center"}),e.setFont("helvetica","bold"),e.setTextColor(100,116,139),e.text(`${L}${A}`,l-o,m,{align:"right"});const D=4,C=m+2;e.setFillColor(226,232,240),e.rect(o,C,y,D,"F");const J=T/H*h;e.setFillColor(30,58,138),e.rect(o,C,J,D,"F");const O=L/H*h;e.setFillColor(100,116,139),e.rect(l-o-O,C,O,D,"F"),e.setFillColor(255,255,255),e.rect(l/2-.5,C,1,D,"F"),m+=14,m>u-40&&(e.addPage(),m=20)}),m+=4;const Y=[{title:"Starting XI — "+n,content:v.tactical_lineup_home,color:[30,58,138]},{title:"Starting XI — "+t,content:v.tactical_lineup_away,color:[100,116,139]},{title:"Timeline / Key Events",content:v.tactical_timeline,color:[30,58,138]},{title:"In Possession (Attacking)",content:v.tactical_in_possession,color:[16,185,129]},{title:"Out of Possession (Defence)",content:v.tactical_out_possession,color:[239,68,68]},{title:"Transitions",content:v.tactical_transitions,color:[245,158,11]},{title:"Set Pieces",content:v.tactical_set_pieces,color:[99,102,241]}],K=x=>(x||"").replace(/<li>/gi,`
• `).replace(/<\/li>/gi,"").replace(/<br\s*\/?>/gi,`
`).replace(/<\/p>/gi,`
`).replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\n{3,}/g,`

`).trim();m>u-50&&(e.addPage(),m=20),e.setFontSize(11),e.setFont("helvetica","bold"),e.setTextColor(30,58,138),e.text("TACTICAL ANALYSIS",o,m),m+=3,e.setDrawColor(30,58,138),e.line(o,m,l-o,m),m+=8,Y.forEach(x=>{const T=K(x.content);if(!T)return;m>u-40&&(e.addPage(),m=20),e.setFillColor(...x.color),e.rect(o,m-3,3,7,"F"),e.setFontSize(10),e.setFont("helvetica","bold"),e.setTextColor(...x.color),e.text(x.title.toUpperCase(),o+6,m+1),m+=8,e.setFontSize(9.5),e.setFont("helvetica","normal"),e.setTextColor(51,65,85),e.splitTextToSize(T,y-6).forEach(A=>{m>u-20&&(e.addPage(),m=20),e.text(A,o+6,m),m+=5}),m+=6});const R=e.getNumberOfPages();for(let x=1;x<=R;x++)e.setPage(x),e.setFontSize(7.5),e.setTextColor(148,163,184),e.setFont("helvetica","normal"),e.line(o,u-12,l-o,u-12),e.text("UP Performance Hub  ·  Confidential",o,u-7),e.text(`Page ${x} of ${R}`,l-o,u-7,{align:"right"});const N=`Match_Report_${n}_vs_${t}_${d}.pdf`.replace(/[^a-zA-Z0-9_\-\.]/g,"_"),Z=e.output("blob"),M=URL.createObjectURL(Z),$=document.createElement("a");$.href=M,$.download=N,document.body.appendChild($),$.click(),document.body.removeChild($),URL.revokeObjectURL(M),I(`PDF Exported: ${N}`,"success")}async function ye(s){if(s)try{const a=await j.getMatch(s);if(!a)return;fe(a)}catch(a){console.error("Match Print Error:",a),I("Failed to export PDF","error")}}window.exportMatchReportPDF=ye;window.printReport=function(s){const a=document.getElementById(s);if(!a)return;let n="Report";try{const p=a.closest(".modal-container")?.querySelector(".modal-header-bubble h2");p&&(n=p.textContent.trim())}catch{}const t=window.open("","_blank","height=900,width=900");t&&(t.document.write(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>UP Performance Hub — ${n}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after { box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            padding: 40px 48px;
            color: #1e293b;
            background: white;
            line-height: 1.55;
            font-size: 14px;
        }

        /* ── BRANDED HEADER ── */
        .print-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 20px;
            margin-bottom: 28px;
            border-bottom: 3px solid #1e3a8a;
        }
        .print-header-left h1 {
            margin: 0 0 4px;
            font-size: 1.35rem;
            font-weight: 800;
            color: #1e3a8a;
            letter-spacing: 0.5px;
        }
        .print-header-left p {
            margin: 0;
            font-size: 0.78rem;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .print-header-right {
            text-align: right;
            font-size: 0.78rem;
            color: #64748b;
        }
        .print-header-right strong {
            display: block;
            font-size: 0.85rem;
            font-weight: 700;
            color: #1e3a8a;
        }

        /* ── REPORT TITLE ── */
        .print-title {
            font-size: 1.25rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 24px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e2e8f0;
        }

        /* ── CONTENT ELEMENTS ── */
        .dash-card {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 16px 20px;
            margin-bottom: 16px;
            background: white;
        }
        h3 {
            font-size: 1rem;
            font-weight: 700;
            color: #1e3a8a;
            margin: 24px 0 10px;
            padding-bottom: 6px;
            border-bottom: 2px solid #e2e8f0;
            display: inline-block;
        }
        h4 {
            font-size: 0.9rem;
            font-weight: 700;
            color: #0045e6;
            margin: 16px 0 6px;
        }
        p { margin: 0 0 10px; }
        strong { font-weight: 700; }

        /* ── RATING STARS ── */
        .fa-star, .far.fa-star, .fas.fa-star {
            font-size: 1rem;
        }

        /* ── GRID LAYOUTS ── */
        [style*="grid"] {
            display: flex !important;
            flex-wrap: wrap;
            gap: 12px;
        }
        [style*="grid"] > * {
            flex: 1 1 180px;
            min-width: 0;
        }

        /* ── FOOTER ── */
        .print-footer {
            margin-top: 48px;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
            font-size: 0.75rem;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
        }

        /* ── HIDE INTERACTIVE ELEMENTS ── */
        button, .btn-close-modal, .modal-footer-bubble { display: none !important; }

        @media print {
            body { padding: 20px 28px; }
            .print-header { margin-bottom: 20px; }
        }
    </style>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div class="print-header">
        <div class="print-header-left">
            <h1>UP PERFORMANCE HUB</h1>
            <p>Intelligence &amp; Scouting — Confidential Report</p>
        </div>
        <div class="print-header-right">
            <strong>Generated</strong>
            ${new Date().toLocaleString()}
        </div>
    </div>
    <div class="print-title">${n}</div>
    ${a.innerHTML}
    <div class="print-footer">
        <span>UP Performance Hub &copy; ${new Date().getFullYear()}</span>
        <span>Confidential — Not for Distribution</span>
    </div>
</body>
</html>`),t.document.close(),setTimeout(()=>{t.focus(),t.print()},600))};function ve(){if(!window.jspdf){I("PDF library not loaded");return}const{jsPDF:s}=window.jspdf,a=document.getElementById("session-select"),n=a.options[a.selectedIndex]?.text||"Session",t=document.getElementById("report-date").value||"N/A",p=document.getElementById("att-count").value||"—",f=document.getElementById("att-total").value||"—",r=document.getElementById("rating-val").value||"0",d=document.getElementById("gen-notes").value||"No additional notes provided.",g=document.querySelectorAll(".player-chip.absent"),c=Array.from(g).map(v=>v.textContent.trim()).join(", "),i=new s,e=i.internal.pageSize.getWidth(),o=20,l=e-o*2;i.setFillColor(30,58,138),i.rect(0,0,e,40,"F"),i.setTextColor(255),i.setFontSize(22),i.setFont("helvetica","bold"),i.text("SESSION REFLECTION REPORT",o,25),i.setFontSize(10),i.setFont("helvetica","normal"),i.text(`GENERATED ON: ${new Date().toLocaleDateString()}`,o,33);let u=55;const y=(v,w,S)=>{i.setFontSize(9),i.setTextColor(100),i.text(v.toUpperCase(),S,u),i.setFontSize(11),i.setTextColor(40),i.setFont("helvetica","bold"),i.text(String(w),S,u+6)};y("Session Name",n,o),y("Date Conducted",t,o+70),y("Attendance",`${p} / ${f}`,o+140),u+=20,y("Success Rating",`${r} / 5 Stars`,o),c&&y("Absences",c,o+70),u+=20,i.setDrawColor(200),i.line(o,u,e-o,u),u+=15,i.setFontSize(12),i.setTextColor(30,58,138),i.setFont("helvetica","bold"),i.text("COACH REFLECTIONS & NOTES",o,u),u+=8,i.setFontSize(11),i.setTextColor(60),i.setFont("helvetica","normal");const h=i.splitTextToSize(d,l);i.text(h,o,u);const m=`Session_Report_${t.replace(/-/g,"")}.pdf`;try{const v=i.output("blob"),w=URL.createObjectURL(v),S=document.createElement("a");S.href=w,S.download=m,document.body.appendChild(S),S.click(),document.body.removeChild(S),URL.revokeObjectURL(w),I(`PDF Exported: ${m}`,"success")}catch(v){console.error("PDF Save failed:",v),I("Failed to save PDF","error")}}window.exportSessionReportPDF=ve;window.switchMainTab=U;window.switchSubTab=W;window.onSessionSelect=ce;window.onReportTeamSelect=k;window.togglePlayerAbsence=_;document.addEventListener("DOMContentLoaded",async()=>{await X("reports",{match:!0})&&Q()});
