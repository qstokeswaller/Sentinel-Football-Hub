const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/data.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    // Squads Table
    db.run(`CREATE TABLE IF NOT EXISTS squads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ageGroup TEXT,
        leagues TEXT, -- Stored as JSON string
        coaches TEXT  -- Stored as JSON string
    )`);

    // Players Table
    db.run(`CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        squadId TEXT,
        age TEXT,
        position TEXT,
        height TEXT,
        weight TEXT,
        foot TEXT,
        previousClubs TEXT,
        bio TEXT,
        documents TEXT, -- Stored as JSON string
        createdAt TEXT,
        FOREIGN KEY (squadId) REFERENCES squads (id)
    )`);

    // Matches Table
    db.run(`CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        date TEXT,
        time TEXT,
        venue TEXT,
        opponent TEXT,
        competition TEXT,
        isPast BOOLEAN,
        homeScore INTEGER,
        awayScore INTEGER,
        squadId TEXT,
        stats TEXT,  -- Stored as JSON string {home: {...}, away: {...}}
        videos TEXT, -- Stored as JSON string
        links TEXT,  -- Stored as JSON string
        FOREIGN KEY (squadId) REFERENCES squads (id)
    )`);

    // Sessions Table
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT,
        startTime TEXT,
        venue TEXT,
        duration TEXT,
        playersCount TEXT,
        abilityLevel TEXT,
        equipment TEXT,
        purpose TEXT,
        notes TEXT,
        author TEXT,
        team TEXT,
        createdAt TEXT
    )`);

    // Migration: add startTime column if it doesn't exist yet
    db.run(`ALTER TABLE sessions ADD COLUMN startTime TEXT`, (err) => {
        // Ignore error if column already exists
    });

    // Drills Table (Part of a Session)
    db.run(`CREATE TABLE IF NOT EXISTS drills (
        id TEXT PRIMARY KEY,
        sessionId TEXT,
        title TEXT,
        description TEXT,
        pitchType TEXT,
        drawingData TEXT, -- JSON string for canvas objects
        image TEXT,       -- Base64 PNG snapshot
        category TEXT,    -- For drill library sorting
        author TEXT,
        team TEXT,
        orderIndex INTEGER,
        FOREIGN KEY (sessionId) REFERENCES sessions (id) ON DELETE CASCADE
    )`);

    // Session Reports Table
    db.run(`CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        sessionId TEXT,
        date TEXT,
        attendanceCount INTEGER,
        attendanceTotal INTEGER,
        notes TEXT,
        drillNotes TEXT, -- JSON string { drillId: "note" }
        trainingLoad TEXT, -- JSON string
        intensity TEXT,
        focus TEXT,
        rating INTEGER,
        attachments TEXT, -- JSON string of filenames or base64
        createdAt TEXT,
        FOREIGN KEY (sessionId) REFERENCES sessions (id) ON DELETE SET NULL
    )`);

    // Player Assessments Table
    db.run(`CREATE TABLE IF NOT EXISTS assessments (
        id TEXT PRIMARY KEY,
        playerId TEXT,
        matchId TEXT, -- Link to specific match (optional)
        date TEXT,
        type TEXT,
        ratings TEXT, -- JSON string { technical: 4, tactical: 3, ... }
        notes TEXT,
        attachment TEXT, -- Filename or Base64 of uploaded doc
        author TEXT,
        createdAt TEXT,
        FOREIGN KEY (playerId) REFERENCES players (id) ON DELETE CASCADE
    )`);

    // Development Structures Table (Player Overview History)
    db.run(`CREATE TABLE IF NOT EXISTS dev_structures (
        id TEXT PRIMARY KEY,
        playerId TEXT,
        date TEXT,
        structures TEXT, -- Stored as JSON string { strengths: "...", goals: "..." }
        createdAt TEXT,
        FOREIGN KEY (playerId) REFERENCES players (id) ON DELETE CASCADE
    )`);

    // Squad Assessments Table
    db.run(`CREATE TABLE IF NOT EXISTS squad_assessments (
        id TEXT PRIMARY KEY,
        squadId TEXT,
        date TEXT,
        context TEXT,
        ratings TEXT,  -- Stored as JSON string
        feedback TEXT, -- Stored as JSON string
        author TEXT,
        createdAt TEXT,
        FOREIGN KEY (squadId) REFERENCES squads (id) ON DELETE CASCADE
    )`);

    // Migration logic
    const addColumnIfNotExists = (table, column, type) => {
        db.all(`PRAGMA table_info(${table})`, (err, columns) => {
            if (err) {
                console.error(`Error checking columns for ${table}:`, err);
                return;
            }
            const exists = columns.some(c => c.name === column);
            if (!exists) {
                db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, (err) => {
                    if (err) console.error(`Error adding ${column} to ${table}:`, err);
                    else console.log(`Added column ${column} to ${table}.`);
                });
            }
        });
    };

    addColumnIfNotExists('sessions', 'author', 'TEXT');
    addColumnIfNotExists('sessions', 'team', 'TEXT');
    addColumnIfNotExists('drills', 'image', 'TEXT');
    addColumnIfNotExists('drills', 'category', 'TEXT');
    addColumnIfNotExists('drills', 'author', 'TEXT');
    addColumnIfNotExists('drills', 'team', 'TEXT');

    // Phase 9 Migrations
    addColumnIfNotExists('assessments', 'matchId', 'TEXT');
    addColumnIfNotExists('assessments', 'attachment', 'TEXT');

    // Rendering Persistence Migrations
    addColumnIfNotExists('matches', 'homeTeam', 'TEXT');
    addColumnIfNotExists('matches', 'awayTeam', 'TEXT');
    addColumnIfNotExists('matches', 'ourSide', 'TEXT');

    console.log('Database initialized successfully.');
});

module.exports = db;
