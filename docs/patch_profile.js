const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'player-profile.html');
let content = fs.readFileSync(filePath, 'utf8');

// Find the location by looking for the profSquad span followed by the closing of the name div
// After the previous edit, the file goes:
//   <span id="profSquad">Squad\r\n                                         Name</span></p>\r\n                            </div>\r\n\r\n                        </div>
// We need to insert the button div after the </div> that closes the left name column

const markerCRLF = 'Name</span></p>\r\n                            </div>\r\n\r\n                        </div>';
const markerLF = 'Name</span></p>\n                            </div>\n\n                        </div>';

const buttonHtml = '<div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">' +
    '<button id="btnToggleEditProfile" class="dash-btn outline sm" style="height: fit-content; align-self: center;">' +
    '<i class="fas fa-edit"></i> Edit Info</button>' +
    '<button id="btnProfileAssignSquad" class="dash-btn outline sm" style="height: fit-content; align-self: center; color: #2563eb; border-color: #93c5fd;">' +
    '<i class="fas fa-exchange-alt"></i> Assign Squad</button>' +
    '<button id="btnProfileDeletePlayer" class="dash-btn sm" style="height: fit-content; align-self: center; background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5;">' +
    '<i class="fas fa-trash-alt"></i> Delete</button>' +
    '</div>';

if (content.includes(markerCRLF)) {
    const replacementCRLF = 'Name</span></p>\r\n                            </div>\r\n                            ' +
        buttonHtml + '\r\n                        </div>';
    content = content.replace(markerCRLF, replacementCRLF);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('OK CRLF patched');
} else if (content.includes(markerLF)) {
    const replacementLF = 'Name</span></p>\n                            </div>\n                            ' +
        buttonHtml + '\n                        </div>';
    content = content.replace(markerLF, replacementLF);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('OK LF patched');
} else {
    console.error('BOTH markers failed. Dumping profSquad area:');
    const idx = content.indexOf('profSquad');
    console.log(JSON.stringify(content.substring(idx, idx + 300)));
}

['btnToggleEditProfile', 'btnProfileAssignSquad', 'btnProfileDeletePlayer'].forEach(id => {
    console.log(content.includes(id) ? 'OK' : 'FAIL', id);
});
