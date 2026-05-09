/**
 * Financials UI — Pricing rules, invoice generation, history & PDF export
 * Only available for admin role + private_coaching archetype clubs.
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import { showToast } from '../toast.js';

let _clubId = null;
let _userId = null;
let _profile = null;
let _pricingRules = [];
let _invoices = [];
let _currentTab = 'pricing';

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
export async function initFinancialsUI() {
    _profile = window._profile;
    _clubId = _profile?.club_id;
    _userId = _profile?.id;

    if (!_clubId) { showToast('No club context', 'error'); return; }

    // Tab switching
    document.querySelectorAll('.fin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.fin-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.fin-view').forEach(v => v.style.display = 'none');
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.getElementById(`fin-${tab}`).style.display = 'block';
            _currentTab = tab;
            if (tab === 'pricing') loadPricingRules();
            if (tab === 'generate') initGenerateTab();
            if (tab === 'history') loadInvoiceHistory();
        });
    });

    // Default: show pricing tab and load data
    document.getElementById('fin-pricing').style.display = 'block';
    loadPricingRules();

    // Wire up pricing form
    document.getElementById('btnAddRule')?.addEventListener('click', openRuleModal);
    document.getElementById('ruleForm')?.addEventListener('submit', saveRule);
    document.getElementById('btnCancelRule')?.addEventListener('click', closeRuleModal);

    // Wire up generate tab
    document.getElementById('btnLoadMonth')?.addEventListener('click', loadMonthData);

    // Wire up line item modal form
    document.getElementById('liForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const idx = parseInt(document.getElementById('liPlayerIdx').value);
        const type = document.getElementById('liType').value;
        const desc = document.getElementById('liDesc').value.trim();
        const amt = parseFloat(document.getElementById('liAmount').value) || 0;
        const date = document.getElementById('liDate')?.value || '';
        if (!desc || amt <= 0) { showToast('Please fill in description and amount', 'error'); return; }

        const pd = _playerInvoiceData[idx];
        if (!pd) return;

        if (type === 'discount') {
            pd.lineItems.push({ date: '', description: desc, amount: -amt, type: 'discount' });
        } else if (type === 'session') {
            pd.lineItems.push({ date, description: desc, amount: amt, type: 'session' });
        } else {
            pd.lineItems.push({ date: '', description: desc, amount: amt, type });
        }

        document.getElementById('lineItemModal').classList.remove('open');
        recalcPlayer(idx);
    });

    // Set default month to current
    const now = new Date();
    const monthInput = document.getElementById('invoiceMonth');
    if (monthInput) monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════
//  TAB 1: PRICING RULES
// ═══════════════════════════════════════════════════════════
async function loadPricingRules() {
    const { data, error } = await supabase
        .from('pricing_rules')
        .select('*')
        .eq('club_id', _clubId)
        .order('sort_order', { ascending: true })
        .limit(200);
    if (error) { console.error('pricing rules error:', error); return; }
    _pricingRules = data || [];
    renderPricingRules();
}

function renderPricingRules() {
    const container = document.getElementById('pricingRulesGrid');
    if (!_pricingRules.length) {
        container.innerHTML = `<div class="fin-empty"><i class="fas fa-coins"></i><p>No pricing rules yet. Add your first rule to get started.</p></div>`;
        return;
    }

    const typeIcons = { tier: 'fa-layer-group', penalty: 'fa-exclamation-triangle', discount: 'fa-tag', addon: 'fa-plus-circle' };
    const typeColors = { tier: '#3b82f6', penalty: '#ef4444', discount: '#10b981', addon: '#f59e0b' };

    container.innerHTML = _pricingRules.map(r => {
        const icon = typeIcons[r.type] || 'fa-coins';
        const color = typeColors[r.type] || '#64748b';
        const amountStr = r.type === 'discount' ? `-R${Math.abs(r.amount).toFixed(0)}` : `R${Number(r.amount).toFixed(0)}`;
        const condStr = r.conditions && Object.keys(r.conditions).length > 0
            ? Object.entries(r.conditions).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ')
            : '';
        return `
        <div class="fin-rule-card" data-id="${r.id}">
            <div class="fin-rule-icon" style="background:${color}20;color:${color};"><i class="fas ${icon}"></i></div>
            <div class="fin-rule-body">
                <div class="fin-rule-name">${esc(r.name)}</div>
                <div class="fin-rule-desc">${esc(r.description || '')}</div>
                ${condStr ? `<div class="fin-rule-cond"><i class="fas fa-info-circle"></i> ${esc(condStr)}</div>` : ''}
            </div>
            <div class="fin-rule-amount" style="color:${color};">${amountStr}</div>
            <div class="fin-rule-actions">
                <button class="fin-icon-btn" onclick="editRule('${r.id}')" title="Edit"><i class="fas fa-pen"></i></button>
                <button class="fin-icon-btn danger" onclick="deleteRule('${r.id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function onRuleTypeChange() {
    const type = document.getElementById('ruleType').value;
    document.getElementById('tierOptions').style.display = type === 'tier' ? '' : 'none';
    document.getElementById('discountOptions').style.display = type === 'discount' ? '' : 'none';
    document.getElementById('penaltyOptions').style.display = type === 'penalty' ? '' : 'none';

    // Update amount label hint
    const label = document.getElementById('ruleAmountLabel');
    if (type === 'tier') label.textContent = 'Amount (R) — monthly rate or per-session rate';
    else if (type === 'discount') label.textContent = 'Discount Amount (R)';
    else if (type === 'penalty') label.textContent = 'Fine Amount (R)';
    else label.textContent = 'Amount (R)';
}
window._onRuleTypeChange = onRuleTypeChange;

function buildConditionsFromForm() {
    const type = document.getElementById('ruleType').value;
    const conditions = {};

    if (type === 'tier') {
        const spw = parseInt(document.getElementById('condSessionsPerWeek').value);
        const billing = document.getElementById('condBilling').value;
        if (spw === 0) {
            conditions.single_session = true;
        } else {
            conditions.sessions_per_week = spw;
        }
        if (billing === 'monthly') conditions.monthly = true;
    } else if (type === 'discount') {
        const dt = document.getElementById('condDiscountType').value;
        if (dt === 'first_session') conditions.first_session = true;
        else if (dt === 'sibling') conditions.sibling = true;
        else conditions.custom = true;
    } else if (type === 'penalty') {
        const pt = document.getElementById('condPenaltyType').value;
        if (pt === 'late_cancel') conditions.min_cancel_hours = 48;
        else if (pt === 'no_show') conditions.no_show = true;
        else conditions.custom = true;
    }
    return conditions;
}

function populateConditionsForm(conditions, type) {
    if (type === 'tier') {
        if (conditions?.single_session) {
            document.getElementById('condSessionsPerWeek').value = '0';
        } else {
            document.getElementById('condSessionsPerWeek').value = String(conditions?.sessions_per_week || 1);
        }
        document.getElementById('condBilling').value = conditions?.monthly ? 'monthly' : 'per_session';
    } else if (type === 'discount') {
        if (conditions?.first_session) document.getElementById('condDiscountType').value = 'first_session';
        else if (conditions?.sibling) document.getElementById('condDiscountType').value = 'sibling';
        else document.getElementById('condDiscountType').value = 'custom';
    } else if (type === 'penalty') {
        if (conditions?.min_cancel_hours) document.getElementById('condPenaltyType').value = 'late_cancel';
        else if (conditions?.no_show) document.getElementById('condPenaltyType').value = 'no_show';
        else document.getElementById('condPenaltyType').value = 'custom';
    }
}

function openRuleModal(editId) {
    const modal = document.getElementById('ruleModal');
    const form = document.getElementById('ruleForm');
    form.reset();
    document.getElementById('ruleId').value = '';
    document.getElementById('ruleModalTitle').innerHTML = '<i class="fas fa-coins" style="margin-right:8px;color:var(--primary);"></i>Add Pricing Rule';

    if (editId && typeof editId === 'string') {
        const rule = _pricingRules.find(r => r.id === editId);
        if (rule) {
            document.getElementById('ruleId').value = rule.id;
            document.getElementById('ruleName').value = rule.name;
            document.getElementById('ruleType').value = rule.type;
            document.getElementById('ruleAmount').value = rule.amount;
            document.getElementById('ruleDesc').value = rule.description || '';
            populateConditionsForm(rule.conditions, rule.type);
            document.getElementById('ruleModalTitle').innerHTML = '<i class="fas fa-pen" style="margin-right:8px;color:var(--primary);"></i>Edit Pricing Rule';
        }
    }
    onRuleTypeChange();
    modal.classList.add('open');
}
window.openRuleModal = openRuleModal;

function closeRuleModal() {
    document.getElementById('ruleModal').classList.remove('open');
}

async function saveRule(e) {
    e.preventDefault();
    const id = document.getElementById('ruleId').value;
    const row = {
        club_id: _clubId,
        name: document.getElementById('ruleName').value.trim(),
        type: document.getElementById('ruleType').value,
        amount: parseFloat(document.getElementById('ruleAmount').value) || 0,
        description: document.getElementById('ruleDesc').value.trim(),
        conditions: buildConditionsFromForm(),
    };

    let error;
    if (id) {
        ({ error } = await supabase.from('pricing_rules').update(row).eq('id', id));
    } else {
        ({ error } = await supabase.from('pricing_rules').insert(row));
    }
    if (error) { showToast('Failed to save rule: ' + error.message, 'error'); return; }
    closeRuleModal();
    showToast(id ? 'Rule updated' : 'Rule added', 'success');
    loadPricingRules();
}

window.editRule = function(id) { openRuleModal(id); };
window.deleteRule = async function(id) {
    if (!confirm('Delete this pricing rule?')) return;
    const { error } = await supabase.from('pricing_rules').delete().eq('id', id);
    if (error) { showToast('Failed to delete', 'error'); return; }
    showToast('Rule deleted', 'success');
    loadPricingRules();
};

// ═══════════════════════════════════════════════════════════
//  TAB 2: GENERATE INVOICES
// ═══════════════════════════════════════════════════════════
let _monthSessions = [];
let _monthAttendance = [];
let _playerInvoiceData = []; // computed invoice previews
let _playerTierOverrides = {}; // playerId → tier id (admin override)

function initGenerateTab() {
    // Rules will be fetched fresh (active only) when user clicks Load Month
}

async function loadMonthData() {
    const month = document.getElementById('invoiceMonth')?.value;
    if (!month) { showToast('Select a month', 'error'); return; }

    const [year, mon] = month.split('-').map(Number);
    const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(mon).padStart(2, '0')}-${new Date(year, mon, 0).getDate()}`;

    // Clear tier overrides when loading a new month
    _playerTierOverrides = {};
    document.getElementById('invoicePreviewArea').innerHTML = '<div class="fin-loading"><i class="fas fa-spinner fa-spin"></i> Loading attendance data...</div>';

    // Fetch sessions, rules, existing invoices in parallel first
    const [sessRes, rulesRes, existingRes] = await Promise.all([
        supabase.from('sessions').select('id, title, date, team, player_ids').eq('club_id', _clubId).gte('date', startDate).lte('date', endDate).order('date').limit(500),
        supabase.from('pricing_rules').select('*').eq('club_id', _clubId).eq('is_active', true).order('sort_order').limit(200),
        supabase.from('invoices').select('id, player_id, status').eq('club_id', _clubId).eq('month', month).limit(5000),
    ]);

    _monthSessions = sessRes.data || [];

    // Fetch attendance for THESE specific sessions (not by date range)
    let _monthAttendanceData = [];
    if (_monthSessions.length > 0) {
        const sessionIds = _monthSessions.map(s => s.id);
        const { data: attData } = await supabase
            .from('training_attendance')
            .select('session_id, squad_id, absent_player_ids')
            .in('session_id', sessionIds);
        _monthAttendanceData = attData || [];
    }
    _monthAttendance = _monthAttendanceData;
    _pricingRules = rulesRes.data || [];
    const existingInvoices = existingRes.data || [];
    const existingMap = {};
    existingInvoices.forEach(inv => { existingMap[inv.player_id] = inv; });

    // Warn if no pricing rules configured
    const hasTiers = _pricingRules.some(r => r.type === 'tier');
    if (!hasTiers) {
        showToast('No pricing tiers set up — using R350/session fallback. Set up rules in the Pricing tab.', 'warn');
    }

    // Build per-player data
    const allPlayers = squadManager.getPlayers({});
    const absentMap = {}; // session_id -> Set of absent player IDs
    _monthAttendance.forEach(a => {
        const ids = Array.isArray(a.absent_player_ids) ? a.absent_player_ids : [];
        if (!absentMap[a.session_id]) absentMap[a.session_id] = new Set();
        ids.forEach(id => absentMap[a.session_id].add(id));
    });

    // Build set of sessions that have attendance records (register was completed)
    const sessionsWithAttendance = new Set(_monthAttendance.map(a => a.session_id));

    _playerInvoiceData = allPlayers.map(player => {
        const sessionsAttended = [];
        const sessionsAbsent = [];

        _monthSessions.forEach(sess => {
            // Only include sessions where attendance was actually recorded
            // (prevents phantom invoicing for planned-but-not-attended sessions)
            if (!sessionsWithAttendance.has(sess.id)) return;

            // Check if player was part of this session
            const playerIds = Array.isArray(sess.player_ids) ? sess.player_ids : [];
            const wasPlanned = playerIds.includes(player.id);
            if (!wasPlanned) return;

            const absentSet = absentMap[sess.id] || new Set();
            if (absentSet.has(player.id)) {
                sessionsAbsent.push({ date: sess.date, title: sess.title, id: sess.id });
            } else {
                sessionsAttended.push({ date: sess.date, title: sess.title, id: sess.id });
            }
        });

        // Build line items from attendance
        const lineItems = [];
        const sessionDates = sessionsAttended.map(s => s.date);
        const tierOverride = _playerTierOverrides[player.id] || null;
        const rateInfo = getSessionRate(sessionDates, tierOverride);

        if (rateInfo.monthly) {
            // Monthly flat rate — show as single line + session breakdown
            lineItems.push({
                date: '',
                description: `${rateInfo.tierName} (${sessionsAttended.length} sessions)`,
                amount: rateInfo.total,
                type: 'session',
            });
            // Add individual sessions as informational (zero-amount)
            sessionsAttended.forEach(s => {
                lineItems.push({ date: s.date, description: `  ${s.title || 'Session'}`, amount: 0, type: 'session' });
            });
        } else {
            // Per-session rate
            sessionsAttended.forEach(s => {
                lineItems.push({
                    date: s.date,
                    description: `Training Session — ${s.title || 'Session'}`,
                    amount: rateInfo.rate,
                    type: 'session',
                });
            });
        }

        // Apply discounts
        const discounts = _pricingRules.filter(r => r.type === 'discount');
        let discountTotal = 0;
        const effectiveRate = rateInfo.monthly ? rateInfo.total / Math.max(sessionsAttended.length, 1) : rateInfo.rate;
        discounts.forEach(d => {
            if (d.conditions?.first_session && sessionsAttended.length > 0) {
                discountTotal += effectiveRate;
                lineItems.push({ date: '', description: d.name, amount: -effectiveRate, type: 'discount' });
            }
        });

        const subtotal = rateInfo.monthly ? rateInfo.total : sessionsAttended.length * rateInfo.rate;
        const total = subtotal - discountTotal;
        const existing = existingMap[player.id];

        return {
            player,
            sessionsAttended,
            sessionsAbsent,
            lineItems,
            rateInfo,
            subtotal,
            discount: discountTotal,
            penalties: 0,
            total,
            existingInvoice: existing || null,
        };
    }).filter(p => p.sessionsAttended.length > 0 || p.sessionsAbsent.length > 0);

    renderInvoicePreviews(month);
}

// Get Monday date string as a unique week key (collision-free)
function getWeekKey(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((day + 6) % 7)); // shift to Monday
    return mon.toISOString().split('T')[0]; // e.g. "2026-03-23"
}

function getSessionRate(sessionDates, forceTierId) {
    const attendedCount = sessionDates.length;
    const tiers = _pricingRules.filter(r => r.type === 'tier')
        .sort((a, b) => (a.conditions?.sessions_per_week || 0) - (b.conditions?.sessions_per_week || 0));

    // If a specific tier is forced (admin override), use it
    if (forceTierId) {
        const forced = tiers.find(t => t.id === forceTierId);
        if (forced) {
            const amt = Number(forced.amount);
            if (forced.conditions?.monthly) {
                return { rate: amt, total: amt, monthly: true, tierName: forced.name, tierId: forced.id };
            }
            return { rate: amt, total: amt * attendedCount, monthly: false, tierName: forced.name, tierId: forced.id };
        }
    }

    // Count distinct weeks the player actually trained in
    const weekSet = new Set(sessionDates.map(d => getWeekKey(d)));
    const distinctWeeks = weekSet.size;

    // Smart matching:
    // - If ≤ 1 distinct week OR only 1-2 sessions total → use single/drop-in rate (per-session)
    // - Otherwise → calculate actual sessions/week and match to monthly tier
    const singleTier = tiers.find(t => t.conditions?.single_session);
    const monthlyTiers = tiers.filter(t => !t.conditions?.single_session && t.conditions?.sessions_per_week);

    if (attendedCount <= 2 && distinctWeeks <= 1) {
        // Drop-in / casual — use per-session pricing
        const rate = singleTier ? Number(singleTier.amount) : 350;
        return { rate, total: rate * attendedCount, monthly: false, tierName: singleTier?.name || 'Single Session', tierId: singleTier?.id || null };
    }

    // Calculate actual average sessions per week (across weeks they trained)
    const avgPerWeek = distinctWeeks > 0 ? attendedCount / distinctWeeks : attendedCount;

    // Match to best tier: find the highest tier whose sessions_per_week ≤ avgPerWeek
    let matchedTier = null;
    for (const t of monthlyTiers) {
        const tierWeekly = t.conditions?.sessions_per_week || 0;
        if (avgPerWeek >= tierWeekly) matchedTier = t;
    }

    // Fallback: if no monthly tier matches, use single session rate
    if (!matchedTier) {
        const rate = singleTier ? Number(singleTier.amount) : 350;
        return { rate, total: rate * attendedCount, monthly: false, tierName: singleTier?.name || 'Single Session', tierId: singleTier?.id || null };
    }

    const amount = Number(matchedTier.amount);
    if (matchedTier.conditions?.monthly) {
        return { rate: amount, total: amount, monthly: true, tierName: matchedTier.name, tierId: matchedTier.id };
    }
    return { rate: amount, total: amount * attendedCount, monthly: false, tierName: matchedTier.name, tierId: matchedTier.id };
}

function renderInvoicePreviews(month) {
    const container = document.getElementById('invoicePreviewArea');
    if (!_playerInvoiceData.length) {
        container.innerHTML = `<div class="fin-empty"><i class="fas fa-calendar-check"></i><p>No attendance data found for this month. Make sure sessions are recorded in the training register.</p></div>`;
        return;
    }

    const monthLabel = new Date(month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    container.innerHTML = `
        <div class="fin-preview-header">
            <h3><i class="fas fa-users"></i> ${_playerInvoiceData.length} Players — ${monthLabel}</h3>
            <button class="dash-btn primary" id="btnGenerateAll"><i class="fas fa-file-invoice"></i> Generate All Invoices</button>
        </div>
        ${_playerInvoiceData.map((pd, idx) => renderPlayerPreviewCard(pd, idx, month)).join('')}
    `;

    document.getElementById('btnGenerateAll')?.addEventListener('click', generateAllInvoices);
}

function renderPlayerPreviewCard(pd, idx, month) {
    const p = pd.player;
    const statusBadge = pd.existingInvoice
        ? `<span class="fin-status-badge ${pd.existingInvoice.status}">${pd.existingInvoice.status}</span>`
        : '';

    return `
    <div class="fin-player-card" data-idx="${idx}">
        <div class="fin-player-header" onclick="togglePlayerDetail(${idx})">
            <div class="fin-player-info">
                <strong>${esc(p.name)}</strong>
                <span class="fin-player-meta">${pd.sessionsAttended.length} sessions attended, ${pd.sessionsAbsent.length} absent</span>
            </div>
            <div class="fin-player-total">
                R${pd.total.toFixed(2)} ${statusBadge}
                <i class="fas fa-chevron-down fin-chevron"></i>
            </div>
        </div>
        <div class="fin-player-detail" id="playerDetail-${idx}" style="display:none;">
            <div class="fin-tier-selector">
                <label><i class="fas fa-layer-group" style="margin-right:5px;color:var(--primary);"></i>Pricing Tier:</label>
                <select onchange="changeTier(${idx}, this.value)" class="fin-tier-select">
                    ${_pricingRules.filter(r => r.type === 'tier').map(t => {
                        const label = `${esc(t.name)} — R${Number(t.amount).toFixed(0)}${t.conditions?.monthly ? '/mo' : '/session'}`;
                        const selected = pd.rateInfo?.tierId === t.id ? 'selected' : '';
                        return `<option value="${t.id}" ${selected}>${label}</option>`;
                    }).join('')}
                </select>
                <span class="fin-tier-auto">${pd.rateInfo ? `Auto: ${esc(pd.rateInfo.tierName)}` : ''}</span>
            </div>
            <table class="fin-line-table">
                <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th></th></tr></thead>
                <tbody id="lineItems-${idx}">
                    ${pd.lineItems.map((li, liIdx) => `
                    <tr class="fin-line-row ${li.type}" ${li.amount === 0 ? 'style="opacity:0.55;font-size:0.78rem;"' : ''}>
                        <td>${li.date || '—'}</td>
                        <td>${esc(li.description)}</td>
                        <td class="${li.amount < 0 ? 'negative' : ''}">${li.amount === 0 ? '—' : 'R' + li.amount.toFixed(2)}</td>
                        <td>${li.amount !== 0 ? `<button class="fin-icon-btn danger" onclick="removeLineItem(${idx}, ${liIdx})" title="Remove"><i class="fas fa-times"></i></button>` : ''}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="fin-adjust-bar">
                <button class="dash-btn sm" onclick="addPenalty(${idx})"><i class="fas fa-exclamation-triangle"></i> Add Penalty</button>
                <button class="dash-btn sm" onclick="addDiscount(${idx})"><i class="fas fa-tag"></i> Add Discount</button>
                <button class="dash-btn sm" onclick="addAddon(${idx})"><i class="fas fa-plus"></i> Add Item</button>
                <button class="dash-btn sm" onclick="addSessionDay(${idx})"><i class="fas fa-calendar-plus"></i> Add Session</button>
            </div>
            <div class="fin-totals">
                <div>Subtotal: <strong>R${pd.subtotal.toFixed(2)}</strong></div>
                ${pd.discount > 0 ? `<div class="negative">Discounts: -R${pd.discount.toFixed(2)}</div>` : ''}
                ${pd.penalties > 0 ? `<div class="penalty">Penalties: +R${pd.penalties.toFixed(2)}</div>` : ''}
                <div class="fin-grand-total">Total: <strong>R${pd.total.toFixed(2)}</strong></div>
            </div>
            <div class="fin-card-actions">
                <button class="dash-btn primary" onclick="generateSingleInvoice(${idx}, '${month}')">
                    <i class="fas fa-file-invoice"></i> ${pd.existingInvoice ? 'Update Invoice' : 'Generate Invoice'}
                </button>
                <button class="dash-btn" onclick="exportInvoicePDF(${idx}, '${month}')">
                    <i class="fas fa-file-pdf"></i> Export PDF
                </button>
            </div>
        </div>
    </div>`;
}

window.togglePlayerDetail = function(idx) {
    const detail = document.getElementById(`playerDetail-${idx}`);
    const card = detail?.closest('.fin-player-card');
    const isOpen = detail.style.display !== 'none';
    detail.style.display = isOpen ? 'none' : '';
    card?.querySelector('.fin-chevron')?.classList.toggle('open', !isOpen);
};

// ── Line item adjustments ──
window.removeLineItem = function(playerIdx, lineIdx) {
    _playerInvoiceData[playerIdx].lineItems.splice(lineIdx, 1);
    recalcPlayer(playerIdx);
};

// ── Line item modal ──
function openLineItemModal(playerIdx, type) {
    const modal = document.getElementById('lineItemModal');
    const form = document.getElementById('liForm');
    form.reset();
    document.getElementById('liPlayerIdx').value = playerIdx;
    document.getElementById('liType').value = type;

    const cfg = {
        penalty:  { title: 'Add Penalty',  icon: 'fa-exclamation-triangle', desc: 'Late Cancellation Fee', amt: 350, amtLabel: 'Fine Amount (R)' },
        discount: { title: 'Add Discount', icon: 'fa-tag',                  desc: 'Discount',              amt: '',  amtLabel: 'Discount Amount (R)' },
        addon:    { title: 'Add Item',     icon: 'fa-plus-circle',           desc: 'Equipment',             amt: '',  amtLabel: 'Amount (R)' },
        session:  { title: 'Add Session',  icon: 'fa-calendar-plus',         desc: 'Training Session (manual)', amt: '', amtLabel: 'Amount (R)' },
    }[type] || { title: 'Add Item', icon: 'fa-plus', desc: '', amt: '', amtLabel: 'Amount (R)' };

    // Pre-fill from pricing rules if available
    const matchingRules = _pricingRules.filter(r => r.type === type);
    if (matchingRules.length > 0 && type !== 'session') {
        cfg.desc = matchingRules[0].name;
        cfg.amt = Number(matchingRules[0].amount);
    }

    document.getElementById('liModalTitle').innerHTML = `<i class="fas ${cfg.icon}" style="margin-right:8px;color:var(--primary);"></i>${cfg.title}`;
    document.getElementById('liDesc').value = cfg.desc;
    document.getElementById('liAmount').value = cfg.amt;
    document.getElementById('liAmountLabel').textContent = cfg.amtLabel;
    document.getElementById('liDateGroup').style.display = type === 'session' ? '' : 'none';

    if (type === 'session') {
        const month = document.getElementById('invoiceMonth')?.value || '';
        document.getElementById('liDate').value = month ? month + '-01' : '';
    }

    modal.classList.add('open');
    setTimeout(() => document.getElementById('liDesc').focus(), 100);
}

window.addPenalty = function(idx) { openLineItemModal(idx, 'penalty'); };
window.addDiscount = function(idx) { openLineItemModal(idx, 'discount'); };
window.addAddon = function(idx) { openLineItemModal(idx, 'addon'); };

window.changeTier = function(playerIdx, tierId) {
    const pd = _playerInvoiceData[playerIdx];
    _playerTierOverrides[pd.player.id] = tierId || null;

    // Rebuild ONLY this player's session line items (preserve manual penalties/discounts/addons)
    const sessionDates = pd.sessionsAttended.map(s => s.date);
    const rateInfo = getSessionRate(sessionDates, tierId || null);
    pd.rateInfo = rateInfo;

    // Remove old session AND auto-discount line items, keep manual penalties/addons
    const manualItems = pd.lineItems.filter(li => li.type === 'penalty' || li.type === 'addon');
    const sessionItems = [];

    if (rateInfo.monthly) {
        sessionItems.push({ date: '', description: `${rateInfo.tierName} (${pd.sessionsAttended.length} sessions)`, amount: rateInfo.total, type: 'session' });
        pd.sessionsAttended.forEach(s => {
            sessionItems.push({ date: s.date, description: `  ${s.title || 'Session'}`, amount: 0, type: 'session' });
        });
    } else {
        pd.sessionsAttended.forEach(s => {
            sessionItems.push({ date: s.date, description: `Training Session — ${s.title || 'Session'}`, amount: rateInfo.rate, type: 'session' });
        });
    }

    // Re-apply auto-discounts with the new rate
    const discountItems = [];
    const discountRules = _pricingRules.filter(r => r.type === 'discount');
    const newEffectiveRate = rateInfo.monthly ? rateInfo.total / Math.max(pd.sessionsAttended.length, 1) : rateInfo.rate;
    discountRules.forEach(d => {
        if (d.conditions?.first_session && pd.sessionsAttended.length > 0) {
            discountItems.push({ date: '', description: d.name, amount: -newEffectiveRate, type: 'discount' });
        }
    });

    pd.lineItems = [...sessionItems, ...discountItems, ...manualItems];
    recalcPlayer(playerIdx);
};

window.addSessionDay = function(idx) { openLineItemModal(idx, 'session'); };

function recalcPlayer(idx) {
    const pd = _playerInvoiceData[idx];
    let subtotal = 0, discount = 0, penalties = 0;
    pd.lineItems.forEach(li => {
        if (li.type === 'discount') discount += Math.abs(li.amount);
        else if (li.type === 'penalty') penalties += li.amount;
        else subtotal += li.amount;
    });
    pd.subtotal = subtotal;
    pd.discount = discount;
    pd.penalties = penalties;
    pd.total = subtotal - discount + penalties;

    // Replace card in-place, keep it open
    const month = document.getElementById('invoiceMonth')?.value || '';
    const oldCard = document.querySelector(`.fin-player-card[data-idx="${idx}"]`);
    if (oldCard) {
        const wasOpen = document.getElementById(`playerDetail-${idx}`)?.style.display !== 'none';
        oldCard.outerHTML = renderPlayerPreviewCard(pd, idx, month);
        // Re-open if it was open before
        if (wasOpen) {
            const newDetail = document.getElementById(`playerDetail-${idx}`);
            if (newDetail) newDetail.style.display = '';
            document.querySelector(`.fin-player-card[data-idx="${idx}"] .fin-chevron`)?.classList.add('open');
        }
    }
}

// ── Save invoices ──
window.generateSingleInvoice = async function(idx, month) {
    const pd = _playerInvoiceData[idx];
    const row = {
        club_id: _clubId,
        player_id: pd.player.id,
        month,
        status: 'draft',
        subtotal: pd.subtotal,
        discount: pd.discount,
        penalties: pd.penalties,
        total: pd.total,
        line_items: pd.lineItems,
        created_by: _userId,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('invoices').upsert(row, { onConflict: 'club_id,player_id,month' });
    if (error) { showToast('Failed to save invoice: ' + error.message, 'error'); return; }
    showToast(`Invoice for ${pd.player.name} saved`, 'success');
    pd.existingInvoice = { status: 'draft' };
    renderInvoicePreviews(month);
};

async function generateAllInvoices() {
    const month = document.getElementById('invoiceMonth')?.value;
    if (!month || !_playerInvoiceData.length) return;

    const rows = _playerInvoiceData.map(pd => ({
        club_id: _clubId,
        player_id: pd.player.id,
        month,
        status: 'draft',
        subtotal: pd.subtotal,
        discount: pd.discount,
        penalties: pd.penalties,
        total: pd.total,
        line_items: pd.lineItems,
        created_by: _userId,
        updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('invoices').upsert(rows, { onConflict: 'club_id,player_id,month' });
    if (error) { showToast('Failed to generate invoices: ' + error.message, 'error'); return; }
    showToast(`${rows.length} invoices generated`, 'success');
    _playerInvoiceData.forEach(pd => { pd.existingInvoice = { status: 'draft' }; });
    renderInvoicePreviews(month);
}

// ═══════════════════════════════════════════════════════════
//  TAB 3: INVOICE HISTORY
// ═══════════════════════════════════════════════════════════
async function loadInvoiceHistory() {
    // Set default month filter to current month
    const histMonth = document.getElementById('historyMonth');
    if (histMonth && !histMonth.value) {
        const now = new Date();
        histMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    loadInvoiceHistoryFiltered();
}

window.loadInvoiceHistoryFiltered = async function() {
    const container = document.getElementById('invoiceHistoryArea');
    const month = document.getElementById('historyMonth')?.value || '';
    const statusFilter = document.getElementById('historyStatusFilter')?.value || 'all';

    container.innerHTML = '<div class="fin-loading"><i class="fas fa-spinner fa-spin"></i> Loading invoices...</div>';

    let query = supabase.from('invoices').select('*').eq('club_id', _clubId)
        .order('created_at', { ascending: false }).limit(200);
    if (month) query = query.eq('month', month);
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error) { container.innerHTML = '<div class="fin-empty"><p>Failed to load invoices</p></div>'; return; }
    _invoices = data || [];

    if (!_invoices.length) {
        const label = month ? new Date(month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
        container.innerHTML = `<div class="fin-empty"><i class="fas fa-file-invoice"></i><p>No invoices found${label ? ' for ' + label : ''}${statusFilter !== 'all' ? ' with status "' + statusFilter + '"' : ''}.</p></div>`;
        return;
    }

    const allPlayers = squadManager.getPlayers({});
    const playerMap = {};
    allPlayers.forEach(p => { playerMap[p.id] = p.name; });

    // Summary stats
    const totalAmount = _invoices.reduce((sum, i) => sum + Number(i.total), 0);
    const paidCount = _invoices.filter(i => i.status === 'paid').length;
    const paidAmount = _invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total), 0);
    const outstanding = totalAmount - paidAmount;

    let html = `
        <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
            <div style="background:var(--bg-body);border:1px solid var(--border-light);border-radius:10px;padding:12px 20px;flex:1;min-width:120px;text-align:center;">
                <div style="font-size:1.3rem;font-weight:800;color:var(--text-primary);">${_invoices.length}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Invoices</div>
            </div>
            <div style="background:var(--bg-body);border:1px solid var(--border-light);border-radius:10px;padding:12px 20px;flex:1;min-width:120px;text-align:center;">
                <div style="font-size:1.3rem;font-weight:800;color:var(--text-primary);">R${totalAmount.toFixed(0)}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Total</div>
            </div>
            <div style="background:var(--bg-body);border:1px solid var(--border-light);border-radius:10px;padding:12px 20px;flex:1;min-width:120px;text-align:center;">
                <div style="font-size:1.3rem;font-weight:800;color:#10b981;">${paidCount}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Paid</div>
            </div>
            <div style="background:var(--bg-body);border:1px solid var(--border-light);border-radius:10px;padding:12px 20px;flex:1;min-width:120px;text-align:center;">
                <div style="font-size:1.3rem;font-weight:800;color:${outstanding > 0 ? '#ef4444' : '#10b981'};">R${outstanding.toFixed(0)}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Outstanding</div>
            </div>
        </div>
    `;

    html += _invoices.map(inv => {
        // Count actual sessions (for monthly tiers, count the zero-amount breakdown rows; for per-session, count all)
        const allSessionItems = (inv.line_items || []).filter(li => li.type === 'session');
        const zeroAmtSessions = allSessionItems.filter(li => li.amount === 0).length;
        const sessions = zeroAmtSessions > 0 ? zeroAmtSessions : allSessionItems.length;
        const playerName = playerMap[inv.player_id] || 'Unknown';
        const updated = inv.updated_at ? new Date(inv.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

        return `
        <div class="fin-invoice-card" data-invoice-id="${inv.id}">
            <div class="fin-inv-player">${esc(playerName)}</div>
            <div class="fin-inv-meta">
                <span><i class="fas fa-clipboard-list" style="margin-right:3px;"></i>${sessions} sessions</span>
                ${updated ? `<span><i class="fas fa-clock" style="margin-right:3px;"></i>${updated}</span>` : ''}
            </div>
            <div class="fin-inv-amount">R${Number(inv.total).toFixed(2)}</div>
            <span class="fin-status-badge ${inv.status}">${inv.status.toUpperCase()}</span>
            <div class="fin-inv-actions">
                <select onchange="updateInvoiceStatus('${inv.id}', this.value)" class="fin-status-select" title="Change status">
                    ${['draft','sent','paid','overdue','cancelled'].map(s => `<option value="${s}" ${inv.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
                </select>
                <button class="fin-icon-btn" onclick="exportSavedInvoicePDF('${inv.id}')" title="Export PDF"><i class="fas fa-file-pdf"></i></button>
                <button class="fin-icon-btn danger" onclick="deleteInvoice('${inv.id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = html;
};

window.updateInvoiceStatus = async function(id, newStatus) {
    const { error } = await supabase.from('invoices').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { showToast('Failed to update status', 'error'); return; }
    // Update badge inline
    const row = document.querySelector(`[data-invoice-id="${id}"]`);
    if (row) {
        row.dataset.status = newStatus;
        const badge = row.querySelector('.fin-status-badge');
        if (badge) { badge.className = `fin-status-badge ${newStatus}`; badge.textContent = newStatus; }
    }
    showToast('Status updated', 'success');
};

window.deleteInvoice = async function(id) {
    if (!confirm('Delete this invoice?')) return;
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) { showToast('Failed to delete', 'error'); return; }
    showToast('Invoice deleted', 'success');
    loadInvoiceHistory();
};

// ═══════════════════════════════════════════════════════════
//  PDF EXPORT
// ═══════════════════════════════════════════════════════════
window.exportInvoicePDF = async function(playerIdx, month) {
    const pd = _playerInvoiceData[playerIdx];
    if (!pd) return;
    showToast('Generating PDF...', 'info');
    await buildInvoicePDF(pd.player, pd.lineItems, pd.subtotal, pd.discount, pd.penalties, pd.total, month);
};

window.exportSavedInvoicePDF = async function(invoiceId) {
    let inv = _invoices.find(i => i.id === invoiceId);
    if (!inv) {
        // Fetch directly if history hasn't been loaded yet
        const { data } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
        if (!data) { showToast('Invoice not found', 'error'); return; }
        inv = data;
    }
    const player = squadManager.getPlayers({}).find(p => p.id === inv.player_id);
    if (!player) { showToast('Player not found', 'error'); return; }
    showToast('Generating PDF...', 'info');
    await buildInvoicePDF(player, inv.line_items || [], Number(inv.subtotal), Number(inv.discount), Number(inv.penalties), Number(inv.total), inv.month);
};

async function buildInvoicePDF(player, lineItems, subtotal, discount, penalties, total, month) {
    if (!window.jspdf) { showToast('PDF library not loaded', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const PW = doc.internal.pageSize.getWidth();  // ~210
    const PH = doc.internal.pageSize.getHeight(); // ~297
    const margin = 18;
    const contentW = PW - margin * 2;
    const colDate = margin + 2;
    const colDesc = margin + 34;
    const colAmt = PW - margin - 2;
    const descMaxW = colAmt - colDesc - 20;

    const clubName = _profile?.clubs?.name || 'Football Hub';
    const displayName = _profile?.clubs?.settings?.branding?.club_display_name || clubName;
    const logoUrl = _profile?.clubs?.settings?.branding?.logo_url || null;
    const monthLabel = new Date(month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const invoiceNum = `INV-${month.replace('-', '')}-${player.name.replace(/\s+/g, '').substring(0, 4).toUpperCase()}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const sessionCount = lineItems.filter(li => li.type === 'session').length;

    // ── Load club logo for header ──
    let logoData = null;
    if (logoUrl) {
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = logoUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            logoData = canvas.toDataURL('image/png');
        } catch (e) { /* logo load failed — proceed without */ }
    }

    // ── Header banner (dark navy) ──
    doc.setFillColor(13, 27, 42);
    doc.rect(0, 0, PW, 46, 'F');

    // Accent stripe
    doc.setFillColor(0, 196, 154);
    doc.rect(0, 46, PW, 2.5, 'F');

    // Club logo in header (left side, maintains aspect ratio)
    let textStartX = margin;
    if (logoData) {
        try {
            const imgProps = doc.getImageProperties(logoData);
            const maxH = 34, maxW = 40;
            const ratio = imgProps.width / imgProps.height;
            let logoW = maxH * ratio, logoH = maxH;
            if (logoW > maxW) { logoW = maxW; logoH = maxW / ratio; }
            const logoY = 6 + (maxH - logoH) / 2; // vertically center
            doc.addImage(logoData, 'PNG', margin, logoY, logoW, logoH);
            textStartX = margin + logoW + 4;
        } catch (e) { /* image add failed */ }
    }

    // Header text
    doc.setTextColor(255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', textStartX, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 210, 230);
    doc.text(displayName.toUpperCase(), textStartX, 30);

    // Right side: invoice meta
    doc.setTextColor(255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(invoiceNum, PW - margin, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 210, 230);
    doc.text(`Date: ${dateStr}`, PW - margin, 24, { align: 'right' });
    doc.text(`Period: ${monthLabel}`, PW - margin, 32, { align: 'right' });

    // ── Bill To section ──
    let y = 60;
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL TO', margin, y);

    // Right side: invoice summary box
    doc.setFontSize(8);
    doc.text('SUMMARY', PW - margin - 60, y);

    y += 7;
    doc.setTextColor(30);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(player.name, margin, y);

    // Summary values on the right
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text(`Sessions: ${sessionCount}`, PW - margin - 60, y);

    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    const squadName = squadManager.getSquads().find(s => s.id === player.squadId)?.name || '';
    if (squadName) { doc.text(squadName, margin, y); }
    doc.text(`Total Due: R${total.toFixed(2)}`, PW - margin - 60, y);

    // ── Divider ──
    y += 10;
    doc.setDrawColor(230);
    doc.setLineWidth(0.5);
    doc.line(margin, y, PW - margin, y);

    // ── Line items table header ──
    y += 6;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y - 3, contentW, 10, 2, 2, 'F');
    doc.setTextColor(100);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('DATE', colDate, y + 3.5);
    doc.text('DESCRIPTION', colDesc, y + 3.5);
    doc.text('AMOUNT (R)', colAmt, y + 3.5, { align: 'right' });
    y += 12;

    // ── Line items ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    lineItems.forEach((li, idx) => {
        if (y > PH - 50) { doc.addPage(); y = 20; }

        // Alternate row shading
        if (idx % 2 === 0) {
            doc.setFillColor(252, 252, 253);
            doc.rect(margin, y - 4, contentW, 8, 'F');
        }

        // Zero-amount informational rows (session breakdown under monthly tier)
        if (li.amount === 0) {
            doc.setTextColor(140);
            doc.setFontSize(8);
            doc.text(li.date || '', colDate, y);
            doc.text((li.description || '').trim(), colDesc, y);
            doc.text('—', colAmt, y, { align: 'right' });
            y += 5;
            doc.setFontSize(9);
            return;
        }

        // Color by type
        if (li.type === 'discount') doc.setTextColor(16, 185, 129);
        else if (li.type === 'penalty') doc.setTextColor(220, 50, 50);
        else doc.setTextColor(40, 40, 40);

        // Date
        doc.text(li.date || '—', colDate, y);

        // Description (with word wrap for long text)
        const descLines = doc.splitTextToSize(li.description || '', descMaxW);
        doc.text(descLines[0] || '', colDesc, y);

        // Amount
        const amtStr = li.amount < 0 ? `-R${Math.abs(li.amount).toFixed(2)}` : `R${li.amount.toFixed(2)}`;
        doc.text(amtStr, colAmt, y, { align: 'right' });

        y += 7;
        // Additional wrapped lines
        for (let i = 1; i < descLines.length; i++) {
            doc.setTextColor(120);
            doc.text(descLines[i], colDesc, y);
            y += 5;
        }
    });

    // ── Totals section ──
    y += 6;
    doc.setDrawColor(220);
    doc.setLineWidth(0.3);
    doc.line(PW - margin - 85, y, PW - margin, y);
    y += 8;

    const totalsX = PW - margin - 85;
    doc.setFontSize(9);

    // Subtotal
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal', totalsX, y);
    doc.setTextColor(40);
    doc.text(`R${subtotal.toFixed(2)}`, colAmt, y, { align: 'right' });
    y += 7;

    // Discounts
    if (discount > 0) {
        doc.setTextColor(16, 185, 129);
        doc.text('Discounts', totalsX, y);
        doc.text(`-R${discount.toFixed(2)}`, colAmt, y, { align: 'right' });
        y += 7;
    }

    // Penalties
    if (penalties > 0) {
        doc.setTextColor(220, 50, 50);
        doc.text('Penalties', totalsX, y);
        doc.text(`+R${penalties.toFixed(2)}`, colAmt, y, { align: 'right' });
        y += 7;
    }

    // Total Due box
    y += 2;
    doc.setFillColor(13, 27, 42);
    doc.roundedRect(totalsX - 2, y - 5, 89, 14, 2, 2, 'F');
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL DUE', totalsX + 2, y + 4);
    doc.setFontSize(12);
    doc.text(`R${total.toFixed(2)}`, colAmt, y + 4, { align: 'right' });

    // ── Footer ──
    doc.setDrawColor(0, 196, 154);
    doc.setLineWidth(1);
    doc.line(0, PH - 20, PW, PH - 20);

    doc.setTextColor(140);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${displayName}  |  Invoice ${invoiceNum}  |  Generated ${dateStr}`, PW / 2, PH - 12, { align: 'center' });
    doc.text('Powered by Sentinel Football Hub', PW / 2, PH - 7, { align: 'center' });

    // ── Download ──
    const filename = `${invoiceNum}_${player.name.replace(/\s+/g, '_')}.pdf`;
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast('PDF exported', 'success');
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
