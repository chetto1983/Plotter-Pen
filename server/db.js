
import sqlite3 from 'sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB
const configuredPath = process.env.DB_PATH || process.env.DATABASE_PATH;
const dbPath = configuredPath
    ? (path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(__dirname, '..', configuredPath))
    : path.resolve(__dirname, '../database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database at', dbPath);
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // App State (Auto-save) - Singleton row (id=1)
        db.run(`CREATE TABLE IF NOT EXISTS app_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Drawings (Named saves)
        db.run(`CREATE TABLE IF NOT EXISTS drawings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            data TEXT NOT NULL,
            preview_img TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tools Library
        db.run(`CREATE TABLE IF NOT EXISTS tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'endmill',
            diameter REAL NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // CAM Settings - Singleton row (id=1)
        db.run(`CREATE TABLE IF NOT EXISTS cam_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });
}

// === App State Operations ===

export function saveAppState(data) {
    return new Promise((resolve, reject) => {
        const json = JSON.stringify(data);
        db.run(`INSERT INTO app_state (id, data, updated_at) 
                VALUES (1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET 
                data = excluded.data, 
                updated_at = CURRENT_TIMESTAMP`,
            [json],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
    });
}

export function loadAppState() {
    return new Promise((resolve, reject) => {
        db.get(`SELECT data FROM app_state WHERE id = 1`, (err, row) => {
            if (err) reject(err);
            else resolve(row ? JSON.parse(row.data) : null);
        });
    });
}

// === CAM Settings Operations ===

export function saveCamSettings(data) {
    return new Promise((resolve, reject) => {
        const json = JSON.stringify(data);
        db.run(`INSERT INTO cam_settings (id, data, updated_at) 
                VALUES (1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET 
                data = excluded.data, 
                updated_at = CURRENT_TIMESTAMP`,
            [json],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
    });
}

export function loadCamSettings() {
    return new Promise((resolve, reject) => {
        db.get(`SELECT data FROM cam_settings WHERE id = 1`, (err, row) => {
            if (err) reject(err);
            else resolve(row ? JSON.parse(row.data) : null);
        });
    });
}

// === Drawings Operations ===

export function saveDrawing(name, data, preview = null) {
    return new Promise((resolve, reject) => {
        const json = JSON.stringify(data);
        db.run(`INSERT INTO drawings (name, data, preview_img, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(name) DO UPDATE SET
                data = excluded.data,
                preview_img = excluded.preview_img,
                updated_at = CURRENT_TIMESTAMP`,
            [name, json, preview],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
    });
}

export function loadDrawing(name) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT data FROM drawings WHERE name = ?`, [name], (err, row) => {
            if (err) reject(err);
            else resolve(row ? JSON.parse(row.data) : null);
        });
    });
}

export function listDrawings() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT id, name, updated_at, preview_img FROM drawings ORDER BY updated_at DESC`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

export function deleteDrawing(name) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM drawings WHERE name = ?`, [name], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

// === Tools Operations ===

export function saveTool(tool) {
    return new Promise((resolve, reject) => {
        const { id, name, type, diameter, description } = tool;

        if (id) {
            // Update existing
            db.run(`UPDATE tools SET name = ?, type = ?, diameter = ?, description = ? WHERE id = ?`,
                [name, type || 'endmill', diameter, description || null, id],
                function (err) {
                    if (err) reject(err);
                    else resolve(id); // Return existing ID
                });
        } else {
            // Insert new
            db.run(`INSERT INTO tools (name, type, diameter, description) VALUES (?, ?, ?, ?)`,
                [name, type || 'endmill', diameter, description || null],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        }
    });
}

export function listTools() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM tools ORDER BY name ASC`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

export function deleteTool(id) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM tools WHERE id = ?`, [id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

export default {
    saveAppState,
    loadAppState,
    saveCamSettings,
    loadCamSettings,
    saveDrawing,
    loadDrawing,
    listDrawings,
    deleteDrawing,
    saveTool,
    listTools,
    deleteTool
};
