import"./modulepreload-polyfill-B5Qt9EMX.js";import{s as b}from"./supabase-CNU450ah.js";async function y(){const e=new URLSearchParams(window.location.search).get("token");if(!e){u("No share token provided. Check the link and try again.");return}try{const{data:a,error:t}=await b.rpc("get_shared_session",{p_token:e});if(t)throw t;if(!a||!a.session){u("Session not found or this share link has been revoked.");return}$(a.session,a.drills||[],a.animations||[])}catch(a){console.error("Share page error:",a),u("Failed to load session. Please try again later.")}}function $(e,a,t){document.getElementById("shareLoading").style.display="none",document.getElementById("shareContent").style.display="",document.title=(e.title||"Session Plan")+" | Sentinel Football Hub";const n=e.date?new Date(e.date).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):"";document.getElementById("shareHeader").innerHTML=`
        <h1>${r(e.title||"Untitled Session")}</h1>
        <div class="share-meta">
            ${n?`<span class="share-meta-item"><i class="fas fa-calendar-alt"></i> ${n}</span>`:""}
            ${e.start_time?`<span class="share-meta-item"><i class="fas fa-clock"></i> ${r(e.start_time)}</span>`:""}
            ${e.team?`<span class="share-meta-item"><i class="fas fa-users"></i> ${r(e.team)}</span>`:""}
            ${e.author?`<span class="share-meta-item"><i class="fas fa-user"></i> ${r(e.author)}</span>`:""}
        </div>
        ${e.venue||e.duration||e.equipment||e.purpose?`
        <div class="share-details">
            ${e.venue?`<div class="share-detail"><label>Venue</label><span>${r(e.venue)}</span></div>`:""}
            ${e.duration?`<div class="share-detail"><label>Duration</label><span>${r(e.duration)} min</span></div>`:""}
            ${e.ability_level?`<div class="share-detail"><label>Level</label><span>${r(e.ability_level)}</span></div>`:""}
            ${e.equipment?`<div class="share-detail"><label>Equipment</label><span>${r(e.equipment)}</span></div>`:""}
            ${e.purpose?`<div class="share-detail full"><label>Objectives</label><span>${r(e.purpose)}</span></div>`:""}
        </div>
        `:""}
    `;const s=new Map((t||[]).map(i=>[i.id,i])),l=a.sort((i,d)=>(i.order_index||0)-(d.order_index||0));document.getElementById("shareBody").innerHTML=l.map((i,d)=>{const o=i.animation_id?s.get(i.animation_id):null,p=o?w(o):i.image&&(i.image.startsWith("data:image/")||c(i.image))?`<img src="${r(i.image)}" class="share-drill-img" alt="${r(i.title)}">`:"",v=S(i.description),m=i.category==="Section",f=m?"Section":"Drill",g=m?"section":o?"animated":"static";return`
            <div class="share-drill-block">
                <div class="share-drill-header">
                    ${m?"":`<span class="share-drill-num">#${d+1}</span>`}
                    <span class="share-drill-badge ${g}">${f}${o?" (Animated)":""}</span>
                    <h3>${r(i.title||"Untitled")}</h3>
                </div>
                ${p}
                ${v}
            </div>
        `}).join("")}function c(e){try{const a=new URL(e,window.location.origin);return a.protocol==="https:"||a.protocol==="http:"}catch{return!1}}function w(e){if(e.video_url){const a=e.video_url;if(!c(a))return'<div class="share-drill-media"><p style="color:#94a3b8;font-style:italic;">Invalid video URL</p></div>';const t=r(a),n=a.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);if(n)return`<div class="share-drill-media"><iframe src="https://www.youtube.com/embed/${n[1]}" frameborder="0" allowfullscreen class="share-video-embed"></iframe></div>`;const s=a.match(/vimeo\.com\/(\d+)/);return s?`<div class="share-drill-media"><iframe src="https://player.vimeo.com/video/${s[1]}" frameborder="0" allowfullscreen class="share-video-embed"></iframe></div>`:/\.(mp4|webm|ogg|mov)(\?|$)/i.test(a)?`<div class="share-drill-media"><video src="${t}" controls class="share-video-embed"></video></div>`:`<div class="share-drill-media"><a href="${t}" target="_blank" rel="noopener" class="share-video-link"><i class="fas fa-play-circle"></i> View Animation Video</a></div>`}if(e.thumbnail){const a=e.thumbnail,t=a.startsWith("data:image/")||c(a)?a:"";return t?`<img src="${r(t)}" class="share-drill-img" alt="Animation preview">`:'<div class="share-drill-media"><p style="color:#94a3b8;font-style:italic;">Animation — no preview available</p></div>'}return'<div class="share-drill-media"><p style="color:#94a3b8;font-style:italic;">Animation — no preview available</p></div>'}function h(e){const a=document.createElement("div");return a.innerHTML=e,a.querySelectorAll("script,style,iframe,object,embed,form,input,textarea,select,button").forEach(t=>t.remove()),a.querySelectorAll("*").forEach(t=>{for(const n of[...t.attributes]){const s=n.name.toLowerCase();(s.startsWith("on")||s==="srcdoc"||s==="href"&&!c(n.value)&&n.value!=="#")&&t.removeAttribute(n.name)}}),a.innerHTML}function S(e){if(!e)return"";try{const a=typeof e=="string"?JSON.parse(e):e;if(a&&typeof a=="object"&&!Array.isArray(a)){const t=["overview","setup","function","progressions","coaching"],n={overview:"Overview",setup:"Setup",function:"How It Works",progressions:"Progressions",coaching:"Coaching Points"},s=t.filter(l=>a[l]&&a[l].trim()&&a[l].trim()!=="<br>").map(l=>`
                    <div class="share-section">
                        <h4>${n[l]}</h4>
                        <div class="share-section-content">${h(a[l])}</div>
                    </div>
                `).join("");if(s)return s}}catch{}return`<div class="share-section"><div class="share-section-content">${h(String(e))}</div></div>`}function u(e){document.getElementById("shareLoading").style.display="none",document.getElementById("shareError").style.display="",document.getElementById("shareErrorMsg").textContent=e}function r(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}y();
