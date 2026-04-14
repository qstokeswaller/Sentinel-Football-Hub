import"./modulepreload-polyfill-B5Qt9EMX.js";import{s as y}from"./supabase-CNU450ah.js";import{r as j,g as F,l as R}from"./auth-Cf7XUdJT.js";import{b as z}from"./rbac-LN74jxRk.js";let E=[],k=[],D=[],B=[],I=[];async function O(i){await U(),M(),T(),J()}async function U(){const i=new Date(Date.now()-15552e6).toISOString(),[t,l,n,s,v]=await Promise.all([y.from("clubs").select("*").order("created_at",{ascending:!1}).limit(200),y.from("profiles").select("id, full_name, role, club_id, created_at").limit(1e3),y.from("players").select("id, club_id").limit(5e3),y.from("sessions").select("id, club_id, created_by, title, is_template, created_at").gte("created_at",i).limit(1e3),y.from("drills").select("id, club_id, created_by, session_id, title, created_at").gte("created_at",i).limit(2e3)]);E=t.data||[],k=l.data||[],D=n.data||[],B=s.data||[],I=v.data||[],t.error&&console.error("Failed to load clubs:",t.error),l.error&&console.error("Failed to load profiles:",l.error),n.error&&console.error("Failed to load players:",n.error),s.error&&console.error("Failed to load sessions:",s.error),v.error&&console.error("Failed to load drills:",v.error)}function M(){const i=E.length,t=k.filter(s=>s.club_id).length,l=k.filter(s=>s.role==="coach"||s.role==="admin").length,n=D.length;document.getElementById("statClubs").textContent=i,document.getElementById("statUsers").textContent=t,document.getElementById("statCoaches").textContent=l,document.getElementById("statPlayers").textContent=n}function T(i=""){const t=document.getElementById("clubsContainer"),l=i?E.filter(s=>s.name.toLowerCase().includes(i.toLowerCase())):E;if(l.length===0){t.innerHTML=`
            <div class="empty-state">
                <i class="fas fa-building"></i>
                <p>${i?"No clubs match your search.":"No clubs yet. Create your first club!"}</p>
            </div>
        `;return}const n=l.map(s=>{const v=k.filter(c=>c.club_id===s.id),m=D.filter(c=>c.club_id===s.id),d=B.filter(c=>c.club_id===s.id&&!c.is_template),f=I.filter(c=>c.club_id===s.id),h=v.length,$=m.length,C=s.name.trim().split(/\s+/).map(c=>c[0]).join("").toUpperCase().slice(0,2),a=s.settings?.branding?.logo_url,r=(s.settings?.archetype||"academy").replace(/_/g," "),w=s.settings?.plan||"trial",L=s.settings?.status||"active";new Date(s.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});const _=a?`<img src="${g(a)}" alt="${g(s.name)}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;" onerror="this.outerHTML='${C}'">`:C;return`
            <div class="club-card" data-club-id="${s.id}">
                <div class="club-card-top">
                    <div class="club-card-avatar">${_}</div>
                    <div>
                        <div class="club-card-name">${g(s.name)}</div>
                        <div class="club-card-archetype">${r}</div>
                    </div>
                </div>
                <div class="club-card-metrics">
                    <div class="club-metric"><strong>${h}</strong> users</div>
                    <div class="club-metric"><strong>${$}</strong> players</div>
                    <div class="club-metric"><strong>${d.length}</strong> sessions</div>
                    <div class="club-metric"><strong>${f.length}</strong> drills</div>
                </div>
                <div class="club-card-footer">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="club-status ${L}"><span class="dot"></span> ${A(L)}</span>
                        <span class="club-plan-tag ${w}">${w.toUpperCase()}</span>
                    </div>
                    <span class="club-card-enter"><i class="fas fa-arrow-right"></i> Enter</span>
                </div>
            </div>
        `}).join("");t.innerHTML=`<div class="clubs-grid">${n}</div>`,t.querySelectorAll(".club-card").forEach(s=>{s.addEventListener("click",()=>{const v=s.dataset.clubId;q(v)})})}function q(i){const t=E.find(e=>e.id===i);if(!t)return;const l=k.filter(e=>e.club_id===i),n=D.filter(e=>e.club_id===i),s=B.filter(e=>e.club_id===i&&!e.is_template),v=B.filter(e=>e.club_id===i&&e.is_template),m=I.filter(e=>e.club_id===i),d=(t.settings?.archetype||"academy").replace(/_/g," "),f=t.settings?.features||{},h=t.name.trim().split(/\s+/).map(e=>e[0]).join("").toUpperCase().slice(0,2),$=t.settings?.branding?.logo_url,C=new Date(t.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}),a=$?`<img src="${g($)}" alt="${g(t.name)}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;" onerror="this.outerHTML='${h}'">`:h,r={admin:0,coach:0,viewer:0};l.forEach(e=>{r[e.role]!==void 0&&r[e.role]++});const w=l.length>0?l.map(e=>{const o=e.role==="admin"?"admin":e.role==="coach"?"coach":"viewer",p=s.filter(u=>u.created_by===e.id).length,b=m.filter(u=>u.created_by===e.id).length;return`
                <div class="member-item member-clickable" data-user-id="${e.id}" data-club-id="${i}" style="cursor:pointer;" title="Click to view activity">
                    <div>
                        <div class="name">${g(e.full_name||"Unknown")}</div>
                        <div class="email">${p} sessions &middot; ${b} drills</div>
                    </div>
                    <span class="role-tag ${o}">${e.role}</span>
                </div>
            `}).join(""):'<div style="text-align:center;padding:20px;color:var(--plat-text-dim);font-size:0.82rem;">No team members</div>',L=`
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-icon" style="background:rgba(96,165,250,0.12);color:#60a5fa;"><i class="fas fa-users"></i></div>
                <div class="metric-value">${l.length}</div>
                <div class="metric-label">Users</div>
                <div class="metric-breakdown">${r.admin} admin &middot; ${r.coach} coach &middot; ${r.viewer} viewer</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon" style="background:rgba(0,196,154,0.12);color:#00C49A;"><i class="fas fa-clipboard-list"></i></div>
                <div class="metric-value">${s.length}</div>
                <div class="metric-label">Sessions</div>
                <div class="metric-breakdown">${v.length} templates</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon" style="background:rgba(245,158,11,0.12);color:#f59e0b;"><i class="fas fa-pencil-ruler"></i></div>
                <div class="metric-value">${m.length}</div>
                <div class="metric-label">Drills</div>
                <div class="metric-breakdown">${m.filter(e=>!e.session_id).length} standalone</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon" style="background:rgba(16,185,129,0.12);color:#10b981;"><i class="fas fa-running"></i></div>
                <div class="metric-value">${n.length}</div>
                <div class="metric-label">Players</div>
                <div class="metric-breakdown">&nbsp;</div>
            </div>
        </div>
    `,_=Object.keys(f).length>0?Object.entries(f).map(([e,o])=>`<div class="feature-row">
                <i class="fas ${o?"fa-check-circle on":"fa-times-circle off"}"></i>
                <span>${e.replace(/_/g," ")}</span>
            </div>`).join(""):'<div style="color:var(--plat-text-dim);font-size:0.82rem;">No feature flags configured.</div>',c=document.getElementById("clubsContainer");c.innerHTML=`
        <div class="club-detail">
            <div class="club-detail-header">
                <div class="club-detail-left">
                    <div class="club-detail-avatar">${a}</div>
                    <div class="club-detail-meta">
                        <h2>${g(t.name)}</h2>
                        <p>${A(d)} &middot; ${l.length} users &middot; ${n.length} players &middot; Created ${C}</p>
                    </div>
                </div>
                <div class="club-detail-actions">
                    <button class="btn-back" id="btnBackToCards">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <button class="btn-impersonate" id="btnImpersonate" data-club-id="${t.id}" data-club-name="${g(t.name)}">
                        <i class="fas fa-eye"></i> Enter as Admin
                    </button>
                    <button class="btn-back" id="btnDeleteClub" data-club-id="${t.id}" data-club-name="${g(t.name)}" style="background:#ef4444;color:#fff;border-color:#ef4444;">
                        <i class="fas fa-trash"></i> Delete Club
                    </button>
                </div>
            </div>
            <div class="club-detail-body">
                <div class="detail-block" style="grid-column: 1 / -1;">
                    <h3><i class="fas fa-chart-bar"></i> Club Metrics</h3>
                    ${L}
                </div>
                <div class="detail-block">
                    <h3><i class="fas fa-users"></i> Team Members (${l.length})</h3>
                    <div class="members-list">${w}</div>
                </div>
                <div class="detail-block">
                    <h3><i class="fas fa-sliders-h"></i> Feature Flags</h3>
                    ${_}
                    <h3 style="margin-top:20px;"><i class="fas fa-code"></i> Settings (JSONB)</h3>
                    <pre class="settings-json">${JSON.stringify(t.settings||{},null,2)}</pre>
                </div>
                <div class="detail-block" id="userActivityPanel" style="grid-column: 1 / -1; display: none;">
                </div>
            </div>
        </div>
    `,document.getElementById("btnBackToCards").addEventListener("click",()=>{T(document.getElementById("clubSearch")?.value||"")}),document.getElementById("btnImpersonate").addEventListener("click",e=>{const o=e.currentTarget,p=o.dataset.clubId,b=E.find(P=>P.id===p),u=b?.name||o.dataset.clubName||"",S=b?.settings?.branding?.logo_url||"",x=b?.settings?.archetype||"",N=b?.settings?.branding?.club_display_name||u,H=new URLSearchParams({club:p,club_name:u,club_logo:S,club_display:N,club_archetype:x});window.open(`/src/pages/dashboard.html?${H.toString()}`,"_blank")}),document.getElementById("btnDeleteClub").addEventListener("click",async e=>{const o=e.currentTarget,p=o.dataset.clubId,b=o.dataset.clubName;if(confirm(`Are you sure you want to delete "${b}"?

This will permanently delete the club and all its data (players, sessions, drills, invites). This cannot be undone.`)&&confirm(`FINAL WARNING: Type OK to confirm deletion of "${b}".`)){o.disabled=!0,o.innerHTML='<i class="fas fa-spinner fa-spin"></i> Deleting...';try{const{error:u,count:S}=await y.from("clubs").delete({count:"exact"}).eq("id",p);if(u)throw u;if(S===0)throw new Error("Delete blocked by database permissions (RLS). Run migration 006_platform_admin_delete_update.sql in Supabase SQL Editor first.");alert(`Club "${b}" deleted.`),await U(),M(),T()}catch(u){console.error("Delete club error:",u),alert(`Failed to delete club: ${u.message}`),o.disabled=!1,o.innerHTML='<i class="fas fa-trash"></i> Delete Club'}}}),c.querySelectorAll(".member-clickable").forEach(e=>{e.addEventListener("click",()=>{const o=e.dataset.userId,p=e.dataset.clubId;G(o,p),c.querySelectorAll(".member-clickable").forEach(b=>b.style.borderLeft=""),e.style.borderLeft="3px solid var(--plat-accent)"})})}function G(i,t){const l=document.getElementById("userActivityPanel");if(!l)return;const n=k.find(a=>a.id===i),s=B.filter(a=>a.club_id===t&&a.created_by===i&&!a.is_template),v=B.filter(a=>a.club_id===t&&a.created_by===i&&a.is_template),m=I.filter(a=>a.club_id===t&&a.created_by===i),d=m.filter(a=>!a.session_id),f=n?.full_name||"Unknown",h=n?.role==="admin"?"admin":n?.role==="coach"?"coach":"viewer",$=s.length>0?s.slice(0,20).map(a=>{const r=a.created_at?new Date(a.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):"",w=I.filter(L=>L.session_id===a.id).length;return`<div class="activity-item"><span class="activity-title">${g(a.title||"Untitled")}</span><span class="activity-meta">${w} drills &middot; ${r}</span></div>`}).join(""):'<div style="color:var(--plat-text-dim);font-size:0.8rem;padding:8px 0;">No sessions created</div>',C=d.length>0?d.slice(0,20).map(a=>{const r=a.created_at?new Date(a.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):"";return`<div class="activity-item"><span class="activity-title">${g(a.title||"Untitled")}</span><span class="activity-meta">${r}</span></div>`}).join(""):'<div style="color:var(--plat-text-dim);font-size:0.8rem;padding:8px 0;">No standalone drills</div>';l.style.display="",l.innerHTML=`
        <div class="user-activity-header">
            <h3><i class="fas fa-user"></i> ${g(f)} <span class="role-tag ${h}" style="vertical-align:middle;margin-left:6px;">${n?.role||"-"}</span></h3>
            <button class="btn-close-activity" title="Close"><i class="fas fa-times"></i></button>
        </div>
        <div class="user-activity-stats">
            <div class="ua-stat"><strong>${s.length}</strong> sessions</div>
            <div class="ua-stat"><strong>${v.length}</strong> templates</div>
            <div class="ua-stat"><strong>${m.length}</strong> total drills</div>
            <div class="ua-stat"><strong>${d.length}</strong> standalone drills</div>
        </div>
        <div class="user-activity-lists">
            <div class="ua-list">
                <h4>Recent Sessions</h4>
                ${$}
            </div>
            <div class="ua-list">
                <h4>Standalone Drills</h4>
                ${C}
            </div>
        </div>
    `,l.querySelector(".btn-close-activity")?.addEventListener("click",()=>{l.style.display="none",document.querySelectorAll(".member-clickable").forEach(a=>a.style.borderLeft="")}),l.scrollIntoView({behavior:"smooth",block:"start"})}function J(i){const t=document.getElementById("createClubModal"),l=document.getElementById("btnCreateClub"),n=document.getElementById("btnCancelCreate"),s=document.getElementById("createClubForm");l.addEventListener("click",()=>t.classList.add("active")),n.addEventListener("click",()=>t.classList.remove("active")),t.addEventListener("click",m=>{m.target===t&&t.classList.remove("active")}),document.getElementById("newClubLogoFile")?.addEventListener("change",m=>{const d=m.target.files[0],f=document.getElementById("newClubLogoPreview");if(!(!d||!f)){if(d.size>2*1024*1024){alert("Logo must be under 2 MB"),m.target.value="";return}f.innerHTML=`<img src="${URL.createObjectURL(d)}" alt="Logo" style="width:100%;height:100%;object-fit:contain;">`}});const v=document.getElementById("clubSearch");v.addEventListener("input",()=>T(v.value)),s.addEventListener("submit",async m=>{m.preventDefault();const d=document.getElementById("btnSubmitCreate");d.disabled=!0,d.innerHTML='<i class="fas fa-spinner fa-spin"></i> Creating...';const f=document.getElementById("newClubName").value.trim(),h=document.getElementById("newClubAdminEmail").value.trim(),$=document.getElementById("newClubAdminName").value.trim(),C=document.getElementById("newClubArchetype").value,a=document.getElementById("newClubLogoFile")?.files?.[0]||null;try{let r="";if(a){if(a.size>2*1024*1024)throw new Error("Logo must be under 2 MB");const o=a.name.split(".").pop().toLowerCase(),p=`clubs/pending_${Date.now()}/logo.${o}`,{data:b,error:u}=await y.storage.from("avatars").upload(p,a,{cacheControl:"3600",upsert:!0,contentType:a.type});if(u)throw u;const{data:{publicUrl:S}}=y.storage.from("avatars").getPublicUrl(b.path);r=S}const{data:w}=await y.auth.getSession(),_=await fetch("https://ocfycodijzcwupafrpzv.supabase.co/functions/v1/provision-club-admin",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${w.session.access_token}`},body:JSON.stringify({clubName:f,adminEmail:h,adminName:$,archetype:C,logoUrl:r||void 0})}),c=await _.json();if(!_.ok&&_.status!==207)throw new Error(c.error||"Failed to provision club");t.classList.remove("active"),s.reset();const e=document.getElementById("newClubLogoPreview");e&&(e.innerHTML='<i class="fas fa-image" style="font-size:1.1rem;color:var(--plat-muted);"></i>'),_.status===207?alert(`Club "${f}" created, but the invite email failed to send.

${c.fallbackMessage||"Create a manual invite from the club detail view."}`):alert(`Club "${f}" created!

An invite email has been sent to ${h}.
They'll click the link in their email to activate their admin account.`),await U(),M(),T()}catch(r){console.error("Create club error:",r),alert(`Failed to create club: ${r.message}`)}finally{d.disabled=!1,d.innerHTML='<i class="fas fa-plus"></i> Create Club'}})}function A(i){return i.charAt(0).toUpperCase()+i.slice(1)}function g(i){const t=document.createElement("div");return t.textContent=i,t.innerHTML}document.addEventListener("DOMContentLoaded",async()=>{if(!await j())return;const t=await F();if(!z(t)){document.querySelector(".plat-main").innerHTML=`
                    <div class="access-denied">
                        <i class="fas fa-lock"></i>
                        <h2>Access Denied</h2>
                        <p>This page is restricted to platform administrators.</p>
                        <a href="/src/pages/dashboard.html" class="btn-back-home">
                            <i class="fas fa-arrow-left"></i> Back to Dashboard
                        </a>
                    </div>
                `;return}const l=t.full_name||t.email||"",n=l.trim().split(/\s+/).map(s=>s[0]).join("").toUpperCase().slice(0,2)||"?";document.getElementById("platUserAvatar").textContent=n,document.getElementById("platUserName").textContent=l,document.getElementById("btnLogout").addEventListener("click",R),O()});
