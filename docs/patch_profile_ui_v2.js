const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'player-profile-ui.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the initProfileUI function and the empty space inside the try block
const searchStr = 'window.location.href = \'players.html\';\r\n            return;\r\n        }\r\n\r\n\r\n    } catch (err) {';
const searchStrLF = 'window.location.href = \'players.html\';\n            return;\n        }\n\n\n    } catch (err) {';

const newCode = `        populateProfileHeader();
        setupTabs();
        setupAssessmentForm();
        setupOverviewEditor();
        setupAnalysisTab();
        renderAssessmentHistory();
        renderOverviewHistory();

        // --- Profile Header Action Buttons ---
        const btnProfileDelete = document.getElementById('btnProfileDeletePlayer');
        if (btnProfileDelete) {
            btnProfileDelete.addEventListener('click', async () => {
                if (!confirm(\`Delete \${currentPlayer.name}? This cannot be undone.\`)) return;
                const ok = await squadManager.deletePlayer(currentPlayerId);
                if (ok) {
                    window.location.href = 'players.html';
                } else {
                    alert('Failed to delete player.');
                }
            });
        }

        const btnProfileAssign = document.getElementById('btnProfileAssignSquad');
        if (btnProfileAssign) {
            btnProfileAssign.addEventListener('click', () => {
                const squads = squadManager.getSquads();
                if (!squads.length) { alert('No squads available.'); return; }
                const options = squads.map(s => \`<option value="\${s.id}" \${s.id === currentPlayer.squadId ? 'selected' : ''}>\${s.name}</option>\`).join('');
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay active';
                overlay.style.zIndex = '9999';
                overlay.innerHTML = \`
                    <div class="modal-container" style="max-width: 400px;">
                        <div class="modal-header">
                            <h2>Assign Squad</h2>
                            <button class="btn-close-modal" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                        </div>
                        <div class="modal-body" style="padding: 24px;">
                            <p style="margin-bottom: 12px; font-size: 0.9rem; color: #64748b;">Assign <strong>\${currentPlayer.name}</strong> to a squad:</p>
                            <select id="profileSquadSelect" class="form-control-bubble">\${options}</select>
                        </div>
                        <div class="modal-footer">
                            <button class="dash-btn outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                            <button class="dash-btn primary" id="btnConfirmProfileAssign">Assign</button>
                        </div>
                    </div>\`;
                document.body.appendChild(overlay);
                overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
                document.getElementById('btnConfirmProfileAssign').addEventListener('click', async () => {
                    const newSquadId = document.getElementById('profileSquadSelect').value;
                    currentPlayer.squadId = newSquadId;
                    const ok = await squadManager.updatePlayer(currentPlayer);
                    overlay.remove();
                    if (ok) {
                        const squad = squads.find(s => s.id === newSquadId);
                        const profSquadEl = document.getElementById('profSquad');
                        if (profSquadEl && squad) profSquadEl.textContent = squad.name;
                        if (window.showGlobalToast) window.showGlobalToast('Squad updated', 'success');
                    } else { alert('Failed to update squad.'); }
                });
            });
        }`;

let patched = false;
if (content.includes(searchStr)) {
    const replacement = `window.location.href = 'players.html';
            return;
        }

${newCode}

    } catch (err) {`;
    content = content.replace(searchStr, replacement);
    patched = true;
} else if (content.includes(searchStrLF)) {
    const replacement = `window.location.href = 'players.html';
            return;
        }

${newCode.replace(/\r\n/g, '\n')}

    } catch (err) {`;
    content = content.replace(searchStrLF, replacement);
    patched = true;
}

if (patched) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully patched player-profile-ui.js');
} else {
    console.log('Could not find target string in player-profile-ui.js');
    // Try simple split and join as fallback
    const marker = 'alert("Player not found.");';
    if (content.includes(marker)) {
        console.log('Found alternative marker');
    }
}
