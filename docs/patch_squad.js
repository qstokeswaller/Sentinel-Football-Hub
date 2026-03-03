const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'squad.html');
let content = fs.readFileSync(filePath, 'utf8');

// Find where btnAssessSquad section ends (the 2 closing divs of the sheet-header)
const assessIdx = content.indexOf('btnAssessSquad');
if (assessIdx === -1) { console.error('btnAssessSquad not found'); process.exit(1); }

// After the assess button, we have: </button>\r\n                    </div>\r\n                </div>\r\n (closes the sheet-header inner divs)
const closingPattern = '                </div>\r\n                </div>\r\n';
const closingIdx = content.indexOf(closingPattern, assessIdx);
if (closingIdx === -1) {
    // try LF
    const closingPatternLF = '                </div>\n                </div>\n';
    const closingIdxLF = content.indexOf(closingPatternLF, assessIdx);
    if (closingIdxLF === -1) { console.error('closing divs not found after assessIdx'); process.exit(1); }
    const endPos = closingIdxLF + closingPatternLF.length;
    console.log('Using LF. Inserting at pos', endPos);
    const insertBlock = `                <!-- Table View -->\n                <div id="squadDetailTableWrapper" style="overflow-x: auto; display: none;">\n                    <table class="table" style="width: 100%; border-collapse: collapse;">\n                        <thead>\n                            <tr>\n                                <th>Name</th>\n                                <th>Position</th>\n                                <th>Age</th>\n                                <th>Height</th>\n                                <th>Weight</th>\n                                <th>Foot</th>\n                                <th>Actions</th>\n                            </tr>\n                        </thead>\n                        <tbody id="squadDetailTableBody">\n                            <!-- Rows -->\n                        </tbody>\n                    </table>\n                </div>\n                <!-- Grid View (default) -->\n                <div id="squadDetailGridWrapper">\n                    <!-- Populated by JS -->\n                </div>\n            </div>\n\n        </main>\n    </div>\n\n`;
    content = content.substring(0, endPos) + insertBlock + content.substring(endPos);
} else {
    const endPos = closingIdx + closingPattern.length;
    console.log('Using CRLF. Inserting at pos', endPos);
    const insertBlock = `                <!-- Table View -->\r\n                <div id="squadDetailTableWrapper" style="overflow-x: auto; display: none;">\r\n                    <table class="table" style="width: 100%; border-collapse: collapse;">\r\n                        <thead>\r\n                            <tr>\r\n                                <th>Name</th>\r\n                                <th>Position</th>\r\n                                <th>Age</th>\r\n                                <th>Height</th>\r\n                                <th>Weight</th>\r\n                                <th>Foot</th>\r\n                                <th>Actions</th>\r\n                            </tr>\r\n                        </thead>\r\n                        <tbody id="squadDetailTableBody">\r\n                            <!-- Rows -->\r\n                        </tbody>\r\n                    </table>\r\n                </div>\r\n                <!-- Grid View (default) -->\r\n                <div id="squadDetailGridWrapper">\r\n                    <!-- Populated by JS -->\r\n                </div>\r\n            </div>\r\n\r\n        </main>\r\n    </div>\r\n\r\n`;
    content = content.substring(0, endPos) + insertBlock + content.substring(endPos);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Written. Total bytes:', content.length);
['squadDetailTableWrapper', 'squadDetailGridWrapper', 'squadDetailTableBody', '/main>'].forEach(k => {
    console.log(content.includes(k) ? 'OK ' : 'FAIL', k);
});
