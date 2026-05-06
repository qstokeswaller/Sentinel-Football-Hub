/**
 * Session Planner Logic — ES Module (Supabase)
 * Migrated from legacy fetch-based planner
 */
import '../css/planner.css';
import supabase from '../supabase.js';
import { uploadToR2 } from './r2-upload.js';
import squadManager from '../managers/squad-manager.js';
import { showToast } from '../toast.js';
import { getProfile } from '../auth.js';
import { initCanvas, setPT, drawAll, toggleOrientation, setTokenSize, setEquipColor } from './drill-builder.js';

// Drill category groups + sub-categories
export const DRILL_CATEGORIES = {
    'Technical': ['Passing', 'First Touch', 'Dribbling', 'Shooting', 'Crossing', 'Heading', 'Ball Mastery'],
    'Tactical': ['Attack', 'Defence', 'Transitions', 'Build-Up Play', 'Possession', 'Pressing', 'Counter-Attack', 'Set Pieces'],
    'Physical': ['Warm-Up', 'Cool Down', 'Fitness', 'Agility', 'Speed'],
    'Positional': ['Goalkeeper', 'Defending Shape', 'Midfield Rotations', 'Wing Play', 'Striker Movement'],
    'Game-Based': ['Small-Sided Games', 'Rondos', 'Match Simulation', 'Conditioned Games'],
};

// Flat list for dropdowns
export function buildCategoryOptions(selected) {
    let html = '<option value="">-- No Category --</option>';
    for (const [group, items] of Object.entries(DRILL_CATEGORIES)) {
        html += `<optgroup label="${group}">`;
        items.forEach(cat => {
            html += `<option value="${cat}" ${selected === cat ? 'selected' : ''}>${cat}</option>`;
        });
        html += '</optgroup>';
    }
    return html;
}

let blockCounter = 0, drillCounter = 0;
let currentSessionId = null;
let _clubId = null;
let _userId = null;
let _profileName = '';
const canvases = {};
const _blockAnimationIds = {}; // blockId -> animation UUID (for animated drill blocks)
const _savedDrillIds = {};  // blockId → DB drill UUID (tracks standalone saves)
window.canvases = canvases;

// ═══════════════════════════════════════════════════════════
//  PHASE SYSTEM — Warm Up / Main Session / Cool Down
// ═══════════════════════════════════════════════════════════
const DEFAULT_PHASES = ['Warm Up', 'Main Session', 'Cool Down'];
let _phases = [...DEFAULT_PHASES];   // array of phase names (editable)
let _activePhaseIdx = 0;             // which phase tab is selected

function renderPhaseTabBar() {
  const bar = document.getElementById('phaseTabBar');
  const panes = document.getElementById('phasePanes');
  if (!bar || !panes) return;

  // Count blocks per phase
  const counts = _phases.map((_, i) => {
    const pane = document.getElementById(`phase-pane-${i}`);
    return pane ? pane.querySelectorAll('.drill-block').length : 0;
  });

  bar.innerHTML = _phases.map((name, i) => `
    <div class="phase-tab${i === _activePhaseIdx ? ' active' : ''}" data-phase="${i}">
      <span class="phase-tab-label">${escapeAttr(name)}</span>
      <span class="phase-count">${counts[i]}</span>
      ${_phases.length > 1 ? `<button class="phase-remove" onclick="event.stopPropagation();removePhase(${i})" title="Remove phase"><i class="fas fa-times"></i></button>` : ''}
    </div>
  `).join('') + `<button class="phase-add-btn" onclick="addPhase()" title="Add phase"><i class="fas fa-plus"></i></button>`;

  // Attach click/dblclick — touch devices get instant switch, desktop keeps dblclick-to-rename
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  bar.querySelectorAll('.phase-tab').forEach(tab => {
    const idx = parseInt(tab.dataset.phase);
    if (isTouch) {
      // Touch: instant switch, long-press to rename
      tab.addEventListener('click', (e) => {
        if (e.target.closest('.phase-remove')) return;
        switchPhase(idx);
      });
      let longPress = null;
      tab.addEventListener('touchstart', (e) => {
        if (e.target.closest('.phase-remove')) return;
        longPress = setTimeout(() => {
          longPress = null;
          const label = tab.querySelector('.phase-tab-label');
          if (label) editPhaseName(idx, label);
        }, 600);
      }, { passive: true });
      tab.addEventListener('touchend', () => { if (longPress) { clearTimeout(longPress); longPress = null; } }, { passive: true });
      tab.addEventListener('touchmove', () => { if (longPress) { clearTimeout(longPress); longPress = null; } }, { passive: true });
    } else {
      // Desktop: 250ms delay to distinguish single click from dblclick-to-rename
      let clickTimer = null;
      tab.addEventListener('click', (e) => {
        if (e.target.closest('.phase-remove')) return;
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
        clickTimer = setTimeout(() => { clickTimer = null; switchPhase(idx); }, 250);
      });
      tab.addEventListener('dblclick', (e) => {
        if (e.target.closest('.phase-remove')) return;
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        const label = tab.querySelector('.phase-tab-label');
        if (label) editPhaseName(idx, label);
      });
    }
  });

  // Ensure panes exist for each phase
  _phases.forEach((name, i) => {
    let pane = document.getElementById(`phase-pane-${i}`);
    if (!pane) {
      pane = document.createElement('div');
      pane.id = `phase-pane-${i}`;
      pane.className = 'phase-pane';
      pane.innerHTML = `
        <div class="phase-blocks-container" id="phaseBlocks-${i}"></div>
        <div class="phase-add-bar">
          <div class="phase-add-actions">
            <button class="btn-add-drill" data-min-role="coach" onclick="addBlock('drill')">
              <i class="fas fa-plus-circle"></i> Add Drill Block
            </button>
            <button class="btn-add-section" data-min-role="coach" onclick="addBlock('section')">
              Add Section
            </button>
          </div>
        </div>`;
      panes.appendChild(pane);
    }
  });

  // Remove orphan panes
  panes.querySelectorAll('.phase-pane').forEach(pane => {
    const idx = parseInt(pane.id.replace('phase-pane-', ''));
    if (idx >= _phases.length) pane.remove();
  });

  // Show active, hide rest
  _phases.forEach((_, i) => {
    const pane = document.getElementById(`phase-pane-${i}`);
    if (pane) pane.classList.toggle('active', i === _activePhaseIdx);
  });
}

function switchPhase(idx) {
  if (idx === _activePhaseIdx) return; // already active — preserve DOM for dblclick rename
  _activePhaseIdx = idx;
  renderPhaseTabBar();
  autosaveState();
}
window.switchPhase = switchPhase;

function editPhaseName(idx, spanEl) {
  const current = _phases[idx];
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'phase-tab-label-edit';
  input.value = current;
  input.onclick = (e) => e.stopPropagation();

  const commit = () => {
    const trimmed = (input.value || '').trim();
    if (trimmed && trimmed !== _phases[idx]) {
      _phases[idx] = trimmed;
      autosaveState();
    }
    renderPhaseTabBar();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = current; input.blur(); }
  });

  spanEl.replaceWith(input);
  input.focus();
  input.select();
}
window.editPhaseName = editPhaseName;

function addPhase() {
  _phases.push(`Phase ${_phases.length + 1}`);
  _activePhaseIdx = _phases.length - 1;
  renderPhaseTabBar();
  addBlock('drill');
  autosaveState();
}
window.addPhase = addPhase;

function removePhase(idx) {
  if (_phases.length <= 1) return;
  // Remove blocks in this phase
  const pane = document.getElementById(`phase-pane-${idx}`);
  if (pane) {
    pane.querySelectorAll('.drill-block').forEach(el => {
      delete canvases[el.id];
      delete _blockVideos[el.id];
    });
    pane.remove();
  }
  _phases.splice(idx, 1);
  // Renumber remaining pane IDs
  _rebuildPaneIds();
  if (_activePhaseIdx >= _phases.length) _activePhaseIdx = _phases.length - 1;
  renderPhaseTabBar();
  autosaveState();
}
window.removePhase = removePhase;

function _rebuildPaneIds() {
  const panes = document.getElementById('phasePanes');
  if (!panes) return;
  const existing = panes.querySelectorAll('.phase-pane');
  existing.forEach((pane, i) => {
    pane.id = `phase-pane-${i}`;
    const blocksContainer = pane.querySelector('.phase-blocks-container');
    if (blocksContainer) blocksContainer.id = `phaseBlocks-${i}`;
  });
}

function escapeAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Global hook for drill-builder to trigger autosave
window.triggerAutosave = () => { if (typeof autosaveState === 'function') autosaveState(); };

// ═══════════════════════════════════════════════════════════
//  PLANNER TAB SWITCHING
// ═══════════════════════════════════════════════════════════
let _activePlannerTab = 'builder';

function switchPlannerTab(tab) {
  _activePlannerTab = tab;
  document.getElementById('tab-builder').style.display = tab === 'builder' ? '' : 'none';
  document.getElementById('tab-details').style.display = tab === 'details' ? '' : 'none';
  const animPane = document.getElementById('tab-animation');
  if (animPane) animPane.style.display = tab === 'animation' ? '' : 'none';
  document.getElementById('tab-btn-builder').classList.toggle('active', tab === 'builder');
  document.getElementById('tab-btn-details').classList.toggle('active', tab === 'details');
  document.getElementById('tab-btn-animation')?.classList.toggle('active', tab === 'animation');

  // Lazy-init animation builder when first switching to that tab
  if (tab === 'animation') {
    import('./animation-builder.js').then(mod => {
      mod.initAnimationBuilder();
      // Resize in case container was hidden when initialized
      setTimeout(() => mod.resizeAnimCanvas(), 50);
    });
  }
}
window.switchPlannerTab = switchPlannerTab;

// ═══════════════════════════════════════════════════════════
//  BLOCK SYSTEM
// ═══════════════════════════════════════════════════════════
function addBlock(type, skipAutosave = false, targetPhaseIdx = null) {
  blockCounter++;
  if (type === 'drill') drillCounter++;
  const id = 'blk-' + blockCounter;
  const num = type === 'drill' ? drillCounter : null;
  const el = document.createElement('div');
  el.className = 'drill-block';
  el.id = id;
  el.innerHTML = buildBlockHTML(id, type, num);
  const phaseIdx = targetPhaseIdx !== null ? targetPhaseIdx : _activePhaseIdx;
  const container = document.getElementById(`phaseBlocks-${phaseIdx}`) || document.getElementById('phasePanes');
  container.appendChild(el);
  if (type === 'drill') {
    initCanvas(id, canvases);
    initDrillSections(id);
  } else {
    initRTE(id);
  }

  // Add listeners for autosave
  el.querySelector('.block-title-input')?.addEventListener('input', () => autosaveState());
  const rte = document.getElementById('rte-' + id);
  if (rte) {
    rte.addEventListener('input', () => autosaveState());
    rte.addEventListener('blur', () => autosaveState());
  }
  // Autosave on drill section edits
  if (type === 'drill') {
    DRILL_SECTION_KEYS.forEach(key => {
      const sec = document.getElementById(`ds-${key}-${id}`);
      if (sec) {
        sec.addEventListener('input', () => autosaveState());
        sec.addEventListener('blur', () => autosaveState());
      }
    });
  }

  if (!skipAutosave) {
    el.querySelector('.block-title-input').focus();
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    renderPhaseTabBar();
    autosaveState();
  }
  return id;
}
window.addBlock = addBlock;

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
      ${isDrill ? `<span class="block-category-label">Category</span><select class="block-category-select" id="cat-${id}" title="Drill Category">${buildCategoryOptions('')}</select>` : ''}
      <div class="block-header-actions">
        <button class="block-icon-btn" title="Attach video" onclick="toggleVideoPanel('${id}')"><i class="fas fa-video"></i></button>
        ${isDrill ? `
          <button class="block-icon-btn" title="Load drill from library" onclick="openDrillPicker('${id}')"><i class="fas fa-folder-open"></i></button>
          <button class="block-icon-btn" title="Export drill PNG" onclick="exportDrillPNG('${id}', event)"><i class="fas fa-image"></i></button>
          <button class="block-icon-btn" title="Export drill PDF" onclick="exportDrillPDF('${id}', event)"><i class="fas fa-file-pdf"></i></button>
          <button class="block-icon-btn save-solo" title="Save drill to library" onclick="saveDrillAlone('${id}', event)"><i class="fas fa-bookmark"></i></button>
        ` : ''}
        <button class="block-icon-btn danger" title="Remove" onclick="removeBlock('${id}')"><i class="fas fa-times"></i></button>
      </div>
    </div>

    <!-- Video Attachment Panel (right below header for visibility) -->
    <div class="video-panel" id="vp-${id}" style="display:none;">
      <div class="video-panel-header">
        <span><i class="fas fa-video" style="color:var(--primary);margin-right:6px;"></i>Video Reference</span>
        <button class="block-icon-btn danger" style="padding:2px 6px;font-size:11px;" onclick="removeVideo('${id}')" title="Remove video"><i class="fas fa-trash-alt"></i></button>
      </div>
      <div class="video-input-row">
        <input type="text" class="video-url-input" id="vurl-${id}" placeholder="Paste a video link (YouTube, Vimeo, Drive, etc.)" oninput="previewVideo('${id}')">
        <span class="video-or-divider">or</span>
        <label class="video-upload-btn" for="vfile-${id}">
          <i class="fas fa-cloud-upload-alt"></i> Upload
          <input type="file" id="vfile-${id}" accept="video/*" style="display:none;" onchange="uploadVideoFile('${id}', this)">
        </label>
      </div>
      <div class="video-upload-progress" id="vup-${id}" style="display:none;">
        <div class="video-progress-bar"><div class="video-progress-fill" id="vpf-${id}"></div></div>
        <span class="video-progress-text" id="vpt-${id}">Uploading...</span>
      </div>
      <div class="video-preview" id="vprev-${id}"></div>
    </div>

    ${!isDrill ? `
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
    ` : ''}

    ${isDrill ? `
    <div class="drill-mode-toggle" id="dmt-${id}">
      <button class="dmt-btn active" data-mode="static" onclick="setDrillMode('${id}','static')">
        <i class="fas fa-pencil-ruler"></i> Static
      </button>
      <button class="dmt-btn" data-mode="animated" onclick="setDrillMode('${id}','animated')">
        <i class="fas fa-play-circle"></i> Animated
      </button>
    </div>

    <div class="anim-drill-preview" id="adp-${id}" style="display:none;">
      <div class="anim-drill-thumb" id="adt-${id}">
        <img id="adt-img-${id}" src="" alt="Animation preview" style="display:none;width:100%;border-radius:8px;">
        <div class="anim-drill-placeholder" id="adt-ph-${id}">
          <i class="fas fa-film" style="font-size:2rem;margin-bottom:8px;"></i>
          <span>No animation linked yet</span>
        </div>
      </div>
      <button class="btn-edit-animation" onclick="editDrillAnimation('${id}')">
        <i class="fas fa-edit"></i> Edit in Animation Builder
      </button>
    </div>

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
          <button class="pitch-btn"        onclick="setPT('${id}','threequarter', canvases)" data-pt="threequarter">Three Quarter</button>
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
            <button class="mt-btn active" id="mt-${id}-pencil" onclick="setMT('${id}','pencil', canvases); handleToolSelectionInFullscreen('${id}')">✏ Pencil</button>
            <div class="mt-dropdown">
              <button class="mt-btn mt-dropdown-toggle" id="mt-${id}-lines-grp">/ Lines ▾</button>
              <div class="mt-dropdown-menu">
                <button class="mt-btn" id="mt-${id}-line"    onclick="setMT('${id}','line', canvases); handleToolSelectionInFullscreen('${id}'); closeMTDropdowns(this)">/ Line</button>
                <button class="mt-btn" id="mt-${id}-arrow"   onclick="setMT('${id}','arrow', canvases); handleToolSelectionInFullscreen('${id}'); closeMTDropdowns(this)">→ Arrow</button>
                <button class="mt-btn" id="mt-${id}-biarrow" onclick="setMT('${id}','biarrow', canvases); handleToolSelectionInFullscreen('${id}'); closeMTDropdowns(this)">↔ Both</button>
              </div>
            </div>
            <div class="mt-dropdown">
              <button class="mt-btn mt-dropdown-toggle" id="mt-${id}-dashed-grp">⤳ Dashed ▾</button>
              <div class="mt-dropdown-menu">
                <button class="mt-btn" id="mt-${id}-dashed"      onclick="setMT('${id}','dashed', canvases); handleToolSelectionInFullscreen('${id}'); closeMTDropdowns(this)">⤳ Dashed Arrow</button>
                <button class="mt-btn" id="mt-${id}-dashed-line" onclick="setMT('${id}','dashed-line', canvases); handleToolSelectionInFullscreen('${id}'); closeMTDropdowns(this)">- - Dashed Line</button>
              </div>
            </div>
            <button class="mt-btn" id="mt-${id}-curved"  onclick="setMT('${id}','curved', canvases); handleToolSelectionInFullscreen('${id}')">↩ Curved</button>
            <button class="mt-btn" id="mt-${id}-textbox" onclick="setMT('${id}','textbox', canvases); handleToolSelectionInFullscreen('${id}')">T Text</button>
            <div class="mt-dropdown">
              <button class="mt-btn mt-dropdown-toggle" id="mt-${id}-shapes-grp">▭ Shapes ▾</button>
              <div class="mt-dropdown-menu">
                <button class="mt-btn" id="mt-${id}-rect"    onclick="selectShape('${id}','rect', canvases); handleToolSelectionInFullscreen('${id}'); closeMTDropdowns(this)">▭ Rect</button>
                <button class="mt-btn" id="mt-${id}-circle"  onclick="selectShape('${id}','circle', canvases); handleToolSelectionInFullscreen('${id}'); closeMTDropdowns(this)">○ Circle</button>
                <button class="mt-btn" id="mt-${id}-tri"     onclick="selectShape('${id}','tri', canvases); handleToolSelectionInFullscreen('${id}'); closeMTDropdowns(this)">△ Tri</button>
                <button class="mt-btn" id="mt-${id}-polygon" onclick="selectShape('${id}','polygon', canvases); handleToolSelectionInFullscreen('${id}'); closeMTDropdowns(this)">⬠ Polygon</button>
              </div>
            </div>
            <button class="mt-btn mt-fill-toggle" id="mt-${id}-fill-toggle" onclick="toggleShapeFill('${id}', canvases); handleToolSelectionInFullscreen('${id}')" title="Toggle fill on shapes">◐ Fill</button>
            <button class="mt-btn" id="mt-${id}-eraser" onclick="setMT('${id}','eraser', canvases); handleToolSelectionInFullscreen('${id}')">⌫ Eraser</button>
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
            <button class="mt-btn" id="mt-${id}-cone"       onclick="setMT('${id}','cone', canvases); handleToolSelectionInFullscreen('${id}')">▲ Cone</button>
            <button class="mt-btn" id="mt-${id}-ball"       onclick="setMT('${id}','ball', canvases); handleToolSelectionInFullscreen('${id}')">⚽ Ball</button>
            <button class="mt-btn" id="mt-${id}-goalpost"   onclick="setMT('${id}','goalpost', canvases); handleToolSelectionInFullscreen('${id}')">🥅 Goalpost</button>
            <button class="mt-btn" id="mt-${id}-flag"       onclick="setMT('${id}','flag', canvases); handleToolSelectionInFullscreen('${id}')">⚑ Flag</button>
            <button class="mt-btn" id="mt-${id}-number"     onclick="setMT('${id}','number', canvases); handleToolSelectionInFullscreen('${id}')"># Num</button>
            <div class="mt-divider"></div>
            <button class="mt-btn" id="mt-${id}-ladder"    onclick="setMT('${id}','ladder', canvases); handleToolSelectionInFullscreen('${id}')">☷ Ladder</button>
            <button class="mt-btn" id="mt-${id}-hurdle"    onclick="setMT('${id}','hurdle', canvases); handleToolSelectionInFullscreen('${id}')">⊓ Hurdle</button>
            <button class="mt-btn" id="mt-${id}-mannequin" onclick="setMT('${id}','mannequin', canvases); handleToolSelectionInFullscreen('${id}')">🧍 Mannequin</button>
            <button class="mt-btn" id="mt-${id}-pole"      onclick="setMT('${id}','pole', canvases); handleToolSelectionInFullscreen('${id}')">| Pole</button>
            <button class="mt-btn" id="mt-${id}-minigoal"  onclick="setMT('${id}','minigoal', canvases); handleToolSelectionInFullscreen('${id}')">⊏⊐ Mini Goal</button>
            <button class="mt-btn" id="mt-${id}-ring"      onclick="setMT('${id}','ring', canvases); handleToolSelectionInFullscreen('${id}')">◎ Ring</button>
            <button class="mt-btn" id="mt-${id}-rebounder" onclick="setMT('${id}','rebounder', canvases); handleToolSelectionInFullscreen('${id}')">▥ Rebounder</button>
            <div class="mt-divider"></div>
            <select class="mt-select" onchange="setTokenSize('${id}', this.value, canvases)" title="Token Size">
              <option value="small">Small</option>
              <option value="medium" selected>Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
          <div class="mini-tool-row">
            <span class="mini-row-label">Colour</span>
            <div class="mt-equip-swatch active" data-color="#ff6d00" onclick="setEquipColor('${id}',this, canvases)" style="background:#ff6d00" title="Orange"></div>
            <div class="mt-equip-swatch" data-color="#fdd835" onclick="setEquipColor('${id}',this, canvases)" style="background:#fdd835" title="Yellow"></div>
            <div class="mt-equip-swatch" data-color="#e53935" onclick="setEquipColor('${id}',this, canvases)" style="background:#e53935" title="Red"></div>
            <div class="mt-equip-swatch" data-color="#1e88e5" onclick="setEquipColor('${id}',this, canvases)" style="background:#1e88e5" title="Blue"></div>
            <div class="mt-equip-swatch" data-color="#43a047" onclick="setEquipColor('${id}',this, canvases)" style="background:#43a047" title="Green"></div>
            <div class="mt-equip-swatch" data-color="#ffffff" onclick="setEquipColor('${id}',this, canvases)" style="background:#fff;border:1px solid #cbd5e0" title="White"></div>
            <div class="mt-equip-swatch" data-color="#ff9800" onclick="setEquipColor('${id}',this, canvases)" style="background:#ff9800" title="Amber"></div>
            <div class="mt-equip-swatch" data-color="#8e24aa" onclick="setEquipColor('${id}',this, canvases)" style="background:#8e24aa" title="Purple"></div>
            <input type="color" value="#ff6d00" oninput="this.parentElement.querySelector('.mt-equip-swatch.active')?.classList.remove('active'); canvases['${id}'].selColor=this.value; canvases['${id}'].drawColor=this.value"
                   style="width:20px;height:20px;border:1px solid #cbd5e0;border-radius:50%;cursor:pointer;padding:0;" title="Custom Colour">
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
            <div class="mt-divider"></div>
            <div class="mt-swatch" data-color="#ffeb3b" onclick="setGK('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#ffeb3b;font-size:9px;font-weight:700;" title="GK Yellow">GK</div>
            <div class="mt-swatch" data-color="#ff9800" onclick="setGK('${id}',this, canvases); handleToolSelectionInFullscreen('${id}')" style="background:#ff9800;font-size:9px;font-weight:700;" title="GK Orange">GK</div>
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

    <div class="drill-sections" id="ds-${id}">
      <div class="drill-sections-toolbar" id="ds-tb-${id}">
        <button class="rte-btn" data-cmd="bold"               title="Bold"><b>B</b></button>
        <button class="rte-btn" data-cmd="italic"             title="Italic"><i>I</i></button>
        <button class="rte-btn" data-cmd="underline"          title="Underline"><u>U</u></button>
        <div class="rte-sep"></div>
        <button class="rte-btn" data-cmd="insertUnorderedList" title="Bullet list">• List</button>
        <button class="rte-btn" data-cmd="insertOrderedList"  title="Numbered list">1. List</button>
        <div class="rte-sep"></div>
        <button class="rte-btn" data-cmd="removeFormat"       title="Clear formatting">✕fmt</button>
      </div>
      <div class="drill-section-box">
        <label class="drill-section-label">OVERVIEW</label>
        <div class="drill-section-content" id="ds-overview-${id}" contenteditable="true" data-placeholder="Brief overview of the drill..."></div>
      </div>
      <div class="drill-section-box">
        <label class="drill-section-label">SETUP</label>
        <div class="drill-section-content" id="ds-setup-${id}" contenteditable="true" data-placeholder="Pitch dimensions, player positions, equipment needed..."></div>
      </div>
      <div class="drill-section-box">
        <label class="drill-section-label">FUNCTION</label>
        <div class="drill-section-content" id="ds-function-${id}" contenteditable="true" data-placeholder="How the drill works, rules, play flow..."></div>
      </div>
      <div class="drill-section-box">
        <label class="drill-section-label">PROGRESSIONS / VARIATIONS</label>
        <div class="drill-section-content" id="ds-progressions-${id}" contenteditable="true" data-placeholder="Progressive challenges and variations..."></div>
      </div>
      <div class="drill-section-box">
        <label class="drill-section-label">COACHING POINTS</label>
        <div class="drill-section-content" id="ds-coaching-${id}" contenteditable="true" data-placeholder="Key coaching points — in possession, out of possession..."></div>
      </div>
    </div>
    ` : ''}

  `;
}

const DRILL_SECTION_KEYS = ['overview', 'setup', 'function', 'progressions', 'coaching'];

function getDrillSections(id) {
  const sections = {};
  DRILL_SECTION_KEYS.forEach(key => {
    const el = document.getElementById(`ds-${key}-${id}`);
    sections[key] = el ? el.innerHTML : '';
  });
  return JSON.stringify(sections);
}

function setDrillSections(id, description) {
  if (!description) return;
  let sections = null;
  // Try parsing as JSON sections format
  if (typeof description === 'string' && description.trim().startsWith('{')) {
    try { sections = JSON.parse(description); } catch (e) { /* not JSON */ }
  }
  if (sections && typeof sections === 'object' && (sections.overview !== undefined || sections.setup !== undefined)) {
    DRILL_SECTION_KEYS.forEach(key => {
      const el = document.getElementById(`ds-${key}-${id}`);
      if (el && sections[key]) el.innerHTML = sections[key];
    });
  } else {
    // Legacy: single description string — put it in overview
    const el = document.getElementById(`ds-overview-${id}`);
    if (el) el.innerHTML = description;
  }
}

// ═══════════════════════════════════════════════════════════
//  VIDEO ATTACHMENT
// ═══════════════════════════════════════════════════════════

// Per-block video URL store
const _blockVideos = {};

function toggleVideoPanel(id) {
  const panel = document.getElementById(`vp-${id}`);
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
  if (isHidden && _blockVideos[id]) {
    const input = document.getElementById(`vurl-${id}`);
    if (input && !input.value) { input.value = _blockVideos[id]; previewVideo(id); }
  }
}
window.toggleVideoPanel = toggleVideoPanel;

function getVideoUrl(id) {
  return _blockVideos[id] || document.getElementById(`vurl-${id}`)?.value?.trim() || '';
}

function setVideoUrl(id, url) {
  _blockVideos[id] = url || '';
  const input = document.getElementById(`vurl-${id}`);
  if (input) input.value = url || '';
  if (url) {
    const panel = document.getElementById(`vp-${id}`);
    if (panel) panel.style.display = 'block';
    previewVideo(id);
    // Show video icon as active
    const headerBtn = document.getElementById(id)?.querySelector('.block-header-actions .fa-video')?.parentElement;
    if (headerBtn) headerBtn.style.color = 'var(--primary)';
  }
}

function previewVideo(id) {
  const url = document.getElementById(`vurl-${id}`)?.value?.trim() || '';
  const container = document.getElementById(`vprev-${id}`);
  if (!container) return;

  _blockVideos[id] = url;
  autosaveState();

  if (!url) { container.innerHTML = ''; return; }

  // YouTube
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    container.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen class="video-embed"></iframe>`;
    return;
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    container.innerHTML = `<iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" frameborder="0" allowfullscreen class="video-embed"></iframe>`;
    return;
  }

  // Google Drive
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) {
    container.innerHTML = `<iframe src="https://drive.google.com/file/d/${driveMatch[1]}/preview" frameborder="0" allowfullscreen class="video-embed"></iframe>`;
    return;
  }

  // Direct video file URL (mp4, webm, mov, etc.)
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) {
    container.innerHTML = `<video controls class="video-embed" src="${escHtml(url)}"></video>`;
    return;
  }

  // Supabase storage URL (contains /storage/v1/object/)
  if (url.includes('/storage/v1/object/')) {
    container.innerHTML = `<video controls class="video-embed" src="${escHtml(url)}"></video>`;
    return;
  }

  // Fallback: show as link
  container.innerHTML = `<a href="${escHtml(url)}" target="_blank" class="video-link-fallback"><i class="fas fa-external-link-alt"></i> Open video link</a>`;
}
window.previewVideo = previewVideo;

async function uploadVideoFile(id, fileInput) {
  const file = fileInput.files[0];
  if (!file) return;

  // 100MB limit
  if (file.size > 100 * 1024 * 1024) {
    showToast('Video must be under 100MB', 'error');
    fileInput.value = '';
    return;
  }

  const progressWrap = document.getElementById(`vup-${id}`);
  const progressFill = document.getElementById(`vpf-${id}`);
  const progressText = document.getElementById(`vpt-${id}`);
  if (progressWrap) progressWrap.style.display = 'flex';
  if (progressFill) progressFill.style.width = '10%';
  if (progressText) progressText.textContent = `Uploading ${file.name}...`;

  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = `drills/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    if (progressFill) progressFill.style.width = '40%';

    const publicUrl = await uploadToR2(file, 'drill', null, (pct) => {
      if (progressFill) progressFill.style.width = (30 + pct * 0.5) + '%';
    });

    if (progressFill) progressFill.style.width = '80%';

    if (publicUrl) {
      const urlInput = document.getElementById(`vurl-${id}`);
      if (urlInput) urlInput.value = publicUrl;
      _blockVideos[id] = publicUrl;
      previewVideo(id);
      showToast('Video uploaded', 'success');
    }

    if (progressFill) progressFill.style.width = '100%';
    setTimeout(() => { if (progressWrap) progressWrap.style.display = 'none'; }, 1200);
  } catch (e) {
    console.error('Video upload failed:', e);
    showToast('Upload failed — check storage bucket exists', 'error');
    if (progressWrap) progressWrap.style.display = 'none';
  }
  fileInput.value = '';
}
window.uploadVideoFile = uploadVideoFile;

function removeVideo(id) {
  _blockVideos[id] = '';
  const urlInput = document.getElementById(`vurl-${id}`);
  if (urlInput) urlInput.value = '';
  const preview = document.getElementById(`vprev-${id}`);
  if (preview) preview.innerHTML = '';
  const panel = document.getElementById(`vp-${id}`);
  if (panel) panel.style.display = 'none';
  // Reset icon color
  const headerBtn = document.getElementById(id)?.querySelector('.block-header-actions .fa-video')?.parentElement;
  if (headerBtn) headerBtn.style.color = '';
  autosaveState();
}
window.removeVideo = removeVideo;

function escHtml(str) { return str ? str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }

function removeBlock(id) {
  document.getElementById(id)?.remove();
  delete canvases[id];
  delete _blockVideos[id];
  delete _blockAnimationIds[id];
  renderPhaseTabBar();
}
window.removeBlock = removeBlock;

function toggleCanvas(id) {
  const wrap = document.getElementById('dcw-' + id);
  const btn = document.getElementById('ct-' + id);
  const open = wrap.classList.toggle('visible');
  btn.classList.toggle('open', open);
  btn.innerHTML = open
    ? '<i class="fas fa-chevron-up"></i> Close Drill Builder'
    : '<i class="fas fa-futbol"></i> Open Drill Builder';
  if (open && canvases[id]) drawAll(id, canvases);
  // Clean up fullscreen if closing while in fullscreen
  if (!open && wrap.classList.contains('is-fullscreen')) {
    wrap.classList.remove('is-fullscreen');
    wrap.classList.remove('show-fullscreen-tools');
    document.body.style.overflow = '';
  }
}
window.toggleCanvas = toggleCanvas;

function setDrillMode(blockId, mode) {
  const canvasSection = document.querySelector(`#${blockId} .canvas-section`);
  const animPreview = document.getElementById(`adp-${blockId}`);
  const toggleBtns = document.querySelectorAll(`#dmt-${blockId} .dmt-btn`);

  toggleBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

  if (mode === 'static') {
    if (canvasSection) canvasSection.style.display = '';
    if (animPreview) animPreview.style.display = 'none';
    delete _blockAnimationIds[blockId];
  } else {
    if (canvasSection) canvasSection.style.display = 'none';
    if (animPreview) animPreview.style.display = '';
  }
  autosaveState();
}
window.setDrillMode = setDrillMode;

function editDrillAnimation(blockId) {
  const animId = _blockAnimationIds[blockId] || null;
  switchPlannerTab('animation');

  import('./animation-builder.js').then(mod => {
    mod.initAnimationBuilder();
    setTimeout(() => mod.resizeAnimCanvas(), 50);
    mod.editAnimationForDrill(animId, (savedAnimId, thumbnail) => {
      _blockAnimationIds[blockId] = savedAnimId;
      const img = document.getElementById(`adt-img-${blockId}`);
      const ph = document.getElementById(`adt-ph-${blockId}`);
      if (img && thumbnail) { img.src = thumbnail; img.style.display = ''; }
      if (ph) ph.style.display = thumbnail ? 'none' : '';
      switchPlannerTab('builder');
      autosaveState();
    });
  });
}
window.editDrillAnimation = editDrillAnimation;

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

// ── Dropdown tool menus ──
function closeMTDropdowns(clickedBtn) {
  // Close the dropdown that contains this button
  const menu = clickedBtn.closest('.mt-dropdown-menu');
  if (menu) menu.classList.remove('open');
  // Update the parent toggle to show it's active
  const dropdown = clickedBtn.closest('.mt-dropdown');
  if (dropdown) {
    const toggle = dropdown.querySelector('.mt-dropdown-toggle');
    if (toggle) toggle.classList.add('active');
  }
}
window.closeMTDropdowns = closeMTDropdowns;

// Toggle dropdown open/close on toggle button click
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.mt-dropdown-toggle');
  if (toggle) {
    e.stopPropagation();
    const menu = toggle.nextElementSibling;
    const wasOpen = menu.classList.contains('open');
    // Close all dropdowns first
    document.querySelectorAll('.mt-dropdown-menu.open').forEach(m => m.classList.remove('open'));
    if (!wasOpen) menu.classList.add('open');
    return;
  }
  // Close all dropdowns when clicking outside
  document.querySelectorAll('.mt-dropdown-menu.open').forEach(m => m.classList.remove('open'));
});

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

function initDrillSections(id) {
  const tb = document.getElementById('ds-tb-' + id);
  if (!tb) return;
  let activeEditor = null;
  const editors = DRILL_SECTION_KEYS.map(k => document.getElementById(`ds-${k}-${id}`)).filter(Boolean);
  editors.forEach(ed => {
    ed.addEventListener('focus', () => { activeEditor = ed; });
    ed.addEventListener('keyup', () => updateDrillSectionsToolbar(tb));
    ed.addEventListener('mouseup', () => updateDrillSectionsToolbar(tb));
  });
  tb.querySelectorAll('.rte-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      document.execCommand(btn.dataset.cmd, false, null);
      if (activeEditor) activeEditor.focus();
      updateDrillSectionsToolbar(tb);
    });
  });
}

function updateDrillSectionsToolbar(tb) {
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
  const clubPrefix = (window._profile?.clubs?.name || 'Export').replace(/[^a-z0-9]/gi, '_');
  a.download = `${clubPrefix}_Drill_${safeTitle}.png`;
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

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = PW - (margin * 2);

  // Header bar
  doc.setFillColor(0, 89, 79); doc.rect(0, 0, PW, 15, 'F');
  doc.setTextColor(255); doc.setFontSize(10); doc.text('TUKS FOOTBALL HUB \u00B7 DRILL', margin, 10);

  // Title
  doc.setTextColor(26, 32, 44); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text(title, margin, 30);

  // Separator line under title
  doc.setDrawColor(0, 89, 79); doc.setLineWidth(0.5);
  doc.line(margin, 33, PW - margin, 33);

  let y = 40;

  // Canvas image
  if (s) {
    const img = s.canvas.toDataURL('image/png');
    const cw = s.canvas.width || 800;
    const ch = s.canvas.height || 500;
    const imgH = (ch / cw) * contentW;
    doc.addImage(img, 'PNG', margin, y, contentW, imgH);
    y += imgH + 8;
  }

  // Sections
  const sectionLabels = {
    overview: 'OVERVIEW',
    setup: 'SETUP',
    function: 'FUNCTION',
    progressions: 'PROGRESSIONS / VARIATIONS',
    coaching: 'COACHING POINTS'
  };

  DRILL_SECTION_KEYS.forEach(key => {
    const el = document.getElementById(`ds-${key}-${id}`);
    const text = el ? el.innerText.replace(/&nbsp;/g, ' ').trim() : '';
    if (!text) return;

    // Check if we need a new page
    if (y > PH - 30) { doc.addPage(); y = 20; }

    // Section heading
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 32, 44);
    doc.text(sectionLabels[key], margin, y);
    y += 5;

    // Section body
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(45, 55, 72);
    const lines = doc.splitTextToSize(text, contentW);
    const lineH = 4.5;

    // Check if lines fit, else new page
    if (y + lines.length * lineH > PH - 15) {
      const fitCount = Math.floor((PH - 15 - y) / lineH);
      if (fitCount > 0) {
        doc.text(lines.slice(0, fitCount), margin, y);
        doc.addPage(); y = 20;
        doc.text(lines.slice(fitCount), margin, y);
        y += (lines.length - fitCount) * lineH + 6;
      } else {
        doc.addPage(); y = 20;
        doc.text(lines, margin, y);
        y += lines.length * lineH + 6;
      }
    } else {
      doc.text(lines, margin, y);
      y += lines.length * lineH + 6;
    }
  });

  const safeTitle = title.replace(/[^a-z0-9]/gi, '_');
  const clubPrefix = (window._profile?.clubs?.name || 'Export').replace(/[^a-z0-9]/gi, '_');
  const filename = `${clubPrefix}_Drill_${safeTitle}.pdf`;
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
  if (!_clubId) { showToast('No club context — please select a club or refresh', 'error'); return; }
  const s = canvases[id];
  const title = getDrillTitle(id) || 'Untitled Drill';
  const desc = getDrillSections(id);
  const thumb = s ? s.canvas.toDataURL('image/png') : null;

  const hasAnim = !!_blockAnimationIds[id];
  try {
    const drillRow = {
      session_id: null,
      title,
      description: desc,
      pitch_type: s ? s.pitchType : 'full',
      drawing_data: hasAnim ? JSON.stringify({ tokens: [], paths: [] }) : (s ? JSON.stringify({ tokens: s.tokens, paths: s.paths }) : JSON.stringify({ tokens: [], paths: [] })),
      author: document.getElementById('sessionAuthor')?.value || _profileName,
      team: document.getElementById('sessionTeam')?.value || '',
      image: hasAnim ? null : thumb,
      animation_id: _blockAnimationIds[id] || null,
      video_url: getVideoUrl(id) || null,
      category_tag: document.getElementById(`cat-${id}`)?.value || null,
      club_id: _clubId,
      created_by: _userId
    };

    const { data: savedDrill, error } = await supabase.from('drills').insert(drillRow).select('id').single();

    if (!error && savedDrill) {
      _savedDrillIds[id] = savedDrill.id;
      showToast('Drill saved to library', 'success');
    } else {
      console.error('saveDrillAlone error:', error);
      showToast('Failed to save drill: ' + (error?.message || 'unknown error'), 'error');
    }
  } catch (e) {
    console.error('saveDrillAlone exception:', e);
    showToast('Error saving drill', 'error');
  }
}
window.saveDrillAlone = saveDrillAlone;

async function saveSession() {
  const title = document.getElementById('sessionTitle')?.value?.trim();
  if (!title) { showToast('Please enter a session title', 'error'); return; }
  if (!_clubId) { showToast('No club context — please select a club or refresh', 'error'); return; }

  const date = document.getElementById('sessionDate')?.value || '';
  const venue = document.getElementById('sessionVenue')?.value || '';
  const duration = document.getElementById('sessionDuration')?.value || '';
  const abilityLevel = document.getElementById('sessionLevel')?.value || '';
  const equipment = document.getElementById('sessionEquipment')?.value || '';
  const purpose = document.getElementById('sessionPurpose')?.value || '';
  const author = document.getElementById('sessionAuthor')?.value || '';
  const startTime = document.getElementById('sessionStartTime')?.value || '';
  // Read player count + team from whichever mode is active
  const isMulti = document.getElementById('multiSquadMode')?.style.display !== 'none';
  const playersCount = isMulti
    ? (document.getElementById('sessionPlayersMulti')?.value || '')
    : (document.getElementById('sessionPlayers')?.value || '');
  const team = isMulti
    ? Array.from(document.querySelectorAll('#multiSquadChips .squad-chip.active')).map(c => c.textContent.trim().replace(/\s*\(\d+\)$/, '')).join(', ')
    : (document.getElementById('sessionTeam')?.value || '');

  // Collect ALL blocks (drills + sections) from all phases
  const drillsData = [];
  let globalIndex = 0;
  _phases.forEach((_, phaseIdx) => {
    const pane = document.getElementById(`phaseBlocks-${phaseIdx}`);
    if (!pane) { console.warn(`[saveSession] phaseBlocks-${phaseIdx} not found`); return; }
    pane.querySelectorAll('.drill-block').forEach(el => {
      const bid = el.id;
      const isDrill = el.querySelector('.block-pill')?.classList.contains('drill');
      const btitle = el.querySelector('.block-title-input')?.value || '';
      const s = canvases[bid];
      const hasAnim = !!_blockAnimationIds[bid];
      drillsData.push({
        _blockId: bid,
        title: btitle,
        description: isDrill ? getDrillSections(bid) : (document.getElementById('rte-' + bid)?.innerHTML || ''),
        pitch_type: s ? s.pitchType : 'full',
        orientation: s ? s.orientation : 'landscape',
        drawing_data: hasAnim ? JSON.stringify({ tokens: [], paths: [] }) : (s ? JSON.stringify({ tokens: s.tokens, paths: s.paths, orientation: s.orientation }) : JSON.stringify({ tokens: [], paths: [] })),
        image: hasAnim ? null : (s ? s.canvas.toDataURL('image/png') : null),
        animation_id: _blockAnimationIds[bid] || null,
        video_url: getVideoUrl(bid) || null,
        category: isDrill ? 'Session Drill' : 'Section',
        category_tag: isDrill ? (document.getElementById(`cat-${bid}`)?.value || null) : null,
        author: author || _profileName,
        order_index: globalIndex,
        phase: phaseIdx
      });
      globalIndex++;
    });
  });
  console.log(`[saveSession] Collected ${drillsData.length} blocks from ${_phases.length} phases, clubId=${_clubId}`);

  const sessionRow = {
    title,
    date: date || null,
    start_time: startTime || null,
    venue,
    duration,
    players_count: playersCount || null,
    ability_level: abilityLevel,
    equipment,
    purpose,
    author: author || _profileName,
    team,
    notes: '',
    image: drillsData.length > 0 ? drillsData[0].image : null,
    player_ids: getSelectedPlayerIds(),
    is_template: false,
    session_phases: _phases,
    club_id: _clubId,
    created_by: _userId
  };

  try {
    // Always create a new session
    const { data, error: insertError } = await supabase
      .from('sessions')
      .insert(sessionRow)
      .select()
      .single();

    if (insertError) {
      console.error('saveSession insert error:', insertError);
      showToast('Failed to save session: ' + (insertError.message || ''), 'error');
      return;
    }

    const sessionId = data.id;
    currentSessionId = sessionId;

    // Save drills — reuse existing drills (standalone-saved or animation-linked), insert truly new ones
    if (drillsData.length > 0) {
      // Check for drills already linked to animations in the DB (created by animation builder save)
      const animIds = drillsData.filter(d => d.animation_id).map(d => d.animation_id);
      let animDrillMap = {}; // animation_id → existing drill id
      if (animIds.length > 0) {
        const { data: existingAnimDrills } = await supabase.from('drills')
          .select('id, animation_id').in('animation_id', animIds);
        (existingAnimDrills || []).forEach(d => { animDrillMap[d.animation_id] = d.id; });
      }

      const toUpdate = [];
      const toInsert = [];
      for (const d of drillsData) {
        // Check: saved standalone via bookmark button?
        const savedId = _savedDrillIds[d._blockId];
        // Check: animation builder already created a drill for this animation?
        const animDrillId = d.animation_id ? animDrillMap[d.animation_id] : null;
        const existingId = savedId || animDrillId;

        if (existingId) {
          toUpdate.push({ id: existingId, ...d, session_id: sessionId, club_id: _clubId, created_by: _userId });
        } else {
          toInsert.push({ ...d, session_id: sessionId, club_id: _clubId, created_by: _userId });
        }
      }
      // Remove internal _blockId before sending to DB
      const cleanRow = (r) => { const { _blockId, ...rest } = r; return rest; };

      // Update existing standalone drills to link them to this session
      for (const row of toUpdate) {
        const { id: drillId, ...updates } = cleanRow(row);
        const { error } = await supabase.from('drills').update(updates).eq('id', drillId);
        if (error) console.warn('Failed to update drill', drillId, error);
      }

      // Insert new drills
      if (toInsert.length > 0) {
        const { error: drillError } = await supabase.from('drills').insert(toInsert.map(cleanRow));
        if (drillError) {
          console.error('saveSession drill insert error:', drillError);
          showToast('Session saved but drills failed: ' + (drillError.message || ''), 'error');
          return;
        }
      }
    }

    showToast(`Session saved (${drillsData.length} drill${drillsData.length !== 1 ? 's' : ''})`, 'success');
    localStorage.removeItem('up_planner_autosave');
  } catch (e) {
    console.error('saveSession exception:', e);
    showToast('Error saving session: ' + (e.message || ''), 'error');
  }
}
window.saveSession = saveSession;

// ═══════════════════════════════════════════════════════════
//  SESSION SHARING
// ═══════════════════════════════════════════════════════════
function generateShareToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  arr.forEach(v => { token += chars[v % chars.length]; });
  return token;
}

async function shareSession() {
  if (!currentSessionId) {
    showToast('Save the session first before sharing', 'error');
    return;
  }

  try {
    const { data: existing } = await supabase
      .from('sessions')
      .select('share_token')
      .eq('id', currentSessionId)
      .single();

    let token = existing?.share_token;
    if (!token) {
      token = generateShareToken();
      const { error } = await supabase
        .from('sessions')
        .update({ share_token: token })
        .eq('id', currentSessionId);
      if (error) throw error;
    }

    const url = `${window.location.origin}/src/pages/session-share.html?token=${token}`;
    await navigator.clipboard.writeText(url);
    showToast('Share link copied to clipboard!', 'success');
  } catch (e) {
    console.error('Share error:', e);
    showToast('Failed to generate share link', 'error');
  }
}
window.shareSession = shareSession;

function exportSessionPDF() {
  const { jsPDF } = window.jspdf;
  const title = document.getElementById('sessionTitle')?.value?.trim() || 'Session';
  const date = document.getElementById('sessionDate')?.value || '';
  const venue = document.getElementById('sessionVenue')?.value || '';
  const duration = document.getElementById('sessionDuration')?.value || '';
  const level = document.getElementById('sessionLevel')?.value || '';
  const equipment = document.getElementById('sessionEquipment')?.value || '';
  const purpose = document.getElementById('sessionPurpose')?.value || '';
  const author = document.getElementById('sessionAuthor')?.value || '';
  const isMulti = document.getElementById('multiSquadMode')?.style.display !== 'none';
  const players = isMulti
    ? (document.getElementById('sessionPlayersMulti')?.value || '')
    : (document.getElementById('sessionPlayers')?.value || '');
  const team = isMulti
    ? Array.from(document.querySelectorAll('#multiSquadChips .squad-chip.active')).map(c => c.textContent.trim().replace(/\s*\(\d+\)$/, '')).join(', ')
    : (document.getElementById('sessionTeam')?.value || '');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pw - (margin * 2);

  // Page 1: Session Header
  doc.setFillColor(0, 89, 79); doc.rect(0, 0, pw, 40, 'F');
  doc.setTextColor(255); doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), margin, 25);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('TUKS FOOTBALL HUB \u00B7 SESSION PLAN \u00B7 ' + (date || 'N/A'), margin, 33);

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
  doc.setFontSize(10); doc.setTextColor(0, 89, 79); doc.text('SESSION OBJECTIVES', margin, y);
  y += 6;
  doc.setFontSize(12); doc.setTextColor(26, 32, 44); doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(purpose || 'No objectives specified.', contentW), margin, y);
  y += 20;
  doc.setFontSize(10); doc.setTextColor(0, 89, 79); doc.text('EQUIPMENT NEEDED', margin, y);
  y += 6;
  doc.setFontSize(12); doc.setTextColor(26, 32, 44);
  doc.text(doc.splitTextToSize(equipment || 'Standard equipment.', contentW), margin, y);

  // Drill Pages
  const pH = doc.internal.pageSize.getHeight();
  const sectionLabelsSession = {
    overview: 'OVERVIEW',
    setup: 'SETUP',
    function: 'FUNCTION',
    progressions: 'PROGRESSIONS / VARIATIONS',
    coaching: 'COACHING POINTS'
  };

  document.querySelectorAll('#phasePanes .drill-block').forEach((el, idx) => {
    doc.addPage();
    const bid = el.id;
    const btitle = el.querySelector('.block-title-input')?.value || 'Drill ' + (idx + 1);
    const isDrill = el.querySelector('.block-pill')?.classList.contains('drill');
    const s = canvases[bid];

    doc.setFillColor(0, 89, 79); doc.rect(0, 0, pw, 15, 'F');
    doc.setTextColor(255); doc.setFontSize(10); doc.text(title.toUpperCase() + ' \u00B7 DRILL ' + (idx + 1), margin, 10);

    doc.setTextColor(26, 32, 44); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(btitle, margin, 30);
    doc.setDrawColor(0, 89, 79); doc.setLineWidth(0.5);
    doc.line(margin, 33, pw - margin, 33);

    let currentY = 40;
    const hasAnim = !!_blockAnimationIds[bid];
    if (hasAnim) {
      // Use animation thumbnail for PDF
      const animImg = document.getElementById(`adt-img-${bid}`);
      if (animImg && animImg.src && animImg.style.display !== 'none') {
        try {
          doc.addImage(animImg.src, 'PNG', margin, currentY, contentW, 100);
          currentY += 110;
        } catch (e) { /* thumbnail might not be loadable */ }
      }
      doc.setFontSize(9); doc.setTextColor(128, 90, 213);
      doc.text('[Animated Drill — view full animation via share link]', margin, currentY);
      currentY += 10;
    } else if (s) {
      const img = s.canvas.toDataURL('image/png');
      const imgW = contentW;
      const cw = s.canvas.width || 800;
      const ch = s.canvas.height || 500;
      const imgH = imgW * (ch / cw);
      doc.addImage(img, 'PNG', margin, currentY, imgW, Math.min(imgH, 150));
      currentY += Math.min(imgH, 150) + 10;
    }

    if (isDrill) {
      // Render structured sections
      DRILL_SECTION_KEYS.forEach(key => {
        const secEl = document.getElementById(`ds-${key}-${bid}`);
        const text = secEl ? secEl.innerText.replace(/&nbsp;/g, ' ').trim() : '';
        if (!text) return;

        if (currentY > pH - 30) { doc.addPage(); currentY = 20; }

        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 89, 79);
        doc.text(sectionLabelsSession[key], margin, currentY);
        currentY += 5;

        doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(45, 55, 72);
        const lines = doc.splitTextToSize(text, contentW);
        const lineH = 4.5;
        if (currentY + lines.length * lineH > pH - 15) {
          const fitCount = Math.floor((pH - 15 - currentY) / lineH);
          if (fitCount > 0) {
            doc.text(lines.slice(0, fitCount), margin, currentY);
            doc.addPage(); currentY = 20;
            doc.text(lines.slice(fitCount), margin, currentY);
            currentY += (lines.length - fitCount) * lineH + 6;
          } else {
            doc.addPage(); currentY = 20;
            doc.text(lines, margin, currentY);
            currentY += lines.length * lineH + 6;
          }
        } else {
          doc.text(lines, margin, currentY);
          currentY += lines.length * lineH + 6;
        }
      });
    } else {
      // Section type — single description
      const bdescRaw = document.getElementById('rte-' + bid)?.innerText || '';
      const bdesc = bdescRaw.replace(/&nbsp;/g, ' ');
      doc.setFontSize(11); doc.setTextColor(45, 55, 72); doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(bdesc, contentW), margin, currentY);
    }
  });

  const safeTitle = title.replace(/[^a-z0-9]/gi, '_');
  const clubPrefix = (window._profile?.clubs?.name || 'Export').replace(/[^a-z0-9]/gi, '_');
  const filename = `${clubPrefix}_Session_${safeTitle}.pdf`;
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
  ['sessionTitle', 'sessionDate', 'sessionVenue', 'sessionDuration', 'sessionPlayers', 'sessionPlayersMulti', 'sessionLevel', 'sessionEquipment', 'sessionPurpose', 'sessionAuthor', 'sessionTeam', 'sessionStartTime']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  // Reset phases
  _phases = [...DEFAULT_PHASES];
  _activePhaseIdx = 0;
  const panes = document.getElementById('phasePanes');
  if (panes) panes.innerHTML = '';
  Object.keys(canvases).forEach(k => delete canvases[k]);
  Object.keys(_savedDrillIds).forEach(k => delete _savedDrillIds[k]);
  Object.keys(_blockAnimationIds).forEach(k => delete _blockAnimationIds[k]);
  blockCounter = 0; drillCounter = 0;
  currentSessionId = null;
  // Clear player checklist
  const checklistSection = document.getElementById('playerChecklistSection');
  if (checklistSection) { checklistSection.style.display = 'none'; }
  const checklist = document.getElementById('playerChecklist');
  if (checklist) checklist.innerHTML = '';
  // Clear multi-squad state
  _multiDeselected.clear();
  document.querySelectorAll('#multiSquadChips .squad-chip.active').forEach(c => c.classList.remove('active'));
  const searchInput = document.getElementById('playerSearchInput');
  if (searchInput) searchInput.value = '';
  localStorage.removeItem('up_planner_autosave');
  renderPhaseTabBar();
  switchPlannerTab('builder');
  // Re-fill author from logged-in user
  const authorInput = document.getElementById('sessionAuthor');
  if (authorInput && window._profile?.full_name) authorInput.value = window._profile.full_name;
  showToast('New session started', 'info');
  addBlock('drill');
}
window.newSession = newSession;

// ═══════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════
let _activeSessionTab = 'sessions';

async function listSessions() {
  const modal = document.getElementById('session-modal');
  if (!modal) return;
  modal.classList.add('open');
  _activeSessionTab = 'sessions';
  _updateSessionTabUI();
  _loadSessionTab();
}
window.listSessions = listSessions;

function switchSessionTab(tab) {
  _activeSessionTab = tab;
  _updateSessionTabUI();
  _loadSessionTab();
}
window.switchSessionTab = switchSessionTab;

function _updateSessionTabUI() {
  const tabSessions = document.getElementById('tabSessions');
  const tabTemplates = document.getElementById('tabTemplates');
  if (tabSessions) {
    tabSessions.style.borderBottomColor = _activeSessionTab === 'sessions' ? 'var(--accent,#c8902e)' : 'transparent';
    tabSessions.style.color = _activeSessionTab === 'sessions' ? 'var(--accent,#c8902e)' : 'var(--text-muted,#6b7280)';
  }
  if (tabTemplates) {
    tabTemplates.style.borderBottomColor = _activeSessionTab === 'templates' ? 'var(--accent,#c8902e)' : 'transparent';
    tabTemplates.style.color = _activeSessionTab === 'templates' ? 'var(--accent,#c8902e)' : 'var(--text-muted,#6b7280)';
  }
}

async function _loadSessionTab() {
  const body = document.getElementById('session-list-body');
  if (!body) return;
  body.innerHTML = '<div class="session-list-empty"><i class="fas fa-circle-notch fa-spin"></i> Loading...</div>';

  const isTemplates = _activeSessionTab === 'templates';

  try {
    let query = supabase
      .from('sessions')
      .select('id, title, date, team, author, image, created_at')
      .order('created_at', { ascending: false });

    if (_clubId) query = query.eq('club_id', _clubId);

    if (isTemplates) {
      query = query.eq('is_template', true);
    } else {
      query = query.or('is_template.is.null,is_template.eq.false');
    }

    const { data: items, error } = await query;
    if (error) throw error;

    if (!items || !items.length) {
      body.innerHTML = `<div class="session-list-empty">No ${isTemplates ? 'templates' : 'saved sessions'} found.</div>`;
      return;
    }

    body.innerHTML = items.map(s => {
      const date = s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date';
      const onclick = isTemplates ? `loadTemplate('${s.id}')` : `loadSession('${s.id}')`;
      return `
      <div class="session-list-item" onclick="${onclick}">
        <div class="session-list-title">${s.title || 'Untitled Session'}</div>
        <div class="session-list-meta">
          <span><i class="fas fa-calendar-alt"></i> ${date}</span>
          ${s.author ? `<span><i class="fas fa-user"></i> ${s.author}</span>` : ''}
        </div>
        ${isTemplates ? '<span style="background:rgba(0,196,154,0.15);color:#00594f;font-size:0.7rem;padding:2px 8px;border-radius:12px;font-weight:600;">TEMPLATE</span>' : ''}
      </div>
    `;
    }).join('');

  } catch (e) {
    console.error(e);
    body.innerHTML = `<div class="session-list-empty">Error loading ${isTemplates ? 'templates' : 'sessions'}.</div>`;
  }
}


function closeSessionModal() {
  document.getElementById('session-modal').classList.remove('open');
}
window.closeSessionModal = closeSessionModal;

async function loadSession(id) {
  closeSessionModal();
  showToast('Loading session...', 'info');

  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select('*, drills(*)')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Populate Fields (snake_case from DB → camelCase form fields)
    document.getElementById('sessionTitle').value = session.title || '';
    document.getElementById('sessionDate').value = session.date ? session.date.substring(0, 10) : '';
    document.getElementById('sessionVenue').value = session.venue || '';
    document.getElementById('sessionDuration').value = session.duration || '';
    document.getElementById('sessionPlayers').value = session.players_count || '';
    document.getElementById('sessionLevel').value = session.ability_level || '';
    document.getElementById('sessionEquipment').value = session.equipment || '';
    document.getElementById('sessionPurpose').value = session.purpose || '';
    document.getElementById('sessionAuthor').value = session.author || '';
    document.getElementById('sessionStartTime').value = session.start_time || '';

    const isMulti = document.getElementById('multiSquadMode')?.style.display !== 'none';
    const savedPlayerIds = Array.isArray(session.player_ids) ? session.player_ids : [];

    if (isMulti) {
      // Restore multi-squad: activate chips matching the saved team names
      const savedTeams = (session.team || '').split(',').map(t => t.trim()).filter(Boolean);
      document.querySelectorAll('#multiSquadChips .squad-chip').forEach(chip => {
        const chipName = chip.textContent.trim().replace(/\s*\(\d+\)$/, '');
        if (savedTeams.includes(chipName)) chip.classList.add('active');
      });
      // Mark deselected = all players from active squads MINUS the saved player IDs
      _multiDeselected.clear();
      if (savedPlayerIds.length > 0) {
        const activeChips = document.querySelectorAll('#multiSquadChips .squad-chip.active');
        const activeSquadIds = Array.from(activeChips).map(c => c.dataset.squadId);
        const savedSet = new Set(savedPlayerIds);
        for (const sid of activeSquadIds) {
          const players = squadManager.getPlayers({ squadId: sid });
          players.forEach(p => { if (!savedSet.has(p.id)) _multiDeselected.add(p.id); });
        }
      }
      renderMultiSquadChecklist();
    } else {
      document.getElementById('sessionTeam').value = session.team || '';
      const teamSelect = document.getElementById('sessionTeam');
      const selectedOpt = teamSelect?.options[teamSelect.selectedIndex];
      const squadId = selectedOpt?.dataset?.id;
      if (squadId) {
        renderPlayerChecklist(squadId, savedPlayerIds.length > 0 ? savedPlayerIds : null);
      }
    }

    // Always save as NEW session when editing a loaded one
    currentSessionId = null;

    // Restore phases
    let loadedPhases = DEFAULT_PHASES;
    if (session.session_phases) {
      try {
        const parsed = typeof session.session_phases === 'string' ? JSON.parse(session.session_phases) : session.session_phases;
        if (Array.isArray(parsed) && parsed.length > 0) loadedPhases = parsed;
      } catch (e) { /* use defaults */ }
    }
    _phases = loadedPhases;
    _activePhaseIdx = 0;

    // clear all phase panes
    const panes = document.getElementById('phasePanes');
    if (panes) panes.innerHTML = '';
    Object.keys(canvases).forEach(k => delete canvases[k]);
    Object.keys(_blockAnimationIds).forEach(k => delete _blockAnimationIds[k]);
    blockCounter = 0;
    drillCounter = 0;

    // Build phase panes first
    renderPhaseTabBar();

    // Load Items (drills) — sort by order_index
    const items = (session.drills || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    if (items.length === 0) {
      _activePhaseIdx = 0;
      renderPhaseTabBar();
      addBlock('drill');
      showToast('Session loaded (empty)', 'success');
      return;
    }

    for (const item of items) {
      const type = item.type || 'drill';
      const phaseIdx = typeof item.phase === 'number' ? item.phase : 0;
      const safePhaseIdx = phaseIdx < _phases.length ? phaseIdx : 0;
      const blockId = addBlock(type, true, safePhaseIdx);

      // Populate data
      const el = document.getElementById(blockId);
      if (el) {
        el.querySelector('.block-title-input').value = item.title || '';
        const catSel = document.getElementById(`cat-${blockId}`);
        if (catSel && item.category_tag) catSel.value = item.category_tag;
        if (type === 'drill') {
          setDrillSections(blockId, item.description || '');
        } else {
          const rte = document.getElementById('rte-' + blockId);
          if (rte) rte.innerHTML = item.description || '';
        }
      }

      // Populate Canvas
      if (type === 'drill' && item.drawing_data) {
        const s = canvases[blockId];
        if (s) {
          let drillData = item.drawing_data;
          if (typeof drillData === 'string') {
            try { drillData = JSON.parse(drillData); } catch (e) { drillData = {}; }
          }
          s.pitchType = item.pitch_type || 'full';
          s.orientation = item.orientation || drillData.orientation || 'landscape';

          const btn = document.getElementById(`btn-orient-${blockId}`);
          if (btn) {
            if (s.orientation === 'portrait') {
              btn.classList.add('active');
              btn.innerHTML = `<i class="fas fa-arrows-alt-v"></i> Portrait`;
            } else {
              btn.classList.remove('active');
              btn.innerHTML = `<i class="fas fa-arrows-alt-h"></i> Landscape`;
            }
          }

          setPT(blockId, s.pitchType, canvases);

          if (Array.isArray(drillData)) {
            s.tokens = drillData;
            s.paths = [];
          } else if (drillData && typeof drillData === 'object') {
            s.tokens = drillData.tokens || [];
            s.paths = drillData.paths || [];
          }

          drawAll(blockId, canvases);
        }
      }

      // Restore animation link
      if (item.animation_id) {
        _blockAnimationIds[blockId] = item.animation_id;
        setDrillMode(blockId, 'animated');
        // Fetch thumbnail from animation
        supabase.from('animations').select('thumbnail').eq('id', item.animation_id).single()
          .then(({ data }) => {
            if (data?.thumbnail) {
              const img = document.getElementById(`adt-img-${blockId}`);
              const ph = document.getElementById(`adt-ph-${blockId}`);
              if (img) { img.src = data.thumbnail; img.style.display = ''; }
              if (ph) ph.style.display = 'none';
            }
          });
      }

      // Restore video
      if (item.video_url) {
        setVideoUrl(blockId, item.video_url);
      }
    }

    _activePhaseIdx = 0;
    renderPhaseTabBar();
    showToast('Session loaded successfully', 'success');
    switchPlannerTab('details');

  } catch (e) {
    console.error(e);
    showToast('Error loading session details', 'error');
  }
}
window.loadSession = loadSession;

// ═══════════════════════════════════════════════════════════
//  AUTOSAVE SYSTEM
// ═══════════════════════════════════════════════════════════
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
    team: document.getElementById('sessionTeam')?.value || '',
    startTime: document.getElementById('sessionStartTime')?.value || '',
    activeSquadIds: Array.from(document.querySelectorAll('#multiSquadChips .squad-chip.active')).map(c => c.dataset.squadId),
    multiDeselected: Array.from(_multiDeselected),
    playerSearch: document.getElementById('playerSearchInput')?.value || ''
  };

  const blocks = [];
  _phases.forEach((_, phaseIdx) => {
    const pane = document.getElementById(`phaseBlocks-${phaseIdx}`);
    if (!pane) return;
    pane.querySelectorAll('.drill-block').forEach(el => {
      const id = el.id;
      const isDrill = el.querySelector('.block-pill')?.classList.contains('drill');
      const s = canvases[id];
      blocks.push({
        id,
        type: isDrill ? 'drill' : 'section',
        title: el.querySelector('.block-title-input')?.value || '',
        description: isDrill ? getDrillSections(id) : (document.getElementById('rte-' + id)?.innerHTML || ''),
        pitchType: s ? s.pitchType : 'full',
        orientation: s ? s.orientation : 'landscape',
        drawingData: s ? { tokens: s.tokens, paths: s.paths, orientation: s.orientation } : null,
        videoUrl: getVideoUrl(id) || '',
        animationId: _blockAnimationIds[id] || null,
        phase: phaseIdx
      });
    });
  });

  const playerIds = getSelectedPlayerIds();
  localStorage.setItem('up_planner_autosave', JSON.stringify({ meta, blocks, currentSessionId, playerIds, activeTab: _activePlannerTab, phases: _phases, activePhaseIdx: _activePhaseIdx }));
}

function restoreAutosave() {
  const saved = localStorage.getItem('up_planner_autosave');
  if (!saved) return false;
  try {
    const { meta, blocks, currentSessionId: sid, playerIds, activeTab, phases, activePhaseIdx } = JSON.parse(saved);
    if (!blocks || blocks.length === 0) return false;
    if (activeTab) switchPlannerTab(activeTab);

    // Restore phases
    if (Array.isArray(phases) && phases.length > 0) {
      _phases = phases;
    } else {
      _phases = [...DEFAULT_PHASES];
    }
    _activePhaseIdx = typeof activePhaseIdx === 'number' ? activePhaseIdx : 0;

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
      document.getElementById('sessionStartTime').value = meta.startTime || '';

      const isMulti = document.getElementById('multiSquadMode')?.style.display !== 'none';
      if (isMulti) {
        // Restore multi-squad selections
        if (Array.isArray(meta.activeSquadIds)) {
          meta.activeSquadIds.forEach(id => {
            const chip = document.querySelector(`#multiSquadChips .squad-chip[data-squad-id="${id}"]`);
            if (chip) chip.classList.add('active');
          });
        }
        if (Array.isArray(meta.multiDeselected)) {
          _multiDeselected = new Set(meta.multiDeselected);
        }
        const searchInput = document.getElementById('playerSearchInput');
        if (searchInput && meta.playerSearch) searchInput.value = meta.playerSearch;
        renderMultiSquadChecklist();
      } else {
        // Restore single-squad selection
        document.getElementById('sessionTeam').value = meta.team || '';
        const teamSelect = document.getElementById('sessionTeam');
        const selectedOpt = teamSelect?.options[teamSelect.selectedIndex];
        const squadId = selectedOpt?.dataset?.id;
        if (squadId) {
          renderPlayerChecklist(squadId, Array.isArray(playerIds) && playerIds.length > 0 ? playerIds : null);
        }
      }
    }
    currentSessionId = sid;

    // Restore Blocks — clear panes first
    const panes = document.getElementById('phasePanes');
    if (panes) panes.innerHTML = '';
    Object.keys(canvases).forEach(k => delete canvases[k]);
    blockCounter = 0; drillCounter = 0;

    // Build phase panes
    renderPhaseTabBar();

    blocks.forEach(b => {
      const phaseIdx = typeof b.phase === 'number' ? b.phase : 0;
      const safePhaseIdx = phaseIdx < _phases.length ? phaseIdx : 0;
      const id = addBlock(b.type, true, safePhaseIdx);
      const el = document.getElementById(id);
      if (el) {
        el.querySelector('.block-title-input').value = b.title || '';
        if (b.type === 'drill') {
          setDrillSections(id, b.description || '');
        } else {
          const rte = document.getElementById('rte-' + id);
          if (rte) rte.innerHTML = b.description || '';
        }
      }
      if (b.type === 'drill' && b.drawingData) {
        const s = canvases[id];
        if (s) {
          s.pitchType = b.pitchType || 'full';
          s.orientation = b.orientation || 'landscape';

          setPT(id, s.pitchType, canvases);

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
      // Restore animation link
      if (b.animationId) {
        _blockAnimationIds[id] = b.animationId;
        setDrillMode(id, 'animated');
        supabase.from('animations').select('thumbnail').eq('id', b.animationId).single()
          .then(({ data }) => {
            if (data?.thumbnail) {
              const img = document.getElementById(`adt-img-${id}`);
              const ph = document.getElementById(`adt-ph-${id}`);
              if (img) { img.src = data.thumbnail; img.style.display = ''; }
              if (ph) ph.style.display = 'none';
            }
          });
      }
      // Restore video
      if (b.videoUrl) {
        setVideoUrl(id, b.videoUrl);
      }
    });
    renderPhaseTabBar();
    return true;
  } catch (e) {
    console.error('Autosave restore failed', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
//  PLAYER SELECTION CHECKLIST
// ═══════════════════════════════════════════════════════════

// Track deselected players for multi-squad mode (persists across re-renders from search)
let _multiDeselected = new Set();

/**
 * Attach click handlers to player chip checkboxes.
 * Uses <div> instead of <label> to avoid double-toggle from native label behavior.
 * @param {HTMLElement} container - the #playerChecklist container
 * @param {boolean} trackDeselect - if true, track deselections in _multiDeselected (multi-squad mode)
 */
function attachPlayerChipHandlers(container, trackDeselect = false) {
  container.querySelectorAll('.player-chip-check').forEach(chip => {
    const cb = chip.querySelector('input[type="checkbox"]');
    const playerId = chip.dataset.playerId;

    const syncUI = () => {
      chip.classList.toggle('checked', cb.checked);
      const icon = chip.querySelector('.chip-icon i');
      if (icon) icon.className = cb.checked ? 'fas fa-check-circle' : 'fas fa-circle';
      if (trackDeselect) {
        if (cb.checked) _multiDeselected.delete(playerId);
        else _multiDeselected.add(playerId);
      }
      updatePlayerCount();
      autosaveState();
    };

    // Click anywhere on the chip toggles
    chip.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return; // checkbox handles itself
      cb.checked = !cb.checked;
      syncUI();
    });
    // Direct checkbox click
    cb.addEventListener('change', syncUI);
  });
}

function renderMultiSquadChecklist() {
  const section = document.getElementById('playerChecklistSection');
  const container = document.getElementById('playerChecklist');
  if (!section || !container) return;

  // Get active squad IDs
  const activeChips = document.querySelectorAll('#multiSquadChips .squad-chip.active');
  const activeSquadIds = Array.from(activeChips).map(c => c.dataset.squadId);

  if (activeSquadIds.length === 0) {
    section.style.display = 'none';
    updatePlayerCount();
    return;
  }

  // Get search term
  const searchTerm = (document.getElementById('playerSearchInput')?.value || '').trim().toLowerCase();

  // When searching, scan all squads; otherwise only active squad chips
  const squadIdsToRender = searchTerm
    ? squadManager.getSquads().map(s => s.id)
    : activeSquadIds;

  // Gather players grouped by squad
  let html = '';
  let totalPlayers = 0;
  for (const squadId of squadIdsToRender) {
    const squad = squadManager.getSquad(squadId);
    let players = squadManager.getPlayers({ squadId });
    if (searchTerm) {
      players = players.filter(p => p.name.toLowerCase().includes(searchTerm));
    }
    if (players.length === 0) continue;

    html += `<div class="player-squad-label">${escapeText(squad?.name || 'Unknown')}</div>`;
    html += players.map(p => {
      const isChecked = !_multiDeselected.has(p.id);
      const pos = p.position ? p.position.split(',')[0].trim() : '';
      totalPlayers++;
      return `<div class="player-chip-check${isChecked ? ' checked' : ''}" data-player-id="${p.id}">
        <input type="checkbox" class="player-cb" value="${p.id}" ${isChecked ? 'checked' : ''}>
        <span class="chip-icon"><i class="fas ${isChecked ? 'fa-check-circle' : 'fa-circle'}"></i></span>
        <span>${escapeText(p.name)}</span>
        ${pos ? `<span class="chip-pos">(${pos})</span>` : ''}
      </div>`;
    }).join('');
  }

  if (totalPlayers === 0) {
    section.style.display = 'none';
    updatePlayerCount();
    return;
  }

  section.style.display = '';
  container.innerHTML = html;

  attachPlayerChipHandlers(container, true);
  updatePlayerCount();
}

function renderPlayerChecklist(squadId, preselectedIds = null) {
  const section = document.getElementById('playerChecklistSection');
  const container = document.getElementById('playerChecklist');
  if (!section || !container) return;

  const players = squadManager.getPlayers({ squadId });
  if (players.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  container.innerHTML = players.map(p => {
    const isChecked = preselectedIds ? preselectedIds.includes(p.id) : true;
    const pos = p.position ? p.position.split(',')[0].trim() : '';
    return `<div class="player-chip-check${isChecked ? ' checked' : ''}" data-player-id="${p.id}">
      <input type="checkbox" class="player-cb" value="${p.id}" ${isChecked ? 'checked' : ''}>
      <span class="chip-icon"><i class="fas ${isChecked ? 'fa-check-circle' : 'fa-circle'}"></i></span>
      <span>${escapeText(p.name)}</span>
      ${pos ? `<span class="chip-pos">(${pos})</span>` : ''}
    </div>`;
  }).join('');

  attachPlayerChipHandlers(container);
  updatePlayerCount();
}

function updatePlayerCount() {
  const all = document.querySelectorAll('#playerChecklist .player-cb');
  const checked = document.querySelectorAll('#playerChecklist .player-cb:checked');
  const summary = document.getElementById('playerCountSummary');
  if (summary) summary.textContent = `${checked.length} of ${all.length} selected`;
  // Sync to players count input (works for both modes)
  const playersInput = document.getElementById('sessionPlayers');
  if (playersInput) playersInput.value = checked.length;
  const playersInputMulti = document.getElementById('sessionPlayersMulti');
  if (playersInputMulti) playersInputMulti.value = checked.length;
}

function getSelectedPlayerIds() {
  return Array.from(document.querySelectorAll('#playerChecklist .player-cb:checked')).map(cb => cb.value);
}

function escapeText(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ═══════════════════════════════════════════════════════════
//  SESSION TEMPLATES
// ═══════════════════════════════════════════════════════════
async function saveAsTemplate() {
  const title = document.getElementById('sessionTitle')?.value?.trim();
  if (!title) { showToast('Please enter a session title', 'error'); return; }
  if (!_clubId) { showToast('No club context — please select a club or refresh', 'error'); return; }

  const templateAuthor = document.getElementById('sessionAuthor')?.value || _profileName;
  const drillsData = [];
  let globalIndex = 0;
  _phases.forEach((_, phaseIdx) => {
    const pane = document.getElementById(`phaseBlocks-${phaseIdx}`);
    if (!pane) return;
    pane.querySelectorAll('.drill-block').forEach(el => {
      const bid = el.id;
      const isDrill = el.querySelector('.block-pill')?.classList.contains('drill');
      const btitle = el.querySelector('.block-title-input')?.value || '';
      const s = canvases[bid];
      const hasAnim = !!_blockAnimationIds[bid];
      drillsData.push({
        _blockId: bid,
        title: btitle,
        description: isDrill ? getDrillSections(bid) : (document.getElementById('rte-' + bid)?.innerHTML || ''),
        pitch_type: s ? s.pitchType : 'full',
        orientation: s ? s.orientation : 'landscape',
        drawing_data: hasAnim ? JSON.stringify({ tokens: [], paths: [] }) : (s ? JSON.stringify({ tokens: s.tokens, paths: s.paths, orientation: s.orientation }) : JSON.stringify({ tokens: [], paths: [] })),
        image: hasAnim ? null : (s ? s.canvas.toDataURL('image/png') : null),
        animation_id: _blockAnimationIds[bid] || null,
        video_url: getVideoUrl(bid) || null,
        category: isDrill ? 'Session Drill' : 'Section',
        category_tag: isDrill ? (document.getElementById(`cat-${bid}`)?.value || null) : null,
        author: templateAuthor,
        order_index: globalIndex,
        phase: phaseIdx
      });
      globalIndex++;
    });
  });

  if (drillsData.length === 0) {
    showToast('Add at least one drill block before saving a template', 'error');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        title: title + ' (Template)',
        is_template: true,
        image: drillsData[0].image,
        date: null, start_time: null, venue: '', duration: '',
        players_count: null, ability_level: '', equipment: '',
        purpose: '', author: _profileName, team: '', notes: '', player_ids: [],
        session_phases: _phases,
        club_id: _clubId,
        created_by: _userId
      })
      .select()
      .single();

    if (error) throw error;

    const cleanRow = (r) => { const { _blockId, ...rest } = r; return rest; };
    const drillRows = drillsData.map(d => cleanRow({ ...d, session_id: data.id, club_id: _clubId, created_by: _userId }));
    const { error: drillError } = await supabase.from('drills').insert(drillRows);
    if (drillError) throw drillError;

    showToast('Template saved!', 'success');
  } catch (e) {
    console.error('saveAsTemplate error:', e);
    showToast('Failed to save template: ' + (e.message || ''), 'error');
  }
}
window.saveAsTemplate = saveAsTemplate;

async function loadTemplate(id) {
  closeSessionModal();
  const prevId = currentSessionId;
  await loadSession(id);
  // Reset so saving creates a NEW session
  currentSessionId = null;
  // Clear all metadata (template = content only)
  document.getElementById('sessionDate').value = '';
  document.getElementById('sessionStartTime').value = '';
  document.getElementById('sessionDuration').value = '';
  document.getElementById('sessionTeam').value = '';
  document.getElementById('sessionPlayers').value = '';
  document.getElementById('sessionLevel').value = '';
  document.getElementById('sessionEquipment').value = '';
  document.getElementById('sessionPurpose').value = '';
  document.getElementById('sessionAuthor').value = '';
  document.getElementById('sessionVenue').value = '';
  // Switch to builder tab (templates are content-focused)
  switchPlannerTab('builder');
  showToast('Template loaded — save to create a new session', 'info');
}
window.loadTemplate = loadTemplate;

// ═══════════════════════════════════════════════════════════
//  DRILL PICKER — Load from Library
// ═══════════════════════════════════════════════════════════

let _drillPickerTarget = null;  // block id that will receive the loaded drill
let _drillPickerCache = null;   // cached fetch results
let _drillPickerAuthor = null;  // current user's display name (for "My Drills" filter)
let _drillPickerMode = 'static'; // 'static' or 'animated' — matches the current block's mode

function buildDrillPickerModal() {
  if (document.getElementById('drillPickerModal')) return;
  const modal = document.createElement('div');
  modal.id = 'drillPickerModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-container" style="max-width:720px;max-height:85vh;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;">
      <div style="padding:20px 24px 12px;border-bottom:1px solid #e2e8f0;flex-shrink:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3 id="dpTitle" style="margin:0;color:var(--navy-dark);font-size:1.15rem;"><i class="fas fa-folder-open" style="margin-right:8px;color:var(--primary);"></i>Load Drill from Library</h3>
          <button onclick="closeDrillPicker()" class="block-icon-btn" style="font-size:1.1rem;"><i class="fas fa-times"></i></button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input type="text" id="dpSearch" placeholder="Search drills..." oninput="filterDrillPicker()"
            style="flex:1;min-width:160px;padding:8px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;">
          <select id="dpCoachFilter" onchange="filterDrillPicker()" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;">
            <option value="mine">My Drills</option>
            <option value="all">All Coaches</option>
          </select>
          <select id="dpSort" onchange="filterDrillPicker()" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;">
            <option value="recent">Most Recent</option>
            <option value="alpha">A — Z</option>
            <option value="oldest">Oldest First</option>
          </select>
          <select id="dpCategoryFilter" onchange="filterDrillPicker()" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;">
            <option value="all">All Categories</option>
            ${Object.entries(DRILL_CATEGORIES).map(([group, items]) =>
              `<optgroup label="${group}">${items.map(c => `<option value="${c}">${c}</option>`).join('')}</optgroup>`
            ).join('')}
          </select>
        </div>
      </div>
      <div id="dpGrid" style="flex:1;overflow-y:auto;padding:16px 24px;"></div>
    </div>`;
  document.body.appendChild(modal);
}

async function openDrillPicker(blockId) {
  _drillPickerTarget = blockId;
  buildDrillPickerModal();

  const modal = document.getElementById('drillPickerModal');
  modal.classList.add('open');

  // Detect current block mode (static vs animated)
  const activeBtn = document.querySelector(`#dmt-${blockId} .dmt-btn.active`);
  _drillPickerMode = activeBtn?.dataset?.mode || 'static';

  // Update modal title to reflect drill type
  const dpTitle = document.getElementById('dpTitle');
  if (dpTitle) {
    const icon = _drillPickerMode === 'animated' ? 'fa-play-circle' : 'fa-pencil-ruler';
    const label = _drillPickerMode === 'animated' ? 'Load Animated Drill' : 'Load Static Drill';
    dpTitle.innerHTML = `<i class="fas ${icon}" style="margin-right:8px;color:var(--primary);"></i>${label}`;
  }

  // Get current user's name for "My Drills" filter (use cached profile name, no extra DB call)
  if (!_drillPickerAuthor) {
    _drillPickerAuthor = _profileName
      || document.getElementById('sessionAuthor')?.value?.trim()
      || null;
  }

  // Reset filters — default to "All Coaches" so drills always appear
  document.getElementById('dpSearch').value = '';
  document.getElementById('dpCoachFilter').value = 'all';
  document.getElementById('dpSort').value = 'recent';
  document.getElementById('dpCategoryFilter').value = 'all';

  // Invalidate cache so we refetch with correct type filter
  _drillPickerCache = null;

  // Fetch all drills (library + session-linked) so the picker is never empty
  document.getElementById('dpGrid').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-medium);"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Loading drills...</div>';
  try {
    let query = supabase
      .from('drills')
      .select('id, title, image, author, drawing_data, description, pitch_type, orientation, video_url, animation_id, category_tag, created_at')
      .neq('category', 'Section')
      .order('created_at', { ascending: false })
      .limit(200);

    // Scope to current club if available
    if (_clubId) {
      query = query.eq('club_id', _clubId);
    }

    // Filter by drill type: animated drills have animation_id, static drills don't
    if (_drillPickerMode === 'animated') {
      query = query.not('animation_id', 'is', null);
    } else {
      query = query.is('animation_id', null);
    }

    const { data: drills, error } = await query;
    if (error) throw error;

    // Deduplicate: if the same title+author appears multiple times (from sessions),
    // keep only the most recent version
    const seen = new Map();
    const deduped = [];
    for (const d of drills) {
      const key = `${(d.title || '').toLowerCase()}|${(d.author || '').toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        deduped.push(d);
      }
    }

    _drillPickerCache = { drills: deduped, _ts: Date.now() };
  } catch (err) {
    console.error('Failed to load drills:', err);
    document.getElementById('dpGrid').innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">Failed to load drills</div>';
    return;
  }

  filterDrillPicker();
}
window.openDrillPicker = openDrillPicker;

function closeDrillPicker() {
  const modal = document.getElementById('drillPickerModal');
  if (modal) modal.classList.remove('open');
  _drillPickerTarget = null;
}
window.closeDrillPicker = closeDrillPicker;

function filterDrillPicker() {
  if (!_drillPickerCache) return;
  const search = (document.getElementById('dpSearch')?.value || '').toLowerCase();
  const coachFilter = document.getElementById('dpCoachFilter')?.value || 'mine';
  const sort = document.getElementById('dpSort')?.value || 'recent';

  let drills = [..._drillPickerCache.drills];

  // Coach filter
  if (coachFilter === 'mine' && _drillPickerAuthor) {
    const myName = _drillPickerAuthor.toLowerCase();
    drills = drills.filter(d => (d.author || '').toLowerCase().includes(myName));
  }

  // Category filter
  const categoryFilter = document.getElementById('dpCategoryFilter')?.value || 'all';
  if (categoryFilter !== 'all') {
    drills = drills.filter(d => d.category_tag === categoryFilter);
  }

  // Search
  if (search) {
    drills = drills.filter(d =>
      (d.title || '').toLowerCase().includes(search) ||
      (d.author || '').toLowerCase().includes(search) ||
      (d.category_tag || '').toLowerCase().includes(search)
    );
  }

  // Sort
  if (sort === 'recent') {
    drills.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (sort === 'alpha') {
    drills.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sort === 'oldest') {
    drills.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  renderDrillPickerGrid(drills);
}
window.filterDrillPicker = filterDrillPicker;

function renderDrillPickerGrid(drills) {
  const grid = document.getElementById('dpGrid');
  if (!drills.length) {
    const typeLabel = _drillPickerMode === 'animated' ? 'animated' : 'static';
    grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-medium);">
      <i class="fas fa-search" style="font-size:2rem;margin-bottom:12px;opacity:0.4;display:block;"></i>
      No ${typeLabel} drills found. Try a different filter or save a ${typeLabel} drill to your library first.
    </div>`;
    return;
  }

  grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
    ${drills.map(d => {
      const thumb = d.image
        ? `<img src="${d.image}" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:8px 8px 0 0;background:#1a472a;">`
        : `<div style="width:100%;height:120px;border-radius:8px 8px 0 0;background:#1a472a;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-futbol" style="font-size:2rem;color:rgba(255,255,255,0.3);"></i>
          </div>`;
      return `<div class="dash-card" onclick="selectDrillFromPicker('${d.id}')"
        style="padding:0;cursor:pointer;overflow:hidden;border-radius:10px;transition:all 0.15s;border:2px solid transparent;"
        onmouseenter="this.style.borderColor='var(--primary)'" onmouseleave="this.style.borderColor='transparent'">
        ${thumb}
        <div style="padding:10px 12px;">
          <div style="font-weight:700;font-size:0.85rem;color:var(--navy-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(d.title || 'Untitled Drill')}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
            <span style="font-size:0.75rem;color:var(--text-medium);"><i class="fas fa-user" style="margin-right:3px;opacity:0.5;"></i>${escapeHtml(d.author || 'Coach')}</span>
            ${d.category_tag ? `<span style="font-size:0.65rem;padding:1px 6px;border-radius:4px;background:var(--primary-light,#e6f9f4);color:var(--primary,#00C49A);font-weight:600;">${escapeHtml(d.category_tag)}</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

async function selectDrillFromPicker(drillId) {
  const blockId = _drillPickerTarget;
  if (!blockId) return;

  const drill = _drillPickerCache?.drills?.find(d => d.id === drillId);
  if (!drill) return;

  closeDrillPicker();

  const el = document.getElementById(blockId);
  if (!el) return;

  // 1. Title + Category
  const titleInput = el.querySelector('.block-title-input');
  if (titleInput) titleInput.value = drill.title || '';
  const catSelect = document.getElementById(`cat-${blockId}`);
  if (catSelect && drill.category_tag) catSelect.value = drill.category_tag;

  // 2. Drill sections (description)
  setDrillSections(blockId, drill.description || '');

  // 3. Canvas: restore tokens, paths, pitch type, orientation
  const s = canvases[blockId];
  if (s && drill.drawing_data) {
    let drillData = drill.drawing_data;
    if (typeof drillData === 'string') {
      try { drillData = JSON.parse(drillData); } catch (e) { drillData = {}; }
    }

    s.pitchType = drill.pitch_type || 'full';
    s.orientation = drillData.orientation || drill.orientation || 'landscape';

    // Update orientation button
    const btn = document.getElementById(`btn-orient-${blockId}`);
    if (btn) {
      if (s.orientation === 'portrait') {
        btn.classList.add('active');
        btn.innerHTML = `<i class="fas fa-arrows-alt-v"></i> Portrait`;
      } else {
        btn.classList.remove('active');
        btn.innerHTML = `<i class="fas fa-arrows-alt-h"></i> Landscape`;
      }
    }

    // Update pitch type buttons
    setPT(blockId, s.pitchType, canvases);

    // Restore tokens and paths
    if (Array.isArray(drillData)) {
      s.tokens = drillData;
      s.paths = [];
    } else if (drillData && typeof drillData === 'object') {
      s.tokens = drillData.tokens || [];
      s.paths = drillData.paths || [];
    }

    // Open the drill builder if closed and redraw
    const wrap = document.getElementById('dcw-' + blockId);
    const toggleBtn = document.getElementById('ct-' + blockId);
    if (wrap && !wrap.classList.contains('visible')) {
      wrap.classList.add('visible');
      if (toggleBtn) {
        toggleBtn.classList.add('open');
        toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Close Drill Builder';
      }
    }

    drawAll(blockId, canvases);
  }

  // 4. Animation link
  if (drill.animation_id) {
    _blockAnimationIds[blockId] = drill.animation_id;
    setDrillMode(blockId, 'animated');
    supabase.from('animations').select('thumbnail').eq('id', drill.animation_id).single()
      .then(({ data }) => {
        if (data?.thumbnail) {
          const img = document.getElementById(`adt-img-${blockId}`);
          const ph = document.getElementById(`adt-ph-${blockId}`);
          if (img) { img.src = data.thumbnail; img.style.display = ''; }
          if (ph) ph.style.display = 'none';
        }
      });
  }

  // 5. Video
  if (drill.video_url) {
    setVideoUrl(blockId, drill.video_url);
  }

  // 6. Autosave
  autosaveState();

  showToast(`Drill "${drill.title || 'Untitled'}" loaded`, 'success');
}
window.selectDrillFromPicker = selectDrillFromPicker;

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
export async function initPlanner() {
  // profile already loaded by page-init.js — read from global, no extra network call
  const profile = window._profile;
  _clubId = sessionStorage.getItem('impersonating_club_id') || profile?.club_id || null;
  _userId = profile?.id || null;
  _profileName = profile?.full_name || '';

  // Auto-fill author from logged-in user's name (only if field is empty)
  const authorInput = document.getElementById('sessionAuthor');
  if (authorInput && !authorInput.value && profile?.full_name) {
    authorInput.value = profile.full_name;
  }

  // Auto-fill defaults from club settings (venue, time, duration)
  const clubSettings = profile?.clubs?.settings || {};
  const venueInput = document.getElementById('sessionVenue');
  if (venueInput && !venueInput.value && clubSettings.default_venue) venueInput.value = clubSettings.default_venue;
  const timeInput = document.getElementById('sessionStartTime');
  if (timeInput && !timeInput.value && clubSettings.default_time) timeInput.value = clubSettings.default_time;
  const durationInput = document.getElementById('sessionDuration');
  if (durationInput && !durationInput.value && clubSettings.default_duration) durationInput.value = clubSettings.default_duration;

  // Populate Squads — archetype-aware
  const archetype = window._profile?.clubs?.settings?.archetype;
  const isMultiSquad = archetype === 'private_coaching';

  try {
    await squadManager.init();
    const squads = squadManager.getSquads();

    if (isMultiSquad) {
      // ── MULTI-SQUAD MODE (Orion / private_coaching) ──
      document.getElementById('singleSquadMode')?.style.setProperty('display', 'none');
      const multiMode = document.getElementById('multiSquadMode');
      if (multiMode) multiMode.style.display = '';

      const chipsContainer = document.getElementById('multiSquadChips');
      if (chipsContainer) {
        chipsContainer.innerHTML = squads.map(s => {
          const count = squadManager.getPlayers({ squadId: s.id }).length;
          return `<span class="squad-chip" data-squad-id="${s.id}">
            <i class="fas fa-users squad-chip-icon"></i>
            ${escapeText(s.name)}
            <span class="squad-chip-count">(${count})</span>
          </span>`;
        }).join('');

        // Toggle squad chips — players default to UNSELECTED when squad first activated
        chipsContainer.querySelectorAll('.squad-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            const wasActive = chip.classList.contains('active');
            chip.classList.toggle('active');
            const squadId = chip.dataset.squadId;
            if (!wasActive && squadId) {
              // Squad just activated — add all its players to deselected (unselected by default)
              const players = squadManager.getPlayers({ squadId });
              players.forEach(p => _multiDeselected.add(p.id));
            } else if (wasActive && squadId) {
              // Squad deactivated — clean up its players from tracking
              const players = squadManager.getPlayers({ squadId });
              players.forEach(p => _multiDeselected.delete(p.id));
            }
            renderMultiSquadChecklist();
            autosaveState();
          });
        });
      }

      // Player search
      const searchInput = document.getElementById('playerSearchInput');
      if (searchInput) {
        let debounce;
        searchInput.addEventListener('input', () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => renderMultiSquadChecklist(), 150);
        });
      }

    } else {
      // ── SINGLE-SQUAD MODE (Tuks / academy) ──
      const teamSelect = document.getElementById('sessionTeam');
      if (teamSelect) {
        squads.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.name;
          opt.dataset.id = s.id;
          opt.textContent = s.name;
          teamSelect.appendChild(opt);
        });

        teamSelect.addEventListener('change', async () => {
          const selectedOpt = teamSelect.options[teamSelect.selectedIndex];
          const squadId = selectedOpt.dataset.id;
          if (!squadId) {
            const section = document.getElementById('playerChecklistSection');
            if (section) section.style.display = 'none';
            return;
          }

          const squad = squadManager.getSquad(squadId);
          if (squad) {
            const coachInput = document.getElementById('sessionAuthor');
            if (coachInput && squad.coaches && squad.coaches.length > 0) {
              coachInput.value = squad.coaches.join(', ');
            }
            renderPlayerChecklist(squadId);
            autosaveState();
          }
        });
      }
    }
  } catch (e) {
    console.warn('Squad manager init failed:', e);
  }

  if (document.getElementById('phasePanes')) {
    // Clear stale autosave from pre-phase system (no phases key = old format)
    try {
      const raw = localStorage.getItem('up_planner_autosave');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && !parsed.phases) {
          console.log('[Planner] Clearing pre-phase autosave data');
          localStorage.removeItem('up_planner_autosave');
        }
      }
    } catch (e) { /* ignore */ }

    // Initialize phase tab bar
    renderPhaseTabBar();
    const restored = restoreAutosave();
    if (!restored) {
      // Start with one drill in the first phase
      addBlock('drill');
      renderPhaseTabBar();
    }

    // Global listeners for metadata
    ['sessionTitle', 'sessionDate', 'sessionStartTime', 'sessionVenue', 'sessionDuration', 'sessionPlayers', 'sessionLevel', 'sessionEquipment', 'sessionPurpose', 'sessionAuthor', 'sessionTeam']
      .forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => autosaveState());
      });
  }
}
