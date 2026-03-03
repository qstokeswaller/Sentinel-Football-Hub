/**
 * Original Session Planner Logic
 * Extracted and adapted from claude_planner.html
 */

let blockCounter = 0, drillCounter = 0;
let currentSessionId = null;
const canvases = {};
let _pendingRestorePlayerIds = [];
window.canvases = canvases;

// Global hook for drill-builder to trigger autosave
window.triggerAutosave = () => { if (typeof autosaveState === 'function') autosaveState(); };

// ═══════════════════════════════════════════════════════════
//  BLOCK SYSTEM
// ═══════════════════════════════════════════════════════════
function addBlock(type, skipAutosave = false) {
  blockCounter++;
  if (type === 'drill') drillCounter++;
  const id = 'blk-' + blockCounter;
  const num = type === 'drill' ? drillCounter : null;
  const el = document.createElement('div');
  el.className = 'drill-block';
  el.id = id;
  el.innerHTML = buildBlockHTML(id, type, num);
  document.getElementById('blocksContainer').appendChild(el);
  initRTE(id);
  if (type === 'drill') initCanvas(id, canvases);

  // Add listeners for autosave
  el.querySelector('.block-title-input')?.addEventListener('input', () => autosaveState());
  const rte = document.getElementById('rte-' + id);
  if (rte) {
    rte.addEventListener('input', () => autosaveState());
    rte.addEventListener('blur', () => autosaveState());
  }

  if (!skipAutosave) {
    el.querySelector('.block-title-input').focus();
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    autosaveState();
  }
  return id;
}

function buildBlockHTML(id, type, num) {
  const isDrill = type === 'drill';
  const pillCls = isDrill ? 'drill' : 'section';
  const label = isDrill ? 'Drill' : 'Section';
  const titlePh = isDrill ? 'Drill name...' : 'Section title (e.g. Defending Phase, Warm Up...)';
  const descPh = isDrill
    ? 'Describe this drill — objectives, key points, organisation...'
    : 'Describe this section of the session...';

  return `
    <div class="drill-block-header">
      ${num ? `<span class="block-num">#${num}</span>` : ''}
      <span class="block-pill ${pillCls}">${label}</span>
      <input class="block-title-input" type="text" placeholder="${titlePh}" autocomplete="off">
      <div class="block-header-actions">
        ${isDrill ? `
          <button class="block-icon-btn" title="Export drill PNG" onclick="exportDrillPNG('${id}', event)"><i class="fas fa-image"></i></button>
          <button class="block-icon-btn" title="Export drill PDF" onclick="exportDrillPDF('${id}', event)"><i class="fas fa-file-pdf"></i></button>
          <button class="block-icon-btn save-solo" title="Save drill to library" onclick="saveDrillAlone('${id}', event)"><i class="fas fa-bookmark"></i></button>
        ` : ''}
        <button class="block-icon-btn danger" title="Remove" onclick="removeBlock('${id}')"><i class="fas fa-times"></i></button>
      </div>
    </div>

    <div class="block-desc-area">
      <div class="rte-toolbar" id="rte-tb-${id}">
        <button class="rte-btn" data-cmd="bold"               title="Bold"><b>B</b></button>
        <button class="rte-btn" data-cmd="italic"             title="Italic"><i>I</i></button>
        <button class="rte-btn" data-cmd="underline"          title="Underline"><u>U</u></button>
        <div class="rte-sep"></div>
        <button class="rte-btn" data-cmd="insertUnorderedList" title="Bullet list">• List</button>
        <button class="rte-btn" data-cmd="insertOrderedList"  title="Numbered list">1. List</button>
        <div class="rte-sep"></div>
        <button class="rte-btn" data-cmd="removeFormat"       title="Clear formatting"><i class="fas fa-remove-format" style="font-family:sans-serif;font-style:normal;font-size:10px;">✕fmt</i></button>
      </div>
      <div class="rte-content" id="rte-${id}"
           contenteditable="true" data-placeholder="${descPh}"></div>
    </div>

    ${isDrill ? `
    <div class="canvas-section">
      <button class="canvas-toggle-btn" id="ct-${id}" onclick="toggleCanvas('${id}')">
        <i class="fas fa-futbol"></i> Open Drill Builder
      </button>
      <div class="drill-canvas-wrap" id="dcw-${id}">
        <div class="pitch-bar" id="pb-${id}">
          <button class="pitch-btn active" onclick="setPT('${id}','full', canvases)"       data-pt="full">Full Pitch</button>
          <button class="pitch-btn"        onclick="setPT('${id}','half', canvases)"       data-pt="half">Half Pitch</button>
          <button class="pitch-btn"        onclick="setPT('${id}','third', canvases)"      data-pt="third">One Third</button>
          <button class="pitch-btn"        onclick="setPT('${id}','smallsided', canvases)" data-pt="smallsided">Small Sided</button>
          <button class="pitch-btn"        onclick="setPT('${id}','outline', canvases)"    data-pt="outline">Outline</button>
          <button class="pitch-btn"        onclick="setPT('${id}','halves', canvases)"     data-pt="halves">+ Halves</button>
          <button class="pitch-btn"        onclick="setPT('${id}','thirds', canvases)"     data-pt="thirds">+ Thirds</button>
          <button class="pitch-btn"        onclick="setPT('${id}','blank', canvases)"      data-pt="blank">Blank</button>
          <div style="flex:1;"></div>
          <button class="pitch-btn" id="btn-orient-${id}" onclick="toggleOrientation('${id}', canvases)" title="Switch Landscape/Portrait"><i class="fas fa-arrows-alt-h"></i> Landscape</button>
          <button class="pitch-btn" onclick="toggleFullscreen('${id}')" title="Enter Fullscreen"><i class="fas fa-expand"></i> Fullscreen</button>
        </div>
        <div class="canvas-el" id="ce-${id}">
          <canvas id="dc-${id}"></canvas>
          <button class="fullscreen-exit-btn" onclick="toggleFullscreen('${id}')" title="Exit Fullscreen">
            <i class="fas fa-compress"></i> Exit
          </button>
          <button class="fullscreen-tools-btn" onclick="toggleFullscreenTools('${id}')" title="Toggle Tools">
            <i class="fas fa-bars"></i>
          </button>
        </div>
        <div class="mini-toolbar">
          <div class="mini-tool-row">
            <span class="mini-row-label">Draw</span>
            <button class="mt-btn active" id="mt-${id}-pencil"      onclick="setMT('${id}','pencil', canvases); handleToolSelectionInFullscreen('${id}')">✏ Pencil</button>
            <button class="mt-btn"        id="mt-${id}-arrow"       onclick="setMT('${id}','arrow', canvases); handleToolSelectionInFullscreen('${id}')">→ Arrow</button>
            <button class="mt-btn"        id="mt-${id}-dashed"      onclick="setMT('${id}','dashed', canvases); handleToolSelectionInFullscreen('${id}')">⤳ Dashed Arrow</button>
            <button class="mt-btn"        id="mt-${id}-dashed-line" onclick="setMT('${id}','dashed-line', canvases); handleToolSelectionInFullscreen('${id}')">- - Dash Line</button>
            <button class="mt-btn"        id="mt-${id}-line"        onclick="setMT('${id}','line', canvases); handleToolSelectionInFullscreen('${id}')">/ Line</button>
            <button class="mt-btn"        id="mt-${id}-curved"      onclick="setMT('${id}','curved', canvases); handleToolSelectionInFullscreen('${id}')">↩ Curved</button>
            <button class="mt-btn"        id="mt-${id}-rect"        onclick="setMT('${id}','rect', canvases); handleToolSelectionInFullscreen('${id}')">▭ Rect</button>
            <button class="mt-btn"        id="mt-${id}-rect-fill"   onclick="setMT('${id}','rect-fill', canvases); handleToolSelectionInFullscreen('${id}')">▬ Rect Fill</button>
            <button class="mt-btn"        id="mt-${id}-circle"      onclick="setMT('${id}','circle', canvases); handleToolSelectionInFullscreen('${id}')">○ Circle</button>
            <button class="mt-btn"        id="mt-${id}-circle-fill" onclick="setMT('${id}','circle-fill', canvases); handleToolSelectionInFullscreen('${id}')">● Circle Fill</button>
            <button class="mt-btn"        id="mt-${id}-tri"         onclick="setMT('${id}','tri', canvases); handleToolSelectionInFullscreen('${id}')">△ Tri</button>
            <button class="mt-btn"        id="mt-${id}-tri-fill"    onclick="setMT('${id}','tri-fill', canvases); handleToolSelectionInFullscreen('${id}')">▲ Tri Fill</button>
            <button class="mt-btn"        id="mt-${id}-zone"        onclick="setMT('${id}','zone', canvases); handleToolSelectionInFullscreen('${id}')">⬚ Zone</button>
            <button class="mt-btn"        id="mt-${id}-eraser"      onclick="setMT('${id}','eraser', canvases); handleToolSelectionInFullscreen('${id}')">⌫ Eraser</button>
            <div class="mt-divider"></div>
            <select class="mt-select" onchange="setMW('${id}',parseInt(this.value), canvases)">
              <option value="2">Thin</option>
              <option value="4" selected>Medium</option>
              <option value="7">Thick</option>
              <option value="11">Bold</option>
            </select>
          </div>
          <div class="mini-tool-row">
            <span class="mini-row-label">Place</span>
            <button class="mt-btn" id="mt-${id}-move"       onclick="setMT('${id}','move', canvases); handleToolSelectionInFullscreen('${id}')">✥ Move</button>
            <div class="mt-divider"></div>
            <button class="mt-btn" id="mt-${id}-player"     onclick="setMT('${id}','player', canvases); handleToolSelectionInFullscreen('${id}')">● Player</button>
            <button class="mt-btn" id="mt-${id}-goalkeeper" onclick="setMT('${id}','goalkeeper', canvases); handleToolSelectionInFullscreen('${id}')">GK</button>
            <button class="mt-btn" id="mt-${id}-cone"       onclick="setMT('${id}','cone', canvases); handleToolSelectionInFullscreen('${id}')">▲ Cone</button>
            <button class="mt-btn" id="mt-${id}-ball"       onclick="setMT('${id}','ball', canvases); handleToolSelectionInFullscreen('${id}')">⚽ Ball</button>
            <button class="mt-btn" id="mt-${id}-goalpost"   onclick="setMT('${id}','goalpost', canvases); handleToolSelectionInFullscreen('${id}')">🥅 Goalpost</button>
            <button class="mt-btn" id="mt-${id}-flag"       onclick="setMT('${id}','flag', canvases); handleToolSelectionInFullscreen('${id}')">⚑ Flag</button>
            <button class="mt-btn" id="mt-${id}-number"     onclick="setMT('${id}','number', canvases); handleToolSelectionInFullscreen('${id}')"># Num</button>
          </div>
          <div class="mini-tool-row">
            <span class="mini-row-label">Team</span>
            <div class="mt-swatch active" data-color="#e53935" onclick="setMC('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#e53935" title="Red">👕</div>
            <div class="mt-swatch" data-color="#1e88e5" onclick="setMC('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#1e88e5" title="Blue">👕</div>
            <div class="mt-swatch" data-color="#43a047" onclick="setMC('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#43a047" title="Green">👕</div>
            <div class="mt-swatch" data-color="#fdd835" onclick="setMC('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#fdd835" title="Yellow">👕</div>
            <div class="mt-swatch" data-color="#f57c00" onclick="setMC('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#f57c00" title="Orange">👕</div>
            <div class="mt-swatch" data-color="#8e24aa" onclick="setMC('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#8e24aa" title="Purple">👕</div>
            <div class="mt-swatch" data-color="#ffffff" onclick="setMC('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#fff;border:1px solid #e2e8f0" title="White">👕</div>
            <div class="mt-swatch" data-color="#212121" onclick="setMC('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#212121" title="Black">👕</div>
            <div class="mt-swatch" data-color="#e91e63" onclick="setMC('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#e91e63" title="Pink">👕</div>
            <div class="mt-swatch" data-color="#ffeb3b" onclick="setMC('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#ffeb3b" title="GK Yellow">🧤</div>
            <div class="mt-divider"></div>
            <div style="display:flex;align-items:center;gap:5px;">
              <span style="font-size:10px;color:#a0aec0;font-weight:600;">Line:</span>
              <input type="color" value="#ffffff" oninput="setMDC('${id}',this.value, canvases); handleToolSelectionInFullscreen('${id}')"
                     style="width:24px;height:24px;border:1px solid #e2e8f0;border-radius:50%;cursor:pointer;padding:0;">
            </div>
          </div>
          <div class="mini-tool-row">
            <span class="mini-row-label">Actions</span>
            <button class="mt-action-btn undo"  onclick="mUndo('${id}', canvases)"><i class="fas fa-undo"></i> Undo</button>
            <button class="mt-action-btn clear" onclick="mClear('${id}', canvases)"><i class="fas fa-trash"></i> Clear</button>
            <div class="mt-divider"></div>
            <button class="mt-action-btn png"   onclick="exportDrillPNG('${id}')"><i class="fas fa-download"></i> PNG</button>
          </div>
        </div>
      </div>
    </div>
    ` : ''}
  `;
}

function removeBlock(id) {
  document.getElementById(id)?.remove();
  delete canvases[id];
}

function toggleCanvas(id) {
  const wrap = document.getElementById('dcw-' + id);
  const btn = document.getElementById('ct-' + id);
  const open = wrap.classList.toggle('visible');
  btn.classList.toggle('open', open);
  btn.innerHTML = open
    ? '<i class="fas fa-chevron-up"></i> Close Drill Builder'
    : '<i class="fas fa-futbol"></i> Open Drill Builder';
  if (open && canvases[id]) drawAll(id, canvases);
}

function toggleFullscreen(id) {
  const wrap = document.getElementById('dcw-' + id);
  if (!wrap) return;
  const isFullscreen = wrap.classList.toggle('is-fullscreen');
  if (isFullscreen) {
    document.body.style.overflow = 'hidden'; // Prevent background scrolling

    // Auto-portrait for small devices (under 768px)
    if (window.innerWidth < 768) {
      if (canvases[id]) {
        if (canvases[id].orientation !== 'portrait') {
          if (typeof toggleOrientation === 'function') toggleOrientation(id, canvases);
        } else {
          // Robustness: Ensure class is there if already portrait
          wrap.classList.add('is-portrait');
        }
      }
    } else if (canvases[id] && canvases[id].orientation === 'portrait') {
      // Ensure class is synced even on larger screens if portrait manually selected
      wrap.classList.add('is-portrait');
    }
  } else {
    document.body.style.overflow = '';
    wrap.classList.remove('show-fullscreen-tools'); // Reset tools menu state
  }
}
window.toggleFullscreen = toggleFullscreen;

function toggleFullscreenTools(id) {
  const wrap = document.getElementById('dcw-' + id);
  if (wrap) wrap.classList.toggle('show-fullscreen-tools');
}
window.toggleFullscreenTools = toggleFullscreenTools;

// Helper to auto-hide tools menu in fullscreen mode when a tool is selected
function handleToolSelectionInFullscreen(id) {
  const wrap = document.getElementById('dcw-' + id);
  if (wrap && wrap.classList.contains('is-fullscreen')) {
    wrap.classList.remove('show-fullscreen-tools');
  }
}
window.handleToolSelectionInFullscreen = handleToolSelectionInFullscreen;

// ═══════════════════════════════════════════════════════════
//  RICH TEXT
// ═══════════════════════════════════════════════════════════
function initRTE(id) {
  const tb = document.getElementById('rte-tb-' + id);
  const ed = document.getElementById('rte-' + id);
  if (!tb || !ed) return;
  tb.querySelectorAll('.rte-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      document.execCommand(btn.dataset.cmd, false, null);
      ed.focus();
      updateRTE(id);
    });
  });
  ed.addEventListener('keyup', () => updateRTE(id));
  ed.addEventListener('mouseup', () => updateRTE(id));
}
function updateRTE(id) {
  const tb = document.getElementById('rte-tb-' + id);
  if (!tb) return;
  tb.querySelectorAll('.rte-btn[data-cmd]').forEach(btn => {
    try { btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd)); } catch (e) { }
  });
}

// ═══════════════════════════════════════════════════════════
//  EXPORT / SAVE
// ═══════════════════════════════════════════════════════════
function getDrillTitle(id) { return document.querySelector(`#${id} .block-title-input`)?.value?.trim() || 'drill'; }

function exportDrillPNG(id, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const s = canvases[id]; if (!s) return;
  const title = getDrillTitle(id);
  const safeTitle = title.replace(/[^a-z0-9]/gi, '_');
  const a = document.createElement('a');
  a.download = `UP_Drill_${safeTitle}.png`;
  a.href = s.canvas.toDataURL('image/png');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.exportDrillPNG = exportDrillPNG;

function exportDrillPDF(id, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  if (!window.jspdf) { showToast('PDF library not loaded', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const s = canvases[id];
  const title = getDrillTitle(id);
  const descRaw = document.getElementById('rte-' + id)?.innerText || '';
  const desc = descRaw.replace(/&nbsp;/g, ' ');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = PW - (margin * 2);

  doc.setFillColor(74, 144, 217); doc.rect(0, 0, PW, 15, 'F');
  doc.setTextColor(255); doc.setFontSize(10); doc.text('UP PERFORMANCE HUB · DRILL', margin, 10);

  doc.setTextColor(26, 32, 44); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text(title, margin, 30);

  let y = 40;
  if (s) {
    const img = s.canvas.toDataURL('image/png');
    const cw = s.canvas.width || 800;
    const ch = s.canvas.height || 500;
    const imgH = (ch / cw) * contentW;
    doc.addImage(img, 'PNG', margin, y, contentW, imgH);
    y += imgH + 10;
  }

  doc.setFontSize(11); doc.setTextColor(45, 55, 72); doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(desc, contentW), margin, y);

  const safeTitle = title.replace(/[^a-z0-9]/gi, '_');
  const filename = `UP_Drill_${safeTitle}.pdf`;
  try {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename}`, 'success');
  } catch (err) {
    console.error('PDF Save failed:', err);
    showToast('Failed to save PDF', 'error');
  }
}
window.exportDrillPDF = exportDrillPDF;

async function saveDrillAlone(id, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const s = canvases[id];
  const title = getDrillTitle(id) || 'Untitled Drill';
  const desc = document.getElementById('rte-' + id)?.innerHTML || '';
  const thumb = s ? s.canvas.toDataURL('image/png') : null;

  // Use API
  try {
    const drill = {
      id: 'drill-' + Date.now(),
      sessionId: null, // Standalone
      title,
      description: desc,
      pitchType: s ? s.pitchType : 'full',
      drawingData: s ? { tokens: s.tokens, paths: s.paths } : { tokens: [], paths: [] },
      author: document.getElementById('sessionAuthor')?.value || '',
      team: document.getElementById('sessionTeam')?.value || '',
      image: thumb
    };

    const res = await fetch(`${window.API_BASE_URL}/drills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(drill)
    });

    if (res.ok) {
      showToast('Drill saved to library ✓', 'success');
    } else {
      console.error(await res.text());
      showToast('Failed to save drill', 'error');
    }
  } catch (e) {
    console.error(e);
    showToast('Error saving drill', 'error');
  }
}

async function saveSession() {
  const title = document.getElementById('sessionTitle')?.value?.trim();
  if (!title) { showToast('Please enter a session title', 'error'); return; }

  const id = currentSessionId || 'sess-' + Date.now();
  const date = document.getElementById('sessionDate')?.value || '';
  const venue = document.getElementById('sessionVenue')?.value || '';
  const duration = document.getElementById('sessionDuration')?.value || '';
  const playersCount = document.getElementById('sessionPlayers')?.value || '';
  const abilityLevel = document.getElementById('sessionLevel')?.value || '';
  const equipment = document.getElementById('sessionEquipment')?.value || '';
  const purpose = document.getElementById('sessionPurpose')?.value || '';
  const author = document.getElementById('sessionAuthor')?.value || '';
  const team = getSelectedSquadNames();
  const startTime = document.getElementById('sessionStartTime')?.value || '';

  // Collect Individual Player IDs
  const playerIds = Array.from(document.querySelectorAll('.player-cb:checked')).map(cb => cb.value);

  const drills = [];
  document.querySelectorAll('#blocksContainer .drill-block').forEach((el, index) => {
    const bid = el.id;
    const btype = el.querySelector('.block-pill')?.classList.contains('drill') ? 'drill' : 'section';
    if (btype === 'drill') {
      const btitle = el.querySelector('.block-title-input')?.value || '';
      const bdesc = document.getElementById('rte-' + bid)?.innerHTML || '';
      const s = canvases[bid];
      drills.push({
        id: bid.startsWith('block-') ? bid : 'drill-' + Date.now() + '-' + index,
        title: btitle,
        description: bdesc,
        pitchType: s ? s.pitchType : 'full',
        drawingData: s ? { tokens: s.tokens, paths: s.paths } : { tokens: [], paths: [] },
        image: s ? s.canvas.toDataURL('image/png') : null,
        category: 'Session Drill',
        orderIndex: index
      });
    }
  });

  const session = {
    id, title, date, startTime, venue, duration, playersCount, abilityLevel, equipment, purpose, author, team,
    notes: '',
    createdAt: new Date().toISOString(),
    image: drills.length > 0 ? drills[0].image : null,
    drills,
    playerIds
  };

  const method = currentSessionId ? 'PATCH' : 'POST';
  const url = currentSessionId
    ? `${window.API_BASE_URL}/sessions/${currentSessionId}`
    : `${window.API_BASE_URL}/sessions`;

  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });

    if (res.ok) {
      const result = await res.json();
      currentSessionId = result.id || id;
      showToast('Session & Drills saved to Library ✓', 'success');
      localStorage.removeItem('up_planner_autosave');
    } else {
      console.error(await res.text());
      showToast('Failed to save session', 'error');
    }
  } catch (e) {
    console.error(e);
    showToast('Error saving session', 'error');
  }
}

function exportSessionPDF() {
  const { jsPDF } = window.jspdf;
  const title = document.getElementById('sessionTitle')?.value?.trim() || 'Session';
  const date = document.getElementById('sessionDate')?.value || '';
  const venue = document.getElementById('sessionVenue')?.value || '';
  const duration = document.getElementById('sessionDuration')?.value || '';
  const players = document.getElementById('sessionPlayers')?.value || '';
  const level = document.getElementById('sessionLevel')?.value || '';
  const equipment = document.getElementById('sessionEquipment')?.value || '';
  const purpose = document.getElementById('sessionPurpose')?.value || '';
  const author = document.getElementById('sessionAuthor')?.value || '';
  const team = getSelectedSquadNames();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pw - (margin * 2);

  // Page 1: Session Header
  doc.setFillColor(74, 144, 217); doc.rect(0, 0, pw, 40, 'F');
  doc.setTextColor(255); doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), margin, 25);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('FOOTBALL SESSION PLAN · ' + (date || 'N/A'), margin, 33);

  doc.setTextColor(26, 32, 44);
  let y = 55;
  const drawMeta = (label, val, x) => {
    doc.setFontSize(8); doc.setTextColor(113, 128, 150);
    doc.text(label.toUpperCase(), x, y);
    doc.setFontSize(11); doc.setTextColor(45, 55, 72); doc.setFont('helvetica', 'bold');
    doc.text(val || '—', x, y + 5);
  };

  drawMeta('Author / Coach', author, margin);
  drawMeta('Team / Group', team, margin + 65);
  drawMeta('Venue', venue, margin + 130);
  y += 20;
  drawMeta('Duration', duration, margin);
  drawMeta('No. of Players', players, margin + 65);
  drawMeta('Ability Level', level, margin + 130);
  y += 25;

  doc.setDrawColor(226, 232, 240); doc.line(margin, y, pw - margin, y);
  y += 10;
  doc.setFontSize(10); doc.setTextColor(74, 144, 217); doc.text('SESSION OBJECTIVES', margin, y);
  y += 6;
  doc.setFontSize(12); doc.setTextColor(26, 32, 44); doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(purpose || 'No objectives specified.', contentW), margin, y);
  y += 20;
  doc.setFontSize(10); doc.setTextColor(74, 144, 217); doc.text('EQUIPMENT NEEDED', margin, y);
  y += 6;
  doc.setFontSize(12); doc.setTextColor(26, 32, 44);
  doc.text(doc.splitTextToSize(equipment || 'Standard equipment.', contentW), margin, y);

  // Drill Pages
  document.querySelectorAll('#blocksContainer .drill-block').forEach((el, idx) => {
    doc.addPage();
    const bid = el.id;
    const btitle = el.querySelector('.block-title-input')?.value || 'Drill ' + (idx + 1);
    const bdescRaw = document.getElementById('rte-' + bid)?.innerText || '';
    const bdesc = bdescRaw.replace(/&nbsp;/g, ' ');
    const s = canvases[bid];

    doc.setFillColor(74, 144, 217); doc.rect(0, 0, pw, 15, 'F');
    doc.setTextColor(255); doc.setFontSize(10); doc.text(title.toUpperCase() + ' · DRILL ' + (idx + 1), margin, 10);
    doc.setTextColor(26, 32, 44); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(btitle, margin, 30);

    let currentY = 40;
    if (s) {
      const img = s.canvas.toDataURL('image/png');
      const imgW = contentW;
      const cw = s.canvas.width || 800;
      const ch = s.canvas.height || 500;
      const imgH = imgW * (ch / cw);
      doc.addImage(img, 'PNG', margin, currentY, imgW, Math.min(imgH, 150));
      currentY += Math.min(imgH, 150) + 15;
    }

    doc.setFontSize(10); doc.setTextColor(74, 144, 217); doc.text('DESCRIPTION & COACHING POINTS', margin, currentY);
    currentY += 6;
    doc.setFontSize(11); doc.setTextColor(45, 55, 72); doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(bdesc, contentW), margin, currentY);
  });

  const safeTitle = title.replace(/[^a-z0-9]/gi, '_');
  const filename = `UP_Session_${safeTitle}.pdf`;
  try {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename}`, 'success');
  } catch (err) {
    console.error('PDF Save failed:', err);
    showToast('Failed to save PDF', 'error');
  }
}
window.exportSessionPDF = exportSessionPDF;

function newSession() {
  ['sessionTitle', 'sessionDate', 'sessionVenue', 'sessionDuration', 'sessionPlayers', 'sessionLevel', 'sessionEquipment', 'sessionPurpose', 'sessionAuthor', 'sessionStartTime']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('blocksContainer').innerHTML = '';
  Object.keys(canvases).forEach(k => delete canvases[k]);
  blockCounter = 0; drillCounter = 0;
  const checklist = document.getElementById('playerChecklist');
  if (checklist) checklist.innerHTML = '';
  const group = document.getElementById('playerSelectionGroup');
  if (group) group.style.display = 'none';
  showToast('New session started', '');
  addBlock('drill');
}

// ═══════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════
// Session listing removed - previously part of rogue 'XX' modal
// Session listing
async function listSessions() {
  const modal = document.getElementById('session-modal');
  const body = document.getElementById('session-list-body');
  if (!modal || !body) return;

  modal.classList.add('open');
  body.innerHTML = '<div class="session-list-empty"><i class="fas fa-circle-notch fa-spin"></i> Loading...</div>';

  try {
    const res = await fetch(`${window.API_BASE_URL}/sessions`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load');
    const sessions = await res.json();

    if (!sessions.length) {
      body.innerHTML = '<div class="session-list-empty">No saved sessions found.</div>';
      return;
    }

    body.innerHTML = sessions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).map(s => {
      const date = s.date ? new Date(s.date).toLocaleDateString() : 'No date';
      const count = (s.drills || []).length || 0;
      return `
        <div class="session-list-item" onclick="loadSession('${s.id}')">
          <div class="session-list-title">${s.title || 'Untitled Session'}</div>
          <div class="session-list-meta">
            <span><i class="fas fa-calendar-alt"></i> ${date}</span>
            <span><i class="fas fa-layer-group"></i> ${count} drills</span>
            ${s.author ? `<span><i class="fas fa-user"></i> ${s.author}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

  } catch (e) {
    console.error(e);
    body.innerHTML = '<div class="session-list-empty">Error loading sessions.</div>';
  }
}

function closeSessionModal() {
  document.getElementById('session-modal').classList.remove('open');
}

// ═══════════════════════════════════════════════════════════
//  TEMPLATE LOADING
// ═══════════════════════════════════════════════════════════
async function listTemplates() {
  const modal = document.getElementById('template-modal');
  const body = document.getElementById('template-list-body');
  if (!modal || !body) return;

  modal.classList.add('open');
  body.innerHTML = '<div class="session-list-empty"><i class="fas fa-circle-notch fa-spin"></i> Loading...</div>';

  try {
    const res = await fetch(`${window.API_BASE_URL}/templates`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load');
    const templates = await res.json();

    if (!templates.length) {
      body.innerHTML = '<div class="session-list-empty" style="padding:28px 20px;"><i class="fas fa-bookmark" style="font-size:1.6rem;color:#cbd5e0;display:block;margin-bottom:10px;"></i>No templates saved yet.<br><small style="color:#94a3b8;">Open a session in the Library and click "Save as Template".</small></div>';
      return;
    }

    body.innerHTML = templates.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map(s => {
      const date = s.date ? new Date(s.date).toLocaleDateString() : 'No date';
      const count = (s.drills || []).length || 0;
      return `
        <div class="session-list-item" onclick="loadTemplate('${s.id}')">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
            <span style="font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:20px;padding:1px 7px;"><i class="fas fa-bookmark" style="font-size:9px;"></i> Template</span>
          </div>
          <div class="session-list-title">${s.title || 'Untitled Template'}</div>
          <div class="session-list-meta">
            <span><i class="fas fa-calendar-alt"></i> ${date}</span>
            <span><i class="fas fa-layer-group"></i> ${count} drills</span>
            ${s.author ? `<span><i class="fas fa-user"></i> ${s.author}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

  } catch (e) {
    console.error(e);
    body.innerHTML = '<div class="session-list-empty">Error loading templates.</div>';
  }
}

function closeTemplateModal() {
  document.getElementById('template-modal').classList.remove('open');
}

async function loadTemplate(templateId) {
  closeTemplateModal();
  showToast('Loading template...', '');

  try {
    const res = await fetch(`${window.API_BASE_URL}/sessions/${templateId}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch template');
    const session = await res.json();

    // Pre-fill meta but clear date/id so this becomes a fresh session
    document.getElementById('sessionTitle').value = (session.title || '') + ' (copy)';
    document.getElementById('sessionDate').value = '';
    document.getElementById('sessionVenue').value = session.venue || '';
    document.getElementById('sessionDuration').value = session.duration || '';
    document.getElementById('sessionPlayers').value = session.playersCount || '';
    document.getElementById('sessionLevel').value = session.abilityLevel || '';
    document.getElementById('sessionEquipment').value = session.equipment || '';
    document.getElementById('sessionPurpose').value = session.purpose || '';
    document.getElementById('sessionAuthor').value = session.author || '';
    document.getElementById('sessionStartTime').value = '';

    // Fresh session — do not inherit the template's ID or player list
    currentSessionId = null;
    document.getElementById('playerChecklist').innerHTML = '';
    const tmplGroup = document.getElementById('playerSelectionGroup');
    if (tmplGroup) tmplGroup.style.display = 'none';

    // Load drill blocks
    const container = document.getElementById('blocksContainer');
    container.innerHTML = '';
    Object.keys(canvases).forEach(k => delete canvases[k]);
    blockCounter = 0;
    drillCounter = 0;

    const items = session.drills || [];
    if (items.length === 0) {
      addBlock('drill');
    } else {
      for (const item of items) {
        const type = item.type || 'drill';
        const id = addBlock(type, true);
        const el = document.getElementById(id);
        if (el) {
          el.querySelector('.block-title-input').value = item.title || '';
          const rte = document.getElementById('rte-' + id);
          if (rte) rte.innerHTML = item.description || '';
        }
        if (type === 'drill' && item.drawingData) {
          const s = canvases[id];
          if (s) {
            s.pitchType = item.pitchType || 'full';
            s.orientation = item.orientation || 'landscape';
            if (s.orientation === 'portrait') { s.width = 460; s.height = 860; }
            else { s.width = 860; s.height = 460; }
            setPT(id, s.pitchType, canvases);
            const btn = document.getElementById(`btn-orient-${id}`);
            if (btn) {
              if (s.orientation === 'portrait') { btn.classList.add('active'); btn.innerHTML = `<i class="fas fa-arrows-alt-v"></i> Portrait`; }
              else { btn.classList.remove('active'); btn.innerHTML = `<i class="fas fa-arrows-alt-h"></i> Landscape`; }
            }
            let data = item.drawingData;
            if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { } }
            s.tokens = Array.isArray(data) ? data : (data && data.tokens ? data.tokens : []);
            s.paths = (data && data.paths) ? data.paths : [];
            drawAll(id, canvases);
          }
        }
      }
    }

    autosaveState();
    showToast('Template loaded — save as a new session when ready', 'success');

  } catch (e) {
    console.error(e);
    showToast('Error loading template', 'error');
  }
}

window.listTemplates = listTemplates;
window.closeTemplateModal = closeTemplateModal;
window.loadTemplate = loadTemplate;

async function loadSession(id) {
  closeSessionModal();
  showToast('Loading session...', '');

  try {
    const res = await fetch(`${window.API_BASE_URL}/sessions/${id}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch session');
    const session = await res.json();

    // Populate Fields
    document.getElementById('sessionTitle').value = session.title || '';
    document.getElementById('sessionDate').value = session.date ? session.date.substring(0, 10) : '';
    document.getElementById('sessionVenue').value = session.venue || '';
    document.getElementById('sessionDuration').value = session.duration || '';
    document.getElementById('sessionPlayers').value = session.playersCount || '';
    document.getElementById('sessionLevel').value = session.abilityLevel || '';
    document.getElementById('sessionEquipment').value = session.equipment || '';
    document.getElementById('sessionPurpose').value = session.purpose || '';
    document.getElementById('sessionAuthor').value = session.author || '';
    document.getElementById('sessionStartTime').value = session.startTime || '';

    // Restore player selection from saved playerIds
    const loadChecklist = document.getElementById('playerChecklist');
    if (loadChecklist) loadChecklist.innerHTML = '';
    if (session.playerIds && session.playerIds.length > 0 &&
      window.addSquadPlayersToChecklist && typeof squadManager !== 'undefined' && squadManager.players) {
      const squadIds = new Set(
        session.playerIds
          .map(pid => { const pl = squadManager.players.find(p => p.id === pid); return pl ? pl.squadId : null; })
          .filter(Boolean)
      );
      squadIds.forEach(sqId => window.addSquadPlayersToChecklist(sqId, session.playerIds));
    }

    currentSessionId = session.id;

    // clear blocks
    const container = document.getElementById('blocksContainer');
    container.innerHTML = '';
    Object.keys(canvases).forEach(k => delete canvases[k]);
    blockCounter = 0;
    drillCounter = 0;

    // Load Items (drills/sections)
    const items = session.drills || [];

    if (items.length === 0) {
      addBlock('drill');
      showToast('Session loaded (empty)', 'success');
      return;
    }

    for (const item of items) {
      const type = item.type || 'drill'; // Support sections if added later
      const id = addBlock(type);

      // Populate data
      const el = document.getElementById(id);
      if (el) {
        el.querySelector('.block-title-input').value = item.title || '';
        const rte = document.getElementById('rte-' + id);
        if (rte) rte.innerHTML = item.description || '';
      }

      // Populate Canvas
      if (type === 'drill' && item.drawingData) {
        const s = canvases[id];
        if (s) {
          s.pitchType = item.pitchType || 'full';
          s.orientation = item.orientation || 'landscape';

          if (s.orientation === 'portrait') {
            s.width = 460; s.height = 860;
          } else {
            s.width = 860; s.height = 460;
          }

          const btn = document.getElementById(`btn-orient-${id}`);
          if (btn) {
            if (s.orientation === 'portrait') {
              btn.classList.add('active');
              btn.innerHTML = `<i class="fas fa-arrows-alt-v"></i> Portrait`;
            } else {
              btn.classList.remove('active');
              btn.innerHTML = `<i class="fas fa-arrows-alt-h"></i> Landscape`;
            }
          }

          setPT(id, s.pitchType, canvases);

          let data = item.drawingData;
          if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) { }
          }

          if (Array.isArray(data)) {
            s.tokens = data;
            s.paths = [];
          } else if (data && typeof data === 'object') {
            s.tokens = data.tokens || [];
            s.paths = data.paths || [];
          }

          drawAll(id, canvases);
        }
      }
    }

    showToast('Session loaded successfully', 'success');

  } catch (e) {
    console.error(e);
    showToast('Error loading session details', 'error');
  }
}

function getSelectedSquadNames() {
  if (typeof squadManager === 'undefined' || !squadManager.players) return '';
  const checkedIds = Array.from(document.querySelectorAll('.player-cb:checked')).map(cb => cb.value);
  if (checkedIds.length === 0) return '';

  const squadIds = new Set();
  checkedIds.forEach(pid => {
    const p = squadManager.getPlayer(pid);
    if (p && p.squadId) squadIds.add(p.squadId);
  });

  const names = Array.from(squadIds).map(sid => {
    const s = squadManager.getSquad(sid);
    return s ? s.name : null;
  }).filter(Boolean);

  return names.join(', ');
}

// ═══════════════════════════════════════════════════════════

function showToast(msg, type = '') {
  if (window.showGlobalToast) {
    window.showGlobalToast(msg, type || 'success');
  } else {
    const t = document.getElementById('planner-toast');
    if (!t) return;
    t.className = ''; t.className = type ? type : '';
    t.innerHTML = (type === 'success' ? '<i class="fas fa-check-circle"></i> ' : type === 'error' ? '<i class="fas fa-exclamation-circle"></i> ' : '') + msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }
}

// Autosave System
function autosaveState() {
  const meta = {
    title: document.getElementById('sessionTitle')?.value || '',
    date: document.getElementById('sessionDate')?.value || '',
    venue: document.getElementById('sessionVenue')?.value || '',
    duration: document.getElementById('sessionDuration')?.value || '',
    players: document.getElementById('sessionPlayers')?.value || '',
    level: document.getElementById('sessionLevel')?.value || '',
    equipment: document.getElementById('sessionEquipment')?.value || '',
    purpose: document.getElementById('sessionPurpose')?.value || '',
    author: document.getElementById('sessionAuthor')?.value || '',
    team: getSelectedSquadNames(),
    startTime: document.getElementById('sessionStartTime')?.value || '',
    playerIds: Array.from(document.querySelectorAll('.player-cb:checked')).map(cb => cb.value)
  };

  const blocks = [];
  document.querySelectorAll('#blocksContainer .drill-block').forEach(el => {
    const id = el.id;
    const isDrill = el.querySelector('.block-pill')?.classList.contains('drill');
    const s = canvases[id];
    blocks.push({
      id,
      type: isDrill ? 'drill' : 'section',
      title: el.querySelector('.block-title-input')?.value || '',
      description: document.getElementById('rte-' + id)?.innerHTML || '',
      pitchType: s ? s.pitchType : 'full',
      orientation: s ? s.orientation : 'landscape', // Save orientation
      drawingData: s ? { tokens: s.tokens, paths: s.paths, orientation: s.orientation } : null
    });
  });

  localStorage.setItem('up_planner_autosave', JSON.stringify({ meta, blocks, currentSessionId }));
}

function restoreAutosave() {
  const saved = localStorage.getItem('up_planner_autosave');
  if (!saved) return false;
  try {
    const { meta, blocks, currentSessionId: sid } = JSON.parse(saved);
    if (!blocks || blocks.length === 0) return false;

    // Restore Meta
    if (meta) {
      document.getElementById('sessionTitle').value = meta.title || '';
      document.getElementById('sessionDate').value = meta.date || '';
      document.getElementById('sessionVenue').value = meta.venue || '';
      document.getElementById('sessionDuration').value = meta.duration || '';
      document.getElementById('sessionPlayers').value = meta.players || '';
      document.getElementById('sessionLevel').value = meta.level || '';
      document.getElementById('sessionEquipment').value = meta.equipment || '';
      document.getElementById('sessionPurpose').value = meta.purpose || '';
      document.getElementById('sessionAuthor').value = meta.author || '';
      // team metadata is now derived from players
      document.getElementById('sessionStartTime').value = meta.startTime || '';
      _pendingRestorePlayerIds = meta.playerIds || [];
    }
    currentSessionId = sid;

    // Restore Blocks
    document.getElementById('blocksContainer').innerHTML = '';
    Object.keys(canvases).forEach(k => delete canvases[k]);
    blockCounter = 0; drillCounter = 0;

    blocks.forEach(b => {
      const id = addBlock(b.type, true);
      const el = document.getElementById(id);
      if (el) {
        el.querySelector('.block-title-input').value = b.title || '';
        const rte = document.getElementById('rte-' + id);
        if (rte) rte.innerHTML = b.description || '';
      }
      if (b.type === 'drill' && b.drawingData) {
        const s = canvases[id];
        if (s) {
          s.pitchType = b.pitchType || 'full';
          s.orientation = b.orientation || 'landscape'; // Restore
          // Trigger the canvas resize if needed?
          // The easiest way is to re-init or call setOrientation, but setOrientation toggles UI too.
          // Let's manually set props and let redraw handle it.
          if (s.orientation === 'portrait') {
            s.width = 460; s.height = 860;
          } else {
            s.width = 860; s.height = 460;
          }

          setPT(id, s.pitchType, canvases);
          // Wait, 'updatePitch' was in the original code I viewed? No, I see setPT.
          // Actually, setPT is called in HTML. 
          // Let's just ensure we set UI state for orientation button too.
          const btn = document.getElementById(`btn-orient-${id}`);
          if (btn) {
            if (s.orientation === 'portrait') { btn.classList.add('active'); btn.innerHTML = `<i class="fas fa-arrows-alt-v"></i> Portrait`; }
            else { btn.classList.remove('active'); btn.innerHTML = `<i class="fas fa-arrows-alt-h"></i> Landscape`; }
          }

          s.tokens = b.drawingData.tokens || [];
          s.paths = b.drawingData.paths || [];
          drawAll(id, canvases);
        }
      }
    });
    return true;
  } catch (e) {
    console.error('Autosave restore failed', e);
    return false;
  }
}

// Start with one drill OR restore
document.addEventListener('DOMContentLoaded', async () => {
  // ── Shared attendance count updater ──────────────────────
  function syncAttendanceTotal() {
    const checkedCount = document.querySelectorAll('#playerChecklist .player-cb:checked').length;
    const playersInput = document.getElementById('sessionPlayers');
    if (playersInput) playersInput.value = checkedCount;
  }

  // ── Add a single player row to the checklist ──────────────
  function addPlayerRow(p, checklist, preSelected) {
    // Avoid duplicates
    if (checklist.querySelector(`.player-cb[value="${CSS.escape(p.id)}"]`)) return;

    const div = document.createElement('div');
    div.style.cssText = 'margin-bottom:5px; display:flex; align-items:center; gap:8px;';
    div.dataset.playerId = p.id;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = p.id;
    cb.className = 'player-cb';
    if (preSelected.includes(p.id)) cb.checked = true;
    cb.addEventListener('change', () => { syncAttendanceTotal(); autosaveState(); });

    const lbl = document.createElement('label');
    lbl.textContent = p.name;
    lbl.style.cssText = 'font-size:0.9rem; cursor:pointer;';
    lbl.addEventListener('click', () => {
      cb.checked = !cb.checked;
      syncAttendanceTotal();
      autosaveState();
    });

    div.appendChild(cb);
    div.appendChild(lbl);
    checklist.appendChild(div);
  }

  // ── Populate checklist from a squad (clears first) ────────
  function populatePlayerChecklist(squadId, selectedIds = []) {
    const group = document.getElementById('playerSelectionGroup');
    const checklist = document.getElementById('playerChecklist');
    if (!group || !checklist) return;

    const squadPlayers = squadManager.players.filter(p => p.squadId === squadId);
    if (squadPlayers.length === 0) { group.style.display = 'none'; return; }

    group.style.display = 'block';
    checklist.innerHTML = '';
    squadPlayers.forEach(p => addPlayerRow(p, checklist, selectedIds));
    if (selectedIds.length > 0) syncAttendanceTotal();
  }
  window.populatePlayerChecklist = populatePlayerChecklist;

  // ── Add players from a squad WITHOUT clearing existing ────
  function addSquadPlayersToChecklist(squadId, selectedIds = []) {
    const group = document.getElementById('playerSelectionGroup');
    const checklist = document.getElementById('playerChecklist');
    if (!group || !checklist) return;

    const squadPlayers = squadManager.players.filter(p => p.squadId === squadId);
    if (squadPlayers.length === 0) return;

    group.style.display = 'block';
    squadPlayers.forEach(p => addPlayerRow(p, checklist, selectedIds));
    syncAttendanceTotal();
  }

  // ── Populate Squads ───────────────────────────────────────
  if (typeof squadManager !== 'undefined') {
    await squadManager.init();

    // Show the player section whenever squads are available
    if (squadManager.getSquads().length > 0) {
      const group = document.getElementById('playerSelectionGroup');
      if (group) group.style.display = 'block';
    }

    const browseSelect = document.getElementById('playerSquadBrowse');

    if (browseSelect) {
      squadManager.getSquads().forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        browseSelect.appendChild(opt);
      });

      browseSelect.addEventListener('change', () => {
        const squadId = browseSelect.value;
        if (!squadId) return;
        addSquadPlayersToChecklist(squadId);
        browseSelect.value = '';
        autosaveState();
      });
    }

    const clearBtn = document.getElementById('clearPlayersBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const checklist = document.getElementById('playerChecklist');
        if (checklist) checklist.innerHTML = '';
        const group = document.getElementById('playerSelectionGroup');
        if (group) group.style.display = 'none';
        syncAttendanceTotal();
        autosaveState();
      });
    }

    // Expose so loadSession/loadTemplate can use it after DOMContentLoaded
    window.addSquadPlayersToChecklist = addSquadPlayersToChecklist;
  }


  if (document.getElementById('blocksContainer')) {
    const container = document.getElementById('blocksContainer');
    const restored = restoreAutosave();
    if (!restored && container.children.length === 0) {
      addBlock('drill');
    }

    // Global listeners for metadata
    ['sessionTitle', 'sessionDate', 'sessionStartTime', 'sessionVenue', 'sessionDuration', 'sessionPlayers', 'sessionLevel', 'sessionEquipment', 'sessionPurpose', 'sessionAuthor']
      .forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => autosaveState());
      });

    // Initial checklist population — restore saved player selections
    if (_pendingRestorePlayerIds.length > 0 && typeof squadManager !== 'undefined' && squadManager.players) {
      const squadIds = new Set(
        _pendingRestorePlayerIds
          .map(pid => { const pl = squadManager.players.find(p => p.id === pid); return pl ? pl.squadId : null; })
          .filter(Boolean)
      );
      squadIds.forEach(sqId => addSquadPlayersToChecklist(sqId, _pendingRestorePlayerIds));
    }
    _pendingRestorePlayerIds = [];

  }
});
