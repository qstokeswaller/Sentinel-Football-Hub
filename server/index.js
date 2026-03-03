const express = require('express');
const cors = require('cors');
const db = require('./db');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3002;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Simple request logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../data/uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.get('/api/squads', (req, res) => {
    db.all('SELECT * FROM squads', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => ({
            ...r,
            leagues: JSON.parse(r.leagues || '[]'),
            coaches: JSON.parse(r.coaches || '[]')
        }));
        res.json(parsed);
    });
});

app.post('/api/squads', (req, res) => {
    const { id, name, ageGroup, leagues, coaches } = req.body;
    const sql = `INSERT INTO squads (id, name, ageGroup, leagues, coaches) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [id, name, ageGroup, JSON.stringify(leagues), JSON.stringify(coaches)], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id });
    });
});

// --- PLAYERS API ---
app.get('/api/players', (req, res) => {
    const { squadId } = req.query;
    let sql = 'SELECT * FROM players';
    const params = [];
    if (squadId) {
        sql += ' WHERE squadId = ?';
        params.push(squadId);
    }
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => ({
            ...r,
            documents: JSON.parse(r.documents || '[]'),
            highlights: JSON.parse(r.highlights || '[]'),
            analysisVideos: JSON.parse(r.analysisVideos || '[]')
        }));
        res.json(parsed);
    });
});

app.post('/api/players', (req, res) => {
    const { id, name, squadId, age, position, height, weight, foot, previousClubs, bio, documents, highlights, analysisVideos, createdAt } = req.body;
    const sql = `INSERT INTO players (id, name, squadId, age, position, height, weight, foot, previousClubs, bio, documents, highlights, analysisVideos, createdAt) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [
        id, name, squadId, age, position, height, weight, foot, previousClubs, bio,
        JSON.stringify(documents || []),
        JSON.stringify(highlights || []),
        JSON.stringify(analysisVideos || []),
        createdAt
    ], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id });
    });
});

app.patch('/api/players/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates).map(v => (typeof v === 'object' ? JSON.stringify(v) : v));
    const sql = `UPDATE players SET ${fields} WHERE id = ?`;
    db.run(sql, [...values, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

app.delete('/api/players/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM players WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// --- ASSESSMENTS API ---
app.get('/api/players/:id/assessments', (req, res) => {
    const { id } = req.params;
    db.all('SELECT * FROM assessments WHERE playerId = ? ORDER BY date DESC', [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => {
            let feedback = { strength: 'None', comments: 'No feedback provided' };
            try {
                if (r.notes && r.notes.startsWith('{')) {
                    feedback = JSON.parse(r.notes);
                }
            } catch (e) {
                console.warn(`Failed to parse feedback for assessment ${r.id}`);
            }
            return {
                ...r,
                ratings: JSON.parse(r.ratings || '{}'),
                evaluator: r.author,
                feedback: feedback
            };
        });
        res.json(parsed);
    });
});

app.post('/api/assessments', (req, res) => {
    const { id, playerId, matchId, date, type, ratings, notes, attachment, author, createdAt } = req.body;
    const sql = `REPLACE INTO assessments (id, playerId, matchId, date, type, ratings, notes, attachment, author, createdAt) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [id, playerId, matchId, date, type, JSON.stringify(ratings || {}), notes, attachment, author, createdAt], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id });
    });
});

// --- DEV STRUCTURES API ---
app.get('/api/players/:id/dev-structures', (req, res) => {
    const { id } = req.params;
    db.all('SELECT * FROM dev_structures WHERE playerId = ? ORDER BY date DESC', [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => ({
            ...r,
            structures: JSON.parse(r.structures || '{}')
        }));
        res.json(parsed);
    });
});

app.get('/api/dev-structures/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM dev_structures WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Dev structure not found' });
        res.json({
            ...row,
            structures: JSON.parse(row.structures || '{}')
        });
    });
});

app.get('/api/assessments/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM assessments WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Assessment not found' });

        let feedback = { strength: 'None', comments: 'No feedback provided' };
        try {
            if (row.notes && row.notes.startsWith('{')) {
                feedback = JSON.parse(row.notes);
            }
        } catch (e) {
            console.warn(`Failed to parse feedback for assessment ${row.id}`);
        }

        res.json({
            ...row,
            ratings: JSON.parse(row.ratings || '{}'),
            feedback: feedback,
            evaluator: row.author
        });
    });
});

app.delete('/api/assessments/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM assessments WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/dev-structures/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM dev_structures WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

app.post('/api/dev-structures', (req, res) => {
    const { id, playerId, date, structures, createdAt } = req.body;
    const sql = `REPLACE INTO dev_structures (id, playerId, date, structures, createdAt) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [id, playerId, date, JSON.stringify(structures || {}), createdAt], function (err) {
        if (err) {
            console.error('SERVER ERROR: Failed to insert dev_structure:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id });
    });
});

// --- SQUAD ASSESSMENTS API ---
app.get('/api/squads/:id/assessments', (req, res) => {
    const { id } = req.params;
    db.all('SELECT * FROM squad_assessments WHERE squadId = ? ORDER BY date DESC', [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => ({
            ...r,
            ratings: JSON.parse(r.ratings || '{}'),
            feedback: JSON.parse(r.feedback || '{}')
        }));
        res.json(parsed);
    });
});

app.post('/api/squad-assessments', (req, res) => {
    const { id, squadId, date, context, ratings, feedback, author, createdAt } = req.body;
    const sql = `INSERT INTO squad_assessments (id, squadId, date, context, ratings, feedback, author, createdAt) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [id, squadId, date, context, JSON.stringify(ratings || {}), JSON.stringify(feedback || {}), author, createdAt], function (err) {
        if (err) {
            console.error('SERVER ERROR: Failed to insert squad_assessment:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id });
    });
});

app.delete('/api/squad-assessments/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM squad_assessments WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

app.get('/api/squad-assessments/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM squad_assessments WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json({
            ...row,
            ratings: JSON.parse(row.ratings || '{}'),
            feedback: JSON.parse(row.feedback || '{}')
        });
    });
});

// --- MATCHES API ---
app.get('/api/matches', (req, res) => {
    db.all('SELECT * FROM matches', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => ({
            ...r,
            stats: JSON.parse(r.stats || '{}'),
            videos: JSON.parse(r.videos || '[]'),
            links: JSON.parse(r.links || '[]'),
            isPast: !!r.isPast
        }));
        res.json(parsed);
    });
});

app.get('/api/matches/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM matches WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Match not found' });

        const parsed = {
            ...row,
            stats: JSON.parse(row.stats || '{}'),
            videos: JSON.parse(row.videos || '[]'),
            links: JSON.parse(row.links || '[]'),
            isPast: !!row.isPast
        };
        res.json(parsed);
    });
});

app.post('/api/matches', (req, res) => {
    const { id, date, time, venue, opponent, competition, isPast, homeScore, awayScore, squadId, homeTeam, awayTeam, ourSide, result, notes, stats, videos, links } = req.body;
    const sql = `INSERT INTO matches (id, date, time, venue, opponent, competition, isPast, homeScore, awayScore, squadId, homeTeam, awayTeam, ourSide, result, notes, stats, videos, links) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [id, date, time, venue, opponent, competition, isPast ? 1 : 0, homeScore, awayScore, squadId, homeTeam, awayTeam, ourSide, result, notes, JSON.stringify(stats), JSON.stringify(videos), JSON.stringify(links)], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id, date, time, venue, opponent, competition, isPast, homeScore, awayScore, squadId, homeTeam, awayTeam, ourSide, result, notes, stats, videos, links });
    });
});

app.patch('/api/matches/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates).map(v => (typeof v === 'object' ? JSON.stringify(v) : v));
    const sql = `UPDATE matches SET ${fields} WHERE id = ?`;

    console.log(`Backend: Updating match ${id}`, {
        fields: Object.keys(updates),
        statsKeys: updates.stats ? Object.keys(updates.stats) : 'N/A'
    });

    db.run(sql, [...values, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

app.delete('/api/matches/:id', (req, res) => {
    const { id } = req.params;
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        // Delete assessments linked to this match
        db.run('DELETE FROM assessments WHERE matchId = ?', [id], (err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
            }
            // Delete the match itself
            db.run('DELETE FROM matches WHERE id = ?', [id], function (err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }
                db.run('COMMIT');
                res.json({ deleted: this.changes });
            });
        });
    });
});

// --- DRILLS API ---
app.get('/api/drills', (req, res) => {
    db.all('SELECT * FROM drills ORDER BY orderIndex ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => {
            let drawingData = [];
            try {
                if (r.drawingData) {
                    drawingData = typeof r.drawingData === 'string' ? JSON.parse(r.drawingData) : r.drawingData;
                }
            } catch (e) {
                console.warn(`Failed to parse drawingData for drill ${r.id}`, e);
            }
            return { ...r, drawingData };
        });
        res.json(parsed);
    });
});

app.post('/api/drills', (req, res) => {
    const { id, sessionId, title, description, pitchType, drawingData, image, category, author, team, orderIndex } = req.body;
    // For individual drills, sessionId might be null or a generic library placeholder
    const sql = `INSERT INTO drills (id, sessionId, title, description, pitchType, drawingData, image, category, author, team, orderIndex) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [id, sessionId, title, description, pitchType, JSON.stringify(drawingData), image, category, author, team, orderIndex || 0], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id });
    });
});

// --- TEMPLATES API ---
app.get('/api/templates', (req, res) => {
    const sql = `
        SELECT s.*,
        COALESCE(s.image, (SELECT image FROM drills WHERE sessionId = s.id ORDER BY orderIndex ASC LIMIT 1)) as image
        FROM sessions s
        WHERE s.isTemplate = 1
        ORDER BY s.createdAt DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => ({
            ...r,
            playerIds: JSON.parse(r.playerIds || '[]')
        }));
        res.json(parsed);
    });
});

app.patch('/api/sessions/:id/template', (req, res) => {
    const { id } = req.params;
    const { isTemplate } = req.body;
    db.run('UPDATE sessions SET isTemplate = ? WHERE id = ?', [isTemplate ? 1 : 0, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

// --- SESSIONS API ---
app.get('/api/sessions', (req, res) => {
    const sql = `
        SELECT s.*, 
        COALESCE(s.image, (SELECT image FROM drills WHERE sessionId = s.id ORDER BY orderIndex ASC LIMIT 1)) as image
        FROM sessions s 
        ORDER BY createdAt DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => ({
            ...r,
            playerIds: JSON.parse(r.playerIds || '[]')
        }));
        res.json(parsed);
    });
});

// Removed redundant /api/drills route

app.get('/api/sessions/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM sessions WHERE id = ?', [id], (err, session) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!session) return res.status(404).json({ error: 'Session not found' });

        db.all('SELECT * FROM drills WHERE sessionId = ? ORDER BY orderIndex ASC', [id], (err, drills) => {
            if (err) return res.status(500).json({ error: err.message });

            const parsedDrills = drills.map(d => {
                let drawingData = [];
                try {
                    if (d.drawingData) {
                        drawingData = typeof d.drawingData === 'string' ? JSON.parse(d.drawingData) : d.drawingData;
                    }
                } catch (e) {
                    console.warn(`Failed to parse drawingData for drill ${d.id} in session ${id}`, e);
                }
                return { ...d, drawingData };
            });

            res.json({
                ...session,
                playerIds: JSON.parse(session.playerIds || '[]'),
                drills: parsedDrills
            });
        });
    });
});

app.post('/api/sessions', (req, res) => {
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const sessionSql = `INSERT INTO sessions (id, title, date, startTime, venue, duration, playersCount, abilityLevel, equipment, purpose, notes, author, team, createdAt, image, playerIds) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const { id, title, date, startTime, venue, duration, playersCount, abilityLevel, equipment, purpose, notes, author, team, createdAt, image, drills, playerIds } = req.body;
        db.run(sessionSql, [id, title, date, startTime, venue, duration, playersCount, abilityLevel, equipment, purpose, notes, author, team, createdAt, image, JSON.stringify(playerIds || [])], (err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
            }

            if (drills && drills.length > 0) {
                const drillSql = `INSERT INTO drills (id, sessionId, title, description, pitchType, drawingData, image, category, author, team, orderIndex) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                const stmt = db.prepare(drillSql);
                drills.forEach((d, index) => {
                    stmt.run(d.id, id, d.title, d.description, d.pitchType, JSON.stringify(d.drawingData), d.image, d.category, d.author || author, d.team || team, index);
                });
                stmt.finalize((err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: err.message });
                    }
                    db.run('COMMIT');
                    res.status(201).json({ id });
                });
            } else {
                db.run('COMMIT');
                res.status(201).json({ id });
            }
        });
    });
});

app.patch('/api/sessions/:id', (req, res) => {
    const { id } = req.params;
    const { drills, ...sessionUpdates } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const updateSessionMetadata = (callback) => {
            if (Object.keys(sessionUpdates).length === 0) return callback(null);
            const fields = Object.keys(sessionUpdates).map(k => `${k} = ?`).join(', ');
            const values = Object.values(sessionUpdates).map(v => (typeof v === 'object' ? JSON.stringify(v) : v));
            const sql = `UPDATE sessions SET ${fields} WHERE id = ?`;
            db.run(sql, [...values, id], callback);
        };

        updateSessionMetadata((err) => {
            if (err) {
                db.run('ROLLBACK');
                console.error('Session update error:', err);
                return res.status(500).json({ error: err.message });
            }

            if (!drills) {
                db.run('COMMIT', (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ updated: true });
                });
                return;
            }

            db.run('DELETE FROM drills WHERE sessionId = ?', [id], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    console.error('Drill delete error:', err);
                    return res.status(500).json({ error: err.message });
                }

                const drillSql = `INSERT INTO drills (id, sessionId, title, description, pitchType, drawingData, image, category, author, team, orderIndex) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                const stmt = db.prepare(drillSql);
                let drillError = null;

                drills.forEach((d, index) => {
                    if (drillError) return;
                    stmt.run(
                        d.id || `drill_${Date.now()}_${index}`,
                        id,
                        d.title,
                        d.description,
                        d.pitchType,
                        JSON.stringify(d.drawingData),
                        d.image,
                        d.category,
                        d.author,
                        d.team,
                        index,
                        (e) => { if (e) drillError = e; }
                    );
                });

                stmt.finalize((err) => {
                    const finalDrillError = err || drillError;
                    if (finalDrillError) {
                        db.run('ROLLBACK');
                        console.error('Drill insert error:', finalDrillError);
                        return res.status(500).json({ error: finalDrillError.message });
                    }
                    db.run('COMMIT', (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ updated: true });
                    });
                });
            });
        });
    });
});

app.delete('/api/sessions/:id', (req, res) => {
    const { id } = req.params;
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run('DELETE FROM drills WHERE sessionId = ?', [id], (err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
            }
            db.run('DELETE FROM sessions WHERE id = ?', [id], function (err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }
                console.log(`Deleted session ${id} and its drills. Changes: ${this.changes}`);
                db.run('COMMIT', (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ deleted: this.changes });
                });
            });
        });
    });
});

// --- REPORTS API ---
app.get('/api/reports', (req, res) => {
    db.all('SELECT * FROM reports ORDER BY date DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const parsed = rows.map(r => ({
            ...r,
            drillNotes: JSON.parse(r.drillNotes || '{}'),
            trainingLoad: JSON.parse(r.trainingLoad || '{}'),
            attachments: JSON.parse(r.attachments || '[]'),
            absentPlayerIds: JSON.parse(r.absentPlayerIds || '[]')
        }));
        res.json(parsed);
    });
});

// GET single report by ID — required by the Reports Hub "view details" modal
app.get('/api/reports/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM reports WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Report not found' });
        res.json({
            ...row,
            drillNotes: JSON.parse(row.drillNotes || '{}'),
            trainingLoad: JSON.parse(row.trainingLoad || '{}'),
            attachments: JSON.parse(row.attachments || '[]'),
            absentPlayerIds: JSON.parse(row.absentPlayerIds || '[]')
        });
    });
});

app.post('/api/reports', (req, res) => {
    const { id, sessionId, date, attendanceCount, attendanceTotal, notes, drillNotes, trainingLoad, intensity, focus, rating, absentPlayerIds, attachments, createdAt } = req.body;

    // Handle attachments (save base64 to disk)
    let processedAttachments = [];
    if (attachments && Array.isArray(attachments)) {
        processedAttachments = attachments.map(att => {
            if (att.data && att.name) {
                // It's a base64 file
                const matches = att.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches) {
                    const buffer = Buffer.from(matches[2], 'base64');
                    const safeName = `report_${id}_${att.name.replace(/[^a-z0-9.]/gi, '_')}`;
                    const filePath = path.join(UPLOADS_DIR, safeName);
                    fs.writeFileSync(filePath, buffer);
                    return { name: att.name, path: `/uploads/${safeName}` };
                }
            }
            return att; // Already processed or invalid
        });
    }

    const sql = `INSERT INTO reports (id, sessionId, date, attendanceCount, attendanceTotal, notes, drillNotes, trainingLoad, intensity, focus, rating, absentPlayerIds, attachments, createdAt) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [
        id, sessionId, date, attendanceCount, attendanceTotal, notes,
        JSON.stringify(drillNotes || {}),
        JSON.stringify(trainingLoad || {}),
        intensity, focus, rating,
        JSON.stringify(absentPlayerIds || []),
        JSON.stringify(processedAttachments),
        createdAt
    ], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id });
    });
});

app.delete('/api/reports/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM reports WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

app.delete('/api/drills/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM drills WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        console.log(`Deleted drill ${id}. Changes: ${this.changes}`);
        res.json({ deleted: this.changes });
    });
});


// --- ANALYTICS API ---

// Player performance ratings: average per category across all assessments
app.get('/api/analytics/player-ratings', (req, res) => {
    const { squadId } = req.query;
    let playerSql = 'SELECT id, name, position, squadId FROM players ORDER BY name ASC';
    const playerParams = [];
    if (squadId && squadId !== 'all') {
        playerSql = 'SELECT id, name, position, squadId FROM players WHERE squadId = ? ORDER BY name ASC';
        playerParams.push(squadId);
    }

    db.all(playerSql, playerParams, (err, players) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all('SELECT playerId, ratings FROM assessments', [], (err2, assessments) => {
            if (err2) return res.status(500).json({ error: err2.message });

            const byPlayer = {};
            assessments.forEach(a => {
                if (!byPlayer[a.playerId]) byPlayer[a.playerId] = [];
                try { byPlayer[a.playerId].push(JSON.parse(a.ratings || '{}')); } catch (e) {}
            });

            const subAvg = (obj, keys) => {
                if (!obj) return null;
                const vals = keys.map(k => obj[k]).filter(v => typeof v === 'number');
                return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            };

            const catAvg = (list, cat, keys) => {
                const vals = list.map(r => subAvg(r[cat], keys)).filter(v => v !== null);
                return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
            };

            const result = players.map(p => {
                const ratings = byPlayer[p.id] || [];
                return {
                    id: p.id,
                    name: p.name,
                    position: p.position || '—',
                    squadId: p.squadId,
                    assessmentCount: ratings.length,
                    tactical: catAvg(ratings, 'tactical', ['positioning', 'decision', 'awareness', 'creativity']),
                    technical: catAvg(ratings, 'technical', ['passing', 'touch', 'control', 'dribbling']),
                    physical: catAvg(ratings, 'physical', ['speed', 'agility', 'stamina', 'strength']),
                    psychological: catAvg(ratings, 'psychological', ['workEthic', 'communication', 'focus', 'resilience'])
                };
            });

            res.json(result);
        });
    });
});

// Attendance: per-player missed sessions for a given month (year + month query params, 1-indexed month)
app.get('/api/analytics/attendance', (req, res) => {
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const { squadId } = req.query;

    const monthStr = String(month).padStart(2, '0');
    const monthStart = `${year}-${monthStr}-01`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonthStr = String(month === 12 ? 1 : month + 1).padStart(2, '0');
    const monthEnd = `${nextYear}-${nextMonthStr}-01`;

    let playerSql = 'SELECT id, name, position, squadId FROM players ORDER BY name ASC';
    const playerParams = [];
    if (squadId && squadId !== 'all') {
        playerSql = 'SELECT id, name, position, squadId FROM players WHERE squadId = ? ORDER BY name ASC';
        playerParams.push(squadId);
    }

    db.all(playerSql, playerParams, (err, players) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(
            `SELECT s.id as sessionId, s.playerIds, r.absentPlayerIds
             FROM sessions s
             JOIN reports r ON r.sessionId = s.id
             WHERE s.date >= ? AND s.date < ?`,
            [monthStart, monthEnd],
            (err2, rows) => {
                if (err2) return res.status(500).json({ error: err2.message });

                const sessions = rows.map(row => ({
                    sessionId: row.sessionId,
                    playerIds: (() => { try { return JSON.parse(row.playerIds || '[]'); } catch (e) { return []; } })(),
                    absentPlayerIds: (() => { try { return JSON.parse(row.absentPlayerIds || '[]'); } catch (e) { return []; } })()
                }));

                const result = players.map(p => {
                    let totalSessions = 0;
                    let missedSessions = 0;

                    sessions.forEach(s => {
                        const expected = s.playerIds.length === 0 || s.playerIds.includes(p.id);
                        if (expected) {
                            totalSessions++;
                            if (s.absentPlayerIds.includes(p.id)) missedSessions++;
                        }
                    });

                    return {
                        id: p.id,
                        name: p.name,
                        position: p.position || '—',
                        squadId: p.squadId,
                        totalSessions,
                        missedSessions,
                        attendedSessions: totalSessions - missedSessions,
                        attendancePct: totalSessions > 0 ? Math.round(((totalSessions - missedSessions) / totalSessions) * 100) : null
                    };
                });

                res.json(result);
            }
        );
    });
});

// Explicitly serve index.html for the root route
app.get('/', (req, res) => {
    const docsPath = path.resolve(__dirname, '..', 'docs');
    res.sendFile('index.html', { root: docsPath }, (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            if (!res.headersSent) {
                res.status(err.status || 500).send('Error loading index page');
            }
        }
    });
});

// Serve static files from the docs directory with caching strictly disabled for development
const docsPath = path.resolve(__dirname, '..', 'docs');
app.use(express.static(docsPath, {
    etag: false,
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

const server = app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});

// Graceful shutdown handlers
function shutdown() {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('HTTP server closed.');
        db.close((err) => {
            if (err) console.error('Error closing database:', err.message);
            else console.log('Database connection closed.');
            process.exit(0);
        });
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
