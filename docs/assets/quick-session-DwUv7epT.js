import{s as P}from"./supabase-CNU450ah.js";import{a as I,s as U}from"./squad-manager-D2hlnoPD.js";import{u as be}from"./time-picker-UEjwMayT.js";let b=new Date().getFullYear(),v=new Date().getMonth(),H=null,A=null,N=null,Z=null,R=null,J="#00C49A",V=null,ne=null,K=!1,C=null,T=null;const xe={u13:"teal",u14:"pink",u15:"green",u17:"purple",u19:"blue",u21:"purple",senior:"navy",elite:"green","first team":"orange",varsity:"navy"},ee={blue:"bubble-team-blue",green:"bubble-team-green",purple:"bubble-team-purple",orange:"bubble-team-orange",red:"bubble-team-red",navy:"bubble-team-navy",teal:"bubble-team-teal",pink:"bubble-team-pink",default:"bubble-team-default"};function ve(e){if(!e)return ee.default;const a=e.toLowerCase().trim();for(const[r,t]of Object.entries(xe))if(a.includes(r))return ee[t]||ee.default;return ee.default}function m(e){return e?e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}function Se(){if(document.getElementById("cal-popup-style"))return;const e=document.createElement("style");e.id="cal-popup-style",e.textContent=`
        .calendar-bubble {
            position: relative; cursor: pointer; padding: 3px 7px; border-radius: 6px;
            font-size: 0.7rem; font-weight: 600; margin-bottom: 3px; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis; max-width: 100%; transition: filter 0.15s;
            display: block; color: #fff;
        }
        .calendar-bubble:hover { filter: brightness(0.9); }
        .cal-session-popup {
            position: fixed; z-index: 9999; min-width: 230px; max-width: 320px; width: max-content;
            background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.18); overflow: hidden; animation: calPopIn 0.15s ease;
        }
        @keyframes calPopIn {
            from { opacity: 0; transform: translateY(-8px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .cal-popup-head {
            background: linear-gradient(135deg, #00C49A 0%, #00a882 100%);
            color: white; padding: 14px 16px;
        }
        .cal-popup-head-title { font-size: 0.95rem; font-weight: 700; line-height: 1.3; margin: 0 0 3px; }
        .cal-popup-head-date { font-size: 0.75rem; opacity: 0.85; }
        .cal-popup-body { padding: 12px 16px 8px; }
        .cal-popup-row {
            display: flex; align-items: flex-start; gap: 9px; font-size: 0.8rem;
            color: #475569; margin-bottom: 8px; line-height: 1.4;
        }
        .cal-popup-row i { color: #00C49A; width: 14px; text-align: center; flex-shrink: 0; margin-top: 1px; }
        .cal-popup-footer { padding: 6px 16px 13px; display: flex; gap: 8px; }
        .cal-popup-btn {
            flex: 1; padding: 8px 0; border-radius: 9px; border: none; cursor: pointer;
            font-size: 0.8rem; font-weight: 600; transition: all 0.15s;
        }
        .cal-popup-btn.primary { background: #00C49A; color: white; }
        .cal-popup-btn.primary:hover { background: #00a882; }
        .cal-popup-btn.ghost { background: #f1f5f9; color: #64748b; }
        .cal-popup-btn.ghost:hover { background: #e2e8f0; }
        .cal-popup-btn.danger { background: #fee2e2; color: #ef4444; }
        .cal-popup-btn.danger:hover { background: #fecaca; }
        .cal-color-swatch {
            width: 28px; height: 28px; border-radius: 50%; border: 3px solid transparent;
            cursor: pointer; transition: all 0.15s; padding: 0;
        }
        .cal-color-swatch:hover { transform: scale(1.15); }
        .cal-color-swatch.active { border-color: #1e293b; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #1e293b; }
    `,document.head.appendChild(e)}function Q(){R&&(R.remove(),R=null)}async function oe(){if(H)return H;try{const e=le()||await me(),a=new Date(Date.now()-90*864e5).toISOString().split("T")[0],r=new Date(Date.now()+180*864e5).toISOString().split("T")[0];let t=P.from("sessions").select("id, title, date, start_time, duration, venue, team, author, purpose, player_ids").gte("date",a).lte("date",r).order("date",{ascending:!0}).limit(500);e&&(t=t.eq("club_id",e));const{data:o,error:s}=await t;if(s)throw s;return H=(o||[]).map(n=>({id:n.id,title:n.title,date:n.date,startTime:n.start_time,duration:n.duration,venue:n.venue,team:n.team,author:n.author,purpose:n.purpose,playerIds:n.player_ids||[],_type:"session"})),H}catch(e){return console.error("Error fetching calendar sessions:",e),[]}}async function se(){if(A)return A;try{const e=le()||await me(),a=new Date(Date.now()-90*864e5).toISOString().split("T")[0],r=new Date(Date.now()+180*864e5).toISOString().split("T")[0];let t=P.from("calendar_events").select("*").gte("date",a).lte("date",r).order("date",{ascending:!0}).limit(500);e&&(t=t.eq("club_id",e));const{data:o,error:s}=await t;if(s)throw s;return A=(o||[]).map(n=>({id:n.id,title:n.title,eventType:n.event_type,date:n.date,startTime:n.start_time,endTime:n.end_time,location:n.location,description:n.description,color:n.color,_type:"event"})),A}catch(e){return console.error("Error fetching calendar events:",e),[]}}async function ie(){if(N)return N;try{const e=le()||await me(),a=new Date(Date.now()-90*864e5).toISOString().split("T")[0],r=new Date(Date.now()+180*864e5).toISOString().split("T")[0];let t=P.from("matches").select("id, squad_id, date, time, opponent, venue, competition, home_team, away_team, our_side, is_past, home_score, away_score, match_type, watched_player_id").gte("date",a).lte("date",r).order("date",{ascending:!0}).limit(500);e&&(t=t.eq("club_id",e));const o=window._coachSquadIds;if(Array.isArray(o))if(o.length>0)t=t.in("squad_id",o);else return N=[],N;const{data:s,error:n}=await t;if(n)throw n;if(!Z){const l=P.from("squads").select("id, name");e&&l.eq("club_id",e);const{data:d}=await l;Z={},(d||[]).forEach(u=>{Z[u.id]=u.name})}const p=(s||[]).filter(l=>l.match_type==="player_watch"&&l.watched_player_id).map(l=>l.watched_player_id);let w={};if(p.length>0){const{data:l}=await P.from("players").select("id, name").in("id",p);(l||[]).forEach(d=>{w[d.id]=d.name})}return N=(s||[]).map(l=>({id:l.id,squadId:l.squad_id,date:l.date,time:l.time,opponent:l.opponent,venue:l.venue,competition:l.competition,homeTeam:l.home_team,awayTeam:l.away_team,ourSide:l.our_side||"home",isPast:l.is_past,homeScore:l.home_score,awayScore:l.away_score,matchType:l.match_type||"team",watchedPlayerId:l.watched_player_id,watchedPlayerName:w[l.watched_player_id]||"",squadName:Z[l.squad_id]||"Unknown",_type:"match"})),N}catch(e){return console.error("Error fetching calendar matches:",e),[]}}function le(){const e=sessionStorage.getItem("impersonating_club_id");return e||V||window._profile?.club_id||null}async function me(){if(V)return V;const e=sessionStorage.getItem("impersonating_club_id");if(e)return V=e,e;const{data:{user:a}}=await P.auth.getUser();if(a){const{data:r}=await P.from("profiles").select("club_id").eq("id",a.id).single();V=r?.club_id||null}return V}function ae(){return window.innerWidth<=768}async function O(){const e=document.getElementById("calendar-container"),a=document.getElementById("calendar-month-year");!e||!a||(ae()?await _e(e,a):await qe(e,a))}async function qe(e,a){const[r,t,o]=await Promise.all([oe(),se(),ie()]),s=new Intl.DateTimeFormat("en-US",{month:"long"}).format(new Date(b,v));a.textContent=`${s} ${b}`;const n=new Date(b,v,1).getDay(),p=new Date(b,v+1,0).getDate(),w=new Date(b,v,0).getDate();let l="";["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(g=>{l+=`<div class="calendar-day-header">${g}</div>`});const d=(n+6)%7;for(let g=d;g>0;g--)l+=`<div class="calendar-day other-month"><div class="calendar-date-num">${w-g+1}</div></div>`;const u=new Date().toISOString().split("T")[0];for(let g=1;g<=p;g++){const q=`${b}-${String(v+1).padStart(2,"0")}-${String(g).padStart(2,"0")}`,E=u===q,y=r.filter(i=>i.date===q).map(i=>{const $=i.startTime||"--:--",z=i.team||"No Team",L=`[${$}] ${z}`,_=String(i.id).replace(/'/g,""),j=ne?`window._onRegisterSessionClick(event,'${_}')`:`window._showSessionPopup(event,'${_}')`;return`<div class="calendar-bubble ${ve(i.team)}" data-session-id="${_}" onclick="${j}" title="${m(i.title||"Session")}">${m(L)}</div>`}),B=t.filter(i=>i.date===q).map(i=>{const $=i.startTime||"",z=$?`[${$}] ${i.title}`:i.title,L=String(i.id).replace(/'/g,"");return`<div class="calendar-bubble" style="background:${i.color||"#64748b"}" onclick="window._showEventPopup(event,'${L}')" title="${m(i.eventType+": "+i.title)}">${m(z)}</div>`}),h=o.filter(i=>i.date===q).map(i=>{const $=String(i.id).replace(/'/g,""),z=i.isPast&&(i.homeScore!=null||i.awayScore!=null),L=i.matchType==="player_watch",_=L?"fa-eye":z?"fa-flag-checkered":"fa-futbol",j=L?"bubble-team-purple":"bubble-team-red",F=i.opponent||"",Y=i.time||"";let X;if(L){const de=i.watchedPlayerName||"Player";X=z?`${de} ${i.homeScore}-${i.awayScore}`:Y?`[${Y}] ${de}`:de,F&&(X+=` @ ${F}`)}else X=z?`${i.squadName} ${i.homeScore}-${i.awayScore} ${F}`.trim():Y?`[${Y}] ${i.squadName} vs ${F}`.trim():`${i.squadName} vs ${F}`.trim();return`<div class="calendar-bubble ${j}" onclick="window._showMatchPopup(event,'${$}')" title="${m(X)}"><i class="fas ${_}" style="font-size:9px;margin-right:3px;"></i>${m(X)}</div>`}),f=[...y,...B,...h],S=3;let D;if(f.length<=S)D=f.join("");else{D=f.slice(0,S).join("");const i=f.length-S;D+=`<div class="calendar-more-link" onclick="window._showDayOverflow(event,'${q}')">+${i} more</div>`}l+=`
            <div class="calendar-day ${E?"today":""}">
                <div class="calendar-date-num">${g}</div>
                <div class="calendar-bubbles-container">${D}</div>
            </div>`}const k=(7-(d+p)%7)%7;for(let g=1;g<=k;g++)l+=`<div class="calendar-day other-month"><div class="calendar-date-num">${g}</div></div>`;e.className="calendar-grid-container",e.innerHTML=l}function $e(e){const a=new Date(e),r=(a.getDay()+6)%7,t=new Date(a);t.setDate(a.getDate()-r);const o=[];for(let s=0;s<7;s++){const n=new Date(t);n.setDate(t.getDate()+s),o.push(n)}return o}function pe(e){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`}function ye(e,a,r,t){return a.filter(o=>o.date===e).length+r.filter(o=>o.date===e).length+(t||[]).filter(o=>o.date===e).length}async function _e(e,a){const[r,t,o]=await Promise.all([oe(),se(),ie()]),s=new Date,n=pe(s);C||(v===s.getMonth()&&b===s.getFullYear()?C=n:C=`${b}-${String(v+1).padStart(2,"0")}-01`);const p=new Date(C+"T12:00:00");(!T||p<T||p>=new Date(T.getTime()+7*864e5))&&(T=new Date(p),T.setDate(p.getDate()-(p.getDay()+6)%7));const w=new Intl.DateTimeFormat("en-US",{month:"long"}).format(new Date(b,v));a.textContent=`${w} ${b}`,e.className="mcal-container";const l=["M","T","W","T","F","S","S"];let d="";if(d+=`<div class="mcal-toggle-row">
        <button class="mcal-toggle-btn" onclick="window._toggleMobileCalExpand()">
            <i class="fas fa-chevron-${K?"up":"down"}"></i>
            ${K?"Week view":"Month view"}
        </button>
    </div>`,K){d+='<div class="mcal-month-grid">',l.forEach(h=>{d+=`<div class="mcal-day-header">${h}</div>`});const y=(new Date(b,v,1).getDay()+6)%7,x=new Date(b,v+1,0).getDate(),B=new Date(b,v,0).getDate();for(let h=y;h>0;h--)d+=`<div class="mcal-day other-month"><span class="mcal-date-num">${B-h+1}</span></div>`;for(let h=1;h<=x;h++){const f=`${b}-${String(v+1).padStart(2,"0")}-${String(h).padStart(2,"0")}`,S=f===n,D=f===C,i=ye(f,r,t,o),$=i>0?`<div class="mcal-dots">${'<span class="mcal-dot"></span>'.repeat(Math.min(i,3))}</div>`:"";d+=`<div class="mcal-day${S?" today":""}${D?" selected":""}" onclick="window._selectMobileDate('${f}')">
                <span class="mcal-date-num">${h}</span>${$}
            </div>`}const W=(7-(y+x)%7)%7;for(let h=1;h<=W;h++)d+=`<div class="mcal-day other-month"><span class="mcal-date-num">${h}</span></div>`;d+="</div>"}else{const c=$e(T);d+=`<div class="mcal-week-nav">
            <button class="mcal-week-arrow" onclick="window._shiftMobileWeek(-1)"><i class="fas fa-chevron-left"></i></button>
            <div class="mcal-week-strip">`,c.forEach(y=>{const x=pe(y),B=x===n,W=x===C,h=y.getMonth()===v&&y.getFullYear()===b,f=ye(x,r,t,o),S=f>0?`<div class="mcal-dots">${'<span class="mcal-dot"></span>'.repeat(Math.min(f,3))}</div>`:"";d+=`<div class="mcal-week-day${B?" today":""}${W?" selected":""}${h?"":" other-month"}" onclick="window._selectMobileDate('${x}')">
                <span class="mcal-wday-label">${l[(y.getDay()+6)%7]}</span>
                <span class="mcal-wday-num">${y.getDate()}</span>
                ${S}
            </div>`}),d+=`</div>
            <button class="mcal-week-arrow" onclick="window._shiftMobileWeek(1)"><i class="fas fa-chevron-right"></i></button>
        </div>`}const k=new Date(C+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long"}),g=r.filter(c=>c.date===C),q=t.filter(c=>c.date===C),E=o.filter(c=>c.date===C);d+=`<div class="mcal-detail-panel">
        <div class="mcal-detail-date">${k}</div>`,g.length===0&&q.length===0&&E.length===0?d+='<div class="mcal-detail-empty"><i class="fas fa-calendar-day"></i> No sessions, events or fixtures</div>':(E.forEach(c=>{const y=String(c.id).replace(/'/g,""),x=c.matchType==="player_watch",B=x?"bubble-team-purple":"bubble-team-red",W=x?"fa-eye":"fa-futbol";let h,f;if(x){const S=c.watchedPlayerName||"Player";h=c.opponent?`${S} @ ${m(c.opponent)}`:S,f="Player Watch"}else h=`${m(c.squadName)} ${c.opponent?"vs "+m(c.opponent):""}`,f=m(c.competition||"Fixture");d+=`<div class="mcal-detail-row" onclick="window._showMatchPopup(event,'${y}')">
                <div class="mcal-detail-color ${B}"></div>
                <div class="mcal-detail-info">
                    <div class="mcal-detail-time"><i class="fas ${W}" style="font-size:10px;margin-right:4px;"></i>${c.time||"TBC"}</div>
                    <div class="mcal-detail-title">${h}</div>
                    <div class="mcal-detail-sub">${f}</div>
                </div>
                <i class="fas fa-chevron-right mcal-detail-arrow"></i>
            </div>`}),g.forEach(c=>{const y=String(c.id).replace(/'/g,""),x=ve(c.team),B=ne?`window._onRegisterSessionClick(event,'${y}')`:`window._showSessionPopup(event,'${y}')`;d+=`<div class="mcal-detail-row" data-session-id="${y}" onclick="${B}">
                <div class="mcal-detail-color ${x}"></div>
                <div class="mcal-detail-info">
                    <div class="mcal-detail-time">${c.startTime||"--:--"}${c.duration?" • "+c.duration+" min":""}</div>
                    <div class="mcal-detail-title">${m(c.team||"No Team")}</div>
                    <div class="mcal-detail-sub">${m(c.title||"")}</div>
                </div>
                <i class="fas fa-chevron-right mcal-detail-arrow"></i>
            </div>`}),q.forEach(c=>{const y=String(c.id).replace(/'/g,"");d+=`<div class="mcal-detail-row" onclick="window._showEventPopup(event,'${y}')">
                <div class="mcal-detail-color" style="background:${c.color||"#64748b"}"></div>
                <div class="mcal-detail-info">
                    <div class="mcal-detail-time">${c.startTime||""}${c.endTime?" – "+c.endTime:""}</div>
                    <div class="mcal-detail-title">${m(c.title)}</div>
                    <div class="mcal-detail-sub">${m(c.eventType)}</div>
                </div>
                <i class="fas fa-chevron-right mcal-detail-arrow"></i>
            </div>`})),d+="</div>",e.innerHTML=d}function ke(e){C=e;const a=new Date(e+"T12:00:00");(a.getMonth()!==v||a.getFullYear()!==b)&&(v=a.getMonth(),b=a.getFullYear(),H=null,A=null,N=null),O()}function Ee(e){T||(T=new Date),T.setDate(T.getDate()+e*7);const a=new Date(C+"T12:00:00"),r=new Date(T.getTime()+7*864e5);(a<T||a>=r)&&(C=pe(T));const t=new Date(T.getTime()+3*864e5);(t.getMonth()!==v||t.getFullYear()!==b)&&(v=t.getMonth(),b=t.getFullYear(),H=null,A=null,N=null),O()}function Te(){K=!K,O()}function re(e,a){const r=a?a.target.closest(".calendar-bubble")||a.target.closest(".mcal-detail-row")||a.target:null;if(ae()){e.style.left="50%",e.style.bottom="16px",e.style.top="auto",e.style.transform="translateX(-50%)",e.style.width="calc(100% - 32px)",e.style.maxWidth="400px";return}if(r){const t=r.getBoundingClientRect(),o=270;let s=Math.round(t.left),n=Math.round(t.bottom+8);s+o>window.innerWidth-12&&(s=window.innerWidth-o-12),s<12&&(s=12),n+280>window.innerHeight&&(n=Math.round(t.top)-290),e.style.left=s+"px",e.style.top=n+"px"}else e.style.left="50%",e.style.top="50%",e.style.transform="translate(-50%, -50%)"}async function Ce(e,a){e&&e.stopPropagation(),Q();const t=(await oe()).find(p=>String(p.id)===String(a));if(!t)return;const o=t.date?new Date(t.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}):"No date set",s=[t.team?`<div class="cal-popup-row" style="color:var(--primary);font-weight:700;background:rgba(0,196,154,0.05);padding:6px 10px;border-radius:8px;margin-bottom:12px;"><i class="fas fa-users"></i>Team: ${m(t.team)}</div>`:"",t.startTime?`<div class="cal-popup-row"><i class="fas fa-clock"></i><strong>Time:</strong> ${t.startTime}${t.duration?" ("+t.duration+" min)":""}</div>`:"",t.venue?`<div class="cal-popup-row"><i class="fas fa-map-marker-alt"></i><strong>Venue:</strong> ${m(t.venue)}</div>`:"",t.author?`<div class="cal-popup-row"><i class="fas fa-user"></i><strong>Coach:</strong> ${m(t.author)}</div>`:"",t.purpose?`<div class="cal-popup-row" style="margin-top:8px;"><i class="fas fa-bullseye"></i><strong>Objectives:</strong><br><span style="flex:1;display:block;padding-top:4px;max-height:100px;overflow-y:auto;line-height:1.5;font-style:italic;">${m(t.purpose)}</span></div>`:""].filter(Boolean).join(""),n=document.createElement("div");n.className="cal-session-popup",n.innerHTML=`
        <div class="cal-popup-head">
            <div class="cal-popup-head-title">${m(t.title||"Untitled Session")}</div>
            <div class="cal-popup-head-date">${o}</div>
        </div>
        <div class="cal-popup-body">${s||'<div class="cal-popup-row"><i class="fas fa-info-circle"></i>No additional details.</div>'}</div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="window._closeCalPopup()">Close</button>
            <button class="cal-popup-btn ghost" onclick="window._shareCalSession('${a}')"><i class="fas fa-share-alt"></i> Share</button>
            <button class="cal-popup-btn primary" onclick="window.location.href='planner.html?load=${a}'">View Plan</button>
        </div>
    `,document.body.appendChild(n),R=n,re(n,e)}async function De(e,a){e&&e.stopPropagation(),Q();const t=(await se()).find(p=>String(p.id)===String(a));if(!t)return;const o=t.date?new Date(t.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}):"No date set",s=[`<div class="cal-popup-row" style="color:${t.color||"#64748b"};font-weight:700;background:${t.color||"#64748b"}15;padding:6px 10px;border-radius:8px;margin-bottom:12px;"><i class="fas fa-tag"></i>${m(t.eventType)}</div>`,t.startTime?`<div class="cal-popup-row"><i class="fas fa-clock"></i><strong>Time:</strong> ${t.startTime}${t.endTime?" – "+t.endTime:""}</div>`:"",t.location?`<div class="cal-popup-row"><i class="fas fa-map-marker-alt"></i><strong>Location:</strong> ${m(t.location)}</div>`:"",t.description?`<div class="cal-popup-row"><i class="fas fa-align-left"></i><span style="flex:1;line-height:1.5;">${m(t.description)}</span></div>`:""].filter(Boolean).join(""),n=document.createElement("div");n.className="cal-session-popup",n.innerHTML=`
        <div class="cal-popup-head" style="background:linear-gradient(135deg, ${t.color||"#64748b"} 0%, ${t.color||"#64748b"}dd 100%);">
            <div class="cal-popup-head-title">${m(t.title)}</div>
            <div class="cal-popup-head-date">${o}</div>
        </div>
        <div class="cal-popup-body">${s}</div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="window._closeCalPopup()">Close</button>
            <button class="cal-popup-btn danger" onclick="window._deleteEvent('${a}')"><i class="fas fa-trash-alt" style="margin-right:4px;"></i>Delete</button>
        </div>
    `,document.body.appendChild(n),R=n,re(n,e)}function Ie(){const e=document.getElementById("modalAddEvent");e&&(document.getElementById("eventTypeSelect").value="Staff Meeting",document.getElementById("eventCustomTitleGroup").style.display="none",document.getElementById("eventCustomTitle").value="",document.getElementById("eventDate").value="",document.getElementById("eventStartTime").value="",document.getElementById("eventEndTime").value="",document.getElementById("eventLocation").value="",document.getElementById("eventDescription").value="",J="#00C49A",document.querySelectorAll(".cal-color-swatch").forEach(a=>{a.classList.toggle("active",a.dataset.color===J)}),e.classList.add("active"))}function we(){const e=document.getElementById("modalAddEvent");e&&e.classList.remove("active")}function Pe(){const e=document.getElementById("eventTypeSelect").value;document.getElementById("eventCustomTitleGroup").style.display=e==="Custom"?"":"none"}function Me(e){J=e.dataset.color,document.querySelectorAll(".cal-color-swatch").forEach(a=>{a.classList.toggle("active",a.dataset.color===J)})}async function Be(){const e=document.getElementById("eventTypeSelect").value,a=document.getElementById("eventCustomTitle").value.trim(),r=document.getElementById("eventDate").value,t=document.getElementById("eventStartTime").value,o=document.getElementById("eventEndTime").value,s=document.getElementById("eventLocation").value.trim(),n=document.getElementById("eventDescription").value.trim(),p=e==="Custom"?a||"Custom Event":e;if(!r){alert("Please select a date.");return}const w=await le();if(!w){alert("Could not determine club. Please try again.");return}const l=document.getElementById("btnSaveEvent");l.disabled=!0,l.innerHTML='<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i> Saving...';try{const{error:d}=await P.from("calendar_events").insert({club_id:w,title:p,event_type:e==="Custom"?"Custom":e,date:r,start_time:t||null,end_time:o||null,location:s||null,description:n||null,color:J});if(d)throw d;A=null,we(),O()}catch(d){console.error("Error saving event:",d),alert("Failed to save event. Please try again.")}finally{l.disabled=!1,l.innerHTML='<i class="fas fa-check" style="margin-right:6px;"></i> Save Event'}}async function Le(e){if(confirm("Delete this event?"))try{const{error:a}=await P.from("calendar_events").delete().eq("id",e);if(a)throw a;A=null,Q(),O()}catch(a){console.error("Error deleting event:",a),alert("Failed to delete event.")}}async function ze(e,a){e&&e.stopPropagation(),Q();const t=(await ie()).find(c=>String(c.id)===String(a));if(!t)return;const o=t.date?new Date(t.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}):"No date set",s=t.isPast&&(t.homeScore!=null||t.awayScore!=null),n=t.matchType==="player_watch",p=n?"linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)":"linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",w=n?"#8b5cf6":"#ef4444",l=m(t.homeTeam||t.squadName),d=m(t.awayTeam||t.opponent||"TBC"),u=s?`<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:10px 8px;margin-bottom:8px;background:${n?"#f5f3ff":"#fef2f2"};border-radius:10px;text-align:center;">
            <span style="font-size:0.85rem;font-weight:800;color:#0f172a;">${l}</span>
            <span style="font-size:1.2rem;font-weight:900;color:${w};white-space:nowrap;">${t.homeScore??"?"} - ${t.awayScore??"?"}</span>
            <span style="font-size:0.85rem;font-weight:800;color:#0f172a;">${d}</span>
           </div>`:"";let k;if(n){const c=t.watchedPlayerName||"Player";k=`<div class="cal-popup-row" style="color:#8b5cf6;font-weight:700;background:rgba(139,92,246,0.05);padding:6px 10px;border-radius:8px;margin-bottom:12px;"><i class="fas fa-eye"></i>${m(c)}${t.opponent?" @ "+m(t.opponent):""}</div>`}else k=`<div class="cal-popup-row" style="color:#ef4444;font-weight:700;background:rgba(239,68,68,0.05);padding:6px 10px;border-radius:8px;margin-bottom:12px;"><i class="fas fa-futbol"></i>${m(t.squadName)}${t.opponent?" vs "+m(t.opponent):""}</div>`;let g;n?g=s?"Player Watch Result":"Player Watch":g=s?"Match Result":"Upcoming Fixture";const q=[u,k,t.time?`<div class="cal-popup-row"><i class="fas fa-clock"></i><strong>${n?"Time:":"Kick-off:"}</strong> ${t.time}</div>`:"",t.venue?`<div class="cal-popup-row"><i class="fas fa-map-marker-alt"></i><strong>Venue:</strong> ${m(t.venue)}</div>`:"",t.competition?`<div class="cal-popup-row"><i class="fas fa-trophy"></i><strong>Competition:</strong> ${m(t.competition)}</div>`:"",!n&&t.ourSide?`<div class="cal-popup-row"><i class="fas fa-flag"></i><strong>Playing:</strong> ${t.ourSide==="home"?"Home":"Away"}</div>`:""].filter(Boolean).join(""),E=document.createElement("div");E.className="cal-session-popup",E.innerHTML=`
        <div class="cal-popup-head" style="background:${p};">
            <div class="cal-popup-head-title">${g}</div>
            <div class="cal-popup-head-date">${o}</div>
        </div>
        <div class="cal-popup-body">${q}</div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="window._closeCalPopup()">Close</button>
            <button class="cal-popup-btn primary" style="background:${w};" onclick="window.location.href='match-details.html?id=${a}'">View Match</button>
        </div>
    `,document.body.appendChild(E),R=E,re(E,e)}async function Ne(e,a){e&&e.stopPropagation(),Q();const[r,t,o]=await Promise.all([oe(),se(),ie()]),s=r.filter(u=>u.date===a),n=t.filter(u=>u.date===a),p=o.filter(u=>u.date===a),w=new Date(a+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});let l="";p.forEach(u=>{const k=String(u.id).replace(/'/g,""),g=u.matchType==="player_watch",q=g?"fa-eye":"fa-futbol",E=g?"#8b5cf6":"#ef4444";let c;if(g){const y=u.watchedPlayerName||"Player";c=u.opponent?`${y} @ ${u.opponent}`:y}else c=`${u.squadName} ${u.opponent?"vs "+u.opponent:""}`;l+=`<div class="cal-popup-row" style="cursor:pointer;padding:6px 8px;border-radius:6px;" onclick="window._closeCalPopup();window._showMatchPopup(event,'${k}')">
            <i class="fas ${q}" style="color:${E};width:14px;text-align:center;"></i>
            <span style="font-weight:600;">${m(c)}</span>
            <span style="margin-left:auto;font-size:0.75rem;color:#94a3b8;">${u.time||"TBC"}</span>
        </div>`}),s.forEach(u=>{const k=String(u.id).replace(/'/g,""),g=ne?`window._closeCalPopup();window._onRegisterSessionClick(event,'${k}')`:`window._closeCalPopup();window._showSessionPopup(event,'${k}')`;l+=`<div class="cal-popup-row" style="cursor:pointer;padding:6px 8px;border-radius:6px;" onclick="${g}">
            <i class="fas fa-calendar-check" style="color:#00C49A;width:14px;text-align:center;"></i>
            <span style="font-weight:600;">${m(u.team||"No Team")}</span>
            <span style="margin-left:auto;font-size:0.75rem;color:#94a3b8;">${u.startTime||"--:--"}</span>
        </div>`}),n.forEach(u=>{const k=String(u.id).replace(/'/g,"");l+=`<div class="cal-popup-row" style="cursor:pointer;padding:6px 8px;border-radius:6px;" onclick="window._closeCalPopup();window._showEventPopup(event,'${k}')">
            <i class="fas fa-tag" style="color:${u.color||"#64748b"};width:14px;text-align:center;"></i>
            <span style="font-weight:600;">${m(u.title)}</span>
            <span style="margin-left:auto;font-size:0.75rem;color:#94a3b8;">${u.startTime||""}</span>
        </div>`});const d=document.createElement("div");d.className="cal-session-popup",d.innerHTML=`
        <div class="cal-popup-head">
            <div class="cal-popup-head-title">${w}</div>
            <div class="cal-popup-head-date">${p.length+s.length+n.length} items</div>
        </div>
        <div class="cal-popup-body" style="max-height:300px;overflow-y:auto;">${l}</div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="window._closeCalPopup()">Close</button>
        </div>
    `,document.body.appendChild(d),R=d,re(d,e)}function Ae(e){H=null,A=null,N=null,v+=e,v>11?(v=0,b++):v<0&&(v=11,b--),C=`${b}-${String(v+1).padStart(2,"0")}-01`,T=null,O()}async function Re(e){try{const a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",{data:r}=await P.from("sessions").select("share_token").eq("id",e).single();let t=r?.share_token;if(!t){let s="";const n=new Uint8Array(12);crypto.getRandomValues(n),n.forEach(w=>{s+=a[w%a.length]}),t=s;const{error:p}=await P.from("sessions").update({share_token:t}).eq("id",e);if(p)throw p}const o=`${window.location.origin}/src/pages/session-share.html?token=${t}`;await navigator.clipboard.writeText(o),window.showToast&&window.showToast("Share link copied!","success")}catch(a){console.error("Share error:",a),window.showToast&&window.showToast("Failed to share","error")}}window._shareCalSession=Re;window._showSessionPopup=Ce;window._showEventPopup=De;window._showMatchPopup=ze;window._showDayOverflow=Ne;window._closeCalPopup=Q;window._changeMonth=Ae;window._openAddEvent=Ie;window._closeEventModal=we;window._onEventTypeChange=Pe;window._pickEventColor=Me;window._saveEvent=Be;window._deleteEvent=Le;window._selectMobileDate=ke;window._shiftMobileWeek=Ee;window._toggleMobileCalExpand=Te;document.addEventListener("click",e=>{R&&!R.contains(e.target)&&!e.target.closest(".calendar-bubble")&&!e.target.closest(".mcal-detail-row")&&!e.target.closest(".calendar-more-link")&&Q()},!0);window.addEventListener("scroll",()=>{R&&Q()},!0);function je(e){ne=e,e&&(window._onRegisterSessionClick=e)}function Ye(){H=null,A=null,N=null}let te=null;function Ue(){Se(),O(),window.addEventListener("resize",()=>{const e=ae();te!==null&&te!==e&&O(),te=e}),te=ae()}let he=!1,M=new Set,G=new Set,ue=null;function We(){if(he)return;he=!0,document.body.insertAdjacentHTML("beforeend",`
    <div class="modal-overlay" id="quickSessionModal">
        <div class="modal-container modal-bubble" style="max-width:520px;margin:24px;max-height:calc(100vh - 48px);overflow-y:auto;padding:28px 28px 24px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="margin:0;font-size:1.1rem;color:var(--navy-dark);"><i class="fas fa-bolt" style="margin-right:8px;color:var(--primary);"></i>Quick Session</h3>
                <button onclick="window._closeQuickSession()" style="width:32px;height:32px;border-radius:50%;border:1px solid var(--border-light);background:var(--bg-body);color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.85rem;transition:all 0.15s;" onmouseenter="this.style.background='#fee2e2';this.style.color='#ef4444';this.style.borderColor='#fecaca'" onmouseleave="this.style.background='';this.style.color='';this.style.borderColor=''"><i class="fas fa-times"></i></button>
            </div>

            <div class="qs-form-row">
                <div class="qs-field" style="flex:1;">
                    <label>Date</label>
                    <input type="date" id="qsDate">
                </div>
                <div class="qs-field" style="width:110px;">
                    <label>Time</label>
                    <input type="time" id="qsTime" placeholder="e.g. 15:00">
                </div>
                <div class="qs-field" style="width:110px;">
                    <label>Duration</label>
                    <input type="text" id="qsDuration" placeholder="60 min" value="60 min">
                </div>
            </div>

            <div class="qs-form-row">
                <div class="qs-field" style="flex:1;">
                    <label>Title (optional)</label>
                    <input type="text" id="qsTitle" placeholder="Training Session">
                </div>
                <div class="qs-field" style="flex:1;">
                    <label>Venue (optional)</label>
                    <input type="text" id="qsVenue" placeholder="Main Pitch">
                </div>
            </div>

            <div style="margin-top:12px;padding:10px 14px;background:var(--bg-body);border:1px solid var(--border-light);border-radius:10px;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.8rem;font-weight:600;color:var(--text-secondary);">
                    <input type="checkbox" id="qsRecurring" onchange="document.getElementById('qsRecurringOptions').style.display=this.checked?'':'none'">
                    <i class="fas fa-redo" style="color:var(--primary);"></i> Make this a recurring session
                </label>
                <div id="qsRecurringOptions" style="display:none;margin-top:10px;">
                    <div class="qs-form-row" style="margin-bottom:6px;">
                        <div class="qs-field" style="flex:1;">
                            <label>Day of Week</label>
                            <select id="qsRecurDay">
                                <option value="1">Monday</option>
                                <option value="2">Tuesday</option>
                                <option value="3">Wednesday</option>
                                <option value="4">Thursday</option>
                                <option value="5">Friday</option>
                                <option value="6">Saturday</option>
                                <option value="0">Sunday</option>
                            </select>
                        </div>
                        <div class="qs-field" style="width:100px;">
                            <label>Weeks</label>
                            <input type="number" id="qsRecurWeeks" value="8" min="1" max="52" placeholder="8">
                        </div>
                    </div>
                    <p style="font-size:0.7rem;color:var(--text-muted);margin:0;">Creates one session per week starting from the selected date.</p>
                </div>
            </div>

            <!-- ── ACADEMY: single squad select ── -->
            <div id="qsSquadWrap" class="qs-field" style="margin-top:12px;">
                <label>Squad</label>
                <select id="qsSquad" onchange="window._onQsSquadChange()">
                    <option value="">-- Select Squad --</option>
                </select>
            </div>

            <!-- ── PRIVATE COACHING: multi-squad chips ── -->
            <div id="qsMultiSquadWrap" style="display:none;margin-top:12px;">
                <label style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);">Squads <span style="font-weight:400;color:var(--text-muted);">— select to show players</span></label>
                <div id="qsSquadChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;"></div>
            </div>

            <!-- ── ACADEMY: search + chip players ── -->
            <div id="qsAcademyPlayers">
                <div class="qs-field" style="margin-top:12px;">
                    <label><i class="fas fa-search" style="margin-right:4px;opacity:0.5;"></i>Search player to add</label>
                    <input type="text" id="qsPlayerSearch" placeholder="Type name..." autocomplete="off" style="border-style:dashed;">
                    <div id="qsSearchResults" style="max-height:120px;overflow-y:auto;margin-top:4px;"></div>
                </div>
                <div style="margin-top:12px;">
                    <label style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);">
                        Players <span id="qsPlayerCount" style="color:var(--primary);">(0)</span>
                        <span style="font-weight:400;color:var(--text-muted);margin-left:8px;">Click to remove</span>
                    </label>
                    <div id="qsPlayerChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:36px;padding:10px;background:var(--bg-body);border-radius:10px;border:1px solid var(--border-light);">
                        <span style="color:var(--text-muted);font-size:0.8rem;">Select a squad or search players</span>
                    </div>
                </div>
            </div>

            <!-- ── PRIVATE COACHING: search + checklist ── -->
            <div id="qsPrivatePlayers" style="display:none;">
                <div class="qs-field" style="margin-top:12px;">
                    <label><i class="fas fa-search" style="margin-right:4px;opacity:0.5;"></i>Search players across all squads</label>
                    <input type="text" id="qsPrivateSearch" placeholder="Type name..." autocomplete="off">
                </div>
                <div id="qsChecklist" style="margin-top:8px;max-height:220px;overflow-y:auto;padding:8px;background:var(--bg-body);border:1px solid var(--border-light);border-radius:10px;"></div>
                <div style="font-size:0.75rem;color:var(--primary);font-weight:600;margin-top:6px;" id="qsCheckCount">0 players selected</div>
            </div>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
                <button class="dash-btn" onclick="window._closeQuickSession()">Cancel</button>
                <button class="dash-btn primary" id="btnSaveQuickSession" onclick="window._saveQuickSession()">
                    <i class="fas fa-save" style="margin-right:6px;"></i>Save Session & Attendance
                </button>
            </div>
        </div>
    </div>
    <style>
        #quickSessionModal .modal-container { box-sizing:border-box; }
        .qs-form-row { display:flex; gap:10px; margin-bottom:10px; align-items:flex-end; }
        .qs-field { display:flex; flex-direction:column; }
        .qs-field label { font-size:0.75rem; font-weight:600; color:var(--text-secondary); margin-bottom:4px; }
        .qs-field input, .qs-field select { padding:9px 12px; border:1px solid var(--border-light); border-radius:8px; font-family:inherit; font-size:0.84rem; background:var(--bg-body); color:var(--text-primary); box-sizing:border-box; width:100%; height:38px; }
        .qs-field .flatpickr-input { height:38px !important; }
        .qs-chip { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:8px; font-size:0.8rem; font-weight:600; background:#ecfdf5; color:#065f46; border:1px solid #d1fae5; cursor:pointer; transition:all 0.1s; }
        .qs-chip:hover { background:#fee2e2; color:#991b1b; border-color:#fecaca; }
        .qs-squad-chip { display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:8px; font-size:0.79rem; font-weight:600; background:var(--bg-body); color:var(--text-secondary); border:1px solid var(--border-light); cursor:pointer; transition:all 0.15s; }
        .qs-squad-chip.active { background:var(--primary); color:#fff; border-color:var(--primary); }
        .qs-search-item { display:flex; align-items:center; gap:8px; padding:6px 10px; cursor:pointer; border-radius:6px; font-size:0.82rem; }
        .qs-search-item:hover { background:var(--bg-body); }
        .qs-checklist-squad { font-size:0.72rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; padding:6px 4px 3px; }
        .qs-checklist-player { display:flex; align-items:center; gap:8px; padding:5px 4px; border-radius:6px; cursor:pointer; font-size:0.83rem; transition:background 0.1s; }
        .qs-checklist-player:hover { background:#f1f5f9; }
        .qs-checklist-player input[type="checkbox"] { width:15px; height:15px; cursor:pointer; accent-color:var(--primary); flex-shrink:0; }
        @media (max-width: 480px) { .qs-form-row { flex-direction:column; } }
    </style>`),document.getElementById("qsPlayerSearch")?.addEventListener("input",a=>{const r=a.target.value.toLowerCase().trim(),t=document.getElementById("qsSearchResults");if(!r){t.innerHTML="";return}const s=I.getPlayers({}).filter(n=>n.name.toLowerCase().includes(r)&&!M.has(n.id)).slice(0,8);t.innerHTML=s.map(n=>{const p=n.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);return`<div class="qs-search-item" onclick="window._qsAddPlayer('${n.id}')">
                <div style="width:26px;height:26px;border-radius:50%;background:#e2e8f0;color:#475569;font-size:0.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;">${p}</div>
                <span>${n.name}</span>
            </div>`}).join("")||'<div style="padding:8px;color:var(--text-muted);font-size:0.8rem;">No matches</div>'}),document.getElementById("qsPrivateSearch")?.addEventListener("input",()=>fe())}function He(e){We(),ue=e||null,M=new Set,G=new Set;const a=window._profile?.clubs?.settings?.archetype==="private_coaching",r=new Date().toISOString().split("T")[0];document.getElementById("qsDate").value=r,document.getElementById("qsTime").value="",document.getElementById("qsDuration").value="60 min",document.getElementById("qsTitle").value="",document.getElementById("qsVenue").value="",document.getElementById("qsRecurring").checked=!1,document.getElementById("qsRecurringOptions").style.display="none";const t=I.getSquads();if(a){document.getElementById("qsSquadWrap").style.display="none",document.getElementById("qsAcademyPlayers").style.display="none",document.getElementById("qsMultiSquadWrap").style.display="",document.getElementById("qsPrivatePlayers").style.display="";const o=document.getElementById("qsPrivateSearch");o&&(o.value="");const s=document.getElementById("qsSquadChips");s.innerHTML=t.map(n=>`<div class="qs-squad-chip" data-squad-id="${n.id}" onclick="window._onQsSquadChipClick('${n.id}', this)">
                ${n.name} <span style="opacity:0.6;font-weight:400;">(${I.getPlayers({squadId:n.id}).length})</span>
            </div>`).join(""),fe(),ge()}else{document.getElementById("qsSquadWrap").style.display="",document.getElementById("qsAcademyPlayers").style.display="",document.getElementById("qsMultiSquadWrap").style.display="none",document.getElementById("qsPrivatePlayers").style.display="none",document.getElementById("qsPlayerSearch").value="",document.getElementById("qsSearchResults").innerHTML="";const o=document.getElementById("qsSquad");o.innerHTML='<option value="">-- Select Squad --</option>'+t.map(s=>`<option value="${s.id}">${s.name} (${I.getPlayers({squadId:s.id}).length})</option>`).join(""),ce()}document.getElementById("quickSessionModal").classList.add("active");try{be()}catch{}}window._closeQuickSession=function(){document.getElementById("quickSessionModal")?.classList.remove("active")};window._openQuickSession=function(){He()};window._onQsSquadChipClick=function(e,a){G.has(e)?(G.delete(e),a.classList.remove("active")):(G.add(e),a.classList.add("active")),fe()};function fe(){const e=document.getElementById("qsChecklist");if(!e)return;const a=(document.getElementById("qsPrivateSearch")?.value||"").trim().toLowerCase(),r=a?I.getSquads().map(o=>o.id):[...G];if(r.length===0&&!a){e.innerHTML='<div style="color:var(--text-muted);font-size:0.8rem;padding:8px 4px;">Select a squad above to see players</div>';return}let t="";for(const o of r){const s=I.getSquad(o);let n=I.getPlayers({squadId:o});a&&(n=n.filter(p=>p.name.toLowerCase().includes(a))),n.length!==0&&(t+=`<div class="qs-checklist-squad">${s?.name||"Unknown"}</div>`,t+=n.map(p=>{const w=M.has(p.id);return`<label class="qs-checklist-player">
                <input type="checkbox" value="${p.id}" ${w?"checked":""}
                    onchange="window._onQsChecklistToggle('${p.id}', this.checked)">
                <span>${p.name}</span>
                ${p.position?`<span style="font-size:0.72rem;color:var(--text-muted);">${p.position.split(",")[0].trim()}</span>`:""}
            </label>`}).join(""))}t?e.innerHTML=t:e.innerHTML='<div style="color:var(--text-muted);font-size:0.8rem;padding:8px 4px;">No players found</div>',ge()}window._onQsChecklistToggle=function(e,a){a?M.add(e):M.delete(e),ge()};function ge(){const e=document.getElementById("qsCheckCount");e&&(e.textContent=`${M.size} player${M.size!==1?"s":""} selected`)}window._onQsSquadChange=function(){const e=document.getElementById("qsSquad")?.value;if(!e)return;I.getPlayers({squadId:e}).forEach(r=>M.add(r.id)),ce()};window._qsAddPlayer=function(e){M.add(e),document.getElementById("qsPlayerSearch").value="",document.getElementById("qsSearchResults").innerHTML="",ce()};window._qsRemovePlayer=function(e){M.delete(e),ce()};function ce(){const e=document.getElementById("qsPlayerChips"),a=document.getElementById("qsPlayerCount"),t=I.getPlayers({}).filter(o=>M.has(o.id));if(a.textContent=`(${t.length})`,!t.length){e.innerHTML='<span style="color:var(--text-muted);font-size:0.8rem;">Select a squad or search players</span>';return}e.innerHTML=t.map(o=>`<span class="qs-chip" onclick="window._qsRemovePlayer('${o.id}')" title="Click to remove">
            ${o.name} <i class="fas fa-times" style="font-size:0.65rem;opacity:0.5;"></i>
        </span>`).join("")}window._saveQuickSession=async function(){const e=document.getElementById("qsDate")?.value;if(!e){U("Please select a date","error");return}if(M.size===0){U("Please select at least one player","error");return}const a=window._profile?.clubs?.settings?.archetype==="private_coaching",r=a?null:document.getElementById("qsSquad")?.value||null;if(!a&&!r){U("Please select a squad — required for attendance tracking","error");return}const t=document.getElementById("btnSaveQuickSession");t.disabled=!0,t.innerHTML='<i class="fas fa-spinner fa-spin"></i> Saving...';try{const o=sessionStorage.getItem("impersonating_club_id")||window._profile?.club_id,s=window._profile?.id,n=window._profile?.full_name||"";if(!o)throw new Error("No club context");const p=document.getElementById("qsTitle")?.value?.trim()||"Training Session",w=document.getElementById("qsTime")?.value||null,l=document.getElementById("qsDuration")?.value?.trim()||"",d=document.getElementById("qsVenue")?.value?.trim()||"",u=[...M],k=window._profile?.clubs?.settings?.current_season||new Date().getFullYear().toString();let g="";if(a){const f=[...G].map(S=>I.getSquad(S)?.name).filter(Boolean);g=f.length===1?f[0]:f.length>1?"Multi-Squad":"Training"}else g=I.getSquads().find(f=>f.id===r)?.name||"";let q={};if(a){const f=I.getPlayers({});for(const S of u){const i=f.find($=>$.id===S)?.squadId||null;i&&(q[i]||(q[i]=[]),q[i].push(S))}}const E=document.getElementById("qsRecurring")?.checked,c=parseInt(document.getElementById("qsRecurDay")?.value||"1"),y=parseInt(document.getElementById("qsRecurWeeks")?.value||"8"),x=[];if(E&&y>1){const f=new Date(e),S=(c-f.getDay()+7)%7,D=new Date(f);S>0&&D.setDate(D.getDate()+S);for(let i=0;i<y;i++){const $=new Date(D);$.setDate($.getDate()+i*7),x.push($.toISOString().split("T")[0])}}else x.push(e);let B=0;const W=new Date().toLocaleDateString("en-CA"),h=10;for(let f=0;f<x.length;f+=h){const D=x.slice(f,f+h).map(_=>({club_id:o,created_by:s,title:p,date:_,start_time:w,duration:l,venue:d,team:g,author:n,purpose:E?"Recurring Session":"Quick Session",player_ids:u,season:k})),{data:i,error:$}=await P.from("sessions").insert(D).select("id, date");if($){console.warn("Batch insert failed:",$);continue}B+=(i||[]).length;const z=(i||[]).filter(_=>_.date<=W);if(z.length===0)continue;let L=[];if(a)for(const _ of z)for(const[j,F]of Object.entries(q)){const Y=I.getPlayers({squadId:j}).length;L.push({club_id:o,session_id:_.id,squad_id:j,date:_.date,absent_player_ids:[],attendance_count:F.length,attendance_total:Y,notes:"",updated_at:new Date().toISOString()})}else L=z.map(_=>({club_id:o,session_id:_.id,squad_id:r,date:_.date,absent_player_ids:[],attendance_count:u.length,attendance_total:u.length,notes:"",updated_at:new Date().toISOString()}));L.length>0&&await P.from("training_attendance").upsert(L,{onConflict:"session_id,squad_id"}).catch(_=>console.warn("Attendance batch:",_))}window._closeQuickSession(),E?U(`${B} recurring sessions created (${y} weeks)`,"success"):U(`Quick session saved — ${u.length} players present`,"success"),ue&&ue()}catch(o){console.error("Quick session error:",o),U("Failed to save: "+(o.message||""),"error")}finally{t.disabled=!1,t.innerHTML='<i class="fas fa-save" style="margin-right:6px;"></i>Save Session & Attendance'}};export{Ye as a,oe as f,Ue as i,He as o,O as r,je as s};
