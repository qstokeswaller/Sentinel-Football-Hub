const fs = require('fs');
const path = require('path');


let content = fs.readFileSync(filePath, 'utf8');

// Find the unique closing of the try block in initProfileUI
// Unique marker: renderOverviewHistory(); then empty line then } catch
const marker1 = "        renderOverviewHistory();\r\n\r\n    } catch (err) {";
const marker2 = "        renderOverviewHistory();\n\n    } catch (err) {";

const newCode = `        renderOverviewHistory();

        // --- Profile Header Action Buttons ---
        const btnProfileDelete = document.getElementById('btnProfileDeletePlayer');
        if (btnProfileDelete) {
            btnProfileDelete.addEventListener('click', async () => {
                if (!confirm('Delete ' + currentPlayer.name + '? This cannot be undone.')) return;
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
                if (!squads.length) { alert('No squads available. Create one first.'); return; }
                const options = squads.map(s => '<option value="' + s.id + '"' + (s.id === currentPlayer.squadId ? ' selected' : '') + '>' + s.name + '</option>').join('');
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay active';
                overlay.style.cssText = 'z-index:9999;';
                overlay.innerHTML = '<div class="modal-container modal-bubble" style="max-width:380px;"><div class="modal-header-bubble"><h2>Assign Squad</h2><button onclick="this.closest(\\'.modal-overlay\\').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#64748b;">&times;</button></div><div class="modal-body-bubble"><p style="margin-bottom:12px;font-size:.9rem;color:#64748b;">Assign <strong>' + currentPlayer.name + '</strong> to a squad:</p><select id="profileSquadSelect" class="form-control-bubble">' + options + '</select></div><div class="modal-footer-bubble" style="display:flex;gap:12px;justify-content:flex-end;padding:16px 24px;"><button class="dash-btn outline" onclick="this.closest(\\'.modal-overlay\\').remove()">Cancel</button><button class="dash-btn primary" id="btnConfirmProfileAssign">Assign</button></div></div>';
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
        }

    } catch (err) {`;

if (content.includes(marker1)) {
    content = content.replace(marker1, newCode);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('OK CRLF patched');
} else if (content.includes(marker2)) {
    content = content.replace(marker2, newCode.replace(/\r\n/g, '\n'));
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('OK LF patched');
} else {
    const idx = content.indexOf('renderOverviewHistory');
    console.error('NOMATCH. Context:\n' + JSON.stringify(content.substring(idx, idx + 200)));
}

['btnProfileDeletePlayer', 'btnProfileAssignSquad', 'btnConfirmProfileAssign'].forEach(id => {
    console.log(content.includes(id) ? 'OK' : 'FAIL', id);
});
