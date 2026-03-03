/**
 * Match Manager Logic
 * Handles persistence and data operations for match results and statistics via REST API or LocalStorage.
 */



class MatchManager {
    constructor() {
        this.matches = [];
    }

    async init() {
        if (window.USE_LOCAL_STORAGE) {
            console.log('MatchManager: initializing from LocalStorage...');
            this.matches = JSON.parse(localStorage.getItem('up_matches')) || [];

            return true;
        }

        try {
            const response = await fetch(`${window.API_BASE_URL}/matches`);
            this.matches = await response.json();
            console.log('MatchManager initialized with API data');
            return true;
        } catch (error) {
            console.error('Error initializing MatchManager:', error);
            this.matches = [];
            return false;
        }
    }

    getMatches() {
        return this.matches || [];
    }


    _saveToLocal() {
        localStorage.setItem('up_matches', JSON.stringify(this.matches));
    }

    getEmptyStats() {
        return {
            possession: 50,
            shots: 0,
            shotsOnTarget: 0,
            xG: 0.0,
            corners: 0,
            fouls: 0,
            yellowCards: 0,
            redCards: 0
        };
    }

    getDefaultStats() {
        return {
            home: this.getEmptyStats(),
            away: this.getEmptyStats()
        };
    }

    async getMatch(id) {
        return this.matches.find(m => m.id === id);
    }

    async updateMatchStats(id, stats) {
        const match = this.matches.find(m => m.id === id);
        if (match) {
            // Merge existing stats with new stats
            const updatedStats = { ...(match.stats || {}), ...stats };
            if (stats.home) updatedStats.home = { ...(match.stats?.home || {}), ...stats.home };
            if (stats.away) updatedStats.away = { ...(match.stats?.away || {}), ...stats.away };

            console.log(`MatchManager: Updating stats for ${id}`, {
                newStatsKeys: Object.keys(stats),
                mergedStatsKeys: Object.keys(updatedStats)
            });

            if (window.USE_LOCAL_STORAGE) {
                match.stats = updatedStats;
                this._saveToLocal();
                return true;
            }

            try {
                const response = await fetch(`${window.API_BASE_URL}/matches/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stats: updatedStats })
                });
                if (!response.ok) throw new Error('Failed to update match stats');
                match.stats = updatedStats;
                return true;
            } catch (error) {
                console.error('Error updating match stats:', error);
                throw error;
            }
        }
    }

    async updateMatchInfo(id, info) {
        const match = this.matches.find(m => m.id === id);
        if (match) {
            if (window.USE_LOCAL_STORAGE) {
                Object.assign(match, info);
                this._saveToLocal();
                return true;
            }

            try {
                const response = await fetch(`${window.API_BASE_URL}/matches/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(info)
                });
                if (!response.ok) throw new Error('Failed to update match info');
                Object.assign(match, info);
                return true;
            } catch (error) {
                console.error('Error updating match info:', error);
                throw error;
            }
        }
    }

    async createMatch(matchData) {
        const newMatch = {
            id: 'match_' + Date.now(),
            stats: this.getDefaultStats(),
            videos: [],
            links: [],
            ...matchData   // matchData values (including any videos/links) take priority
        };

        if (window.USE_LOCAL_STORAGE) {
            this.matches.push(newMatch);
            this._saveToLocal();
            return newMatch;
        }

        try {
            const response = await fetch(`${window.API_BASE_URL}/matches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newMatch)
            });
            if (!response.ok) throw new Error('Failed to save new match');
            const result = await response.json();
            // If server returned the full object, use it; otherwise fallback to our newMatch
            const savedMatch = (result && result.date) ? result : newMatch;
            this.matches.push(savedMatch);
            return savedMatch;
        } catch (error) {
            console.error('Error creating match:', error);
            throw error;
        }
    }
    async deleteMatch(id) {
        if (window.USE_LOCAL_STORAGE) {
            this.matches = this.matches.filter(m => m.id !== id);
            this._saveToLocal();
            return true;
        }

        try {
            const response = await fetch(`${window.API_BASE_URL}/matches/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete match');
            this.matches = this.matches.filter(m => m.id !== id);
            return true;
        } catch (error) {
            console.error('Error deleting match:', error);
            throw error;
        }
    }
}

// Global instance
const matchManager = new MatchManager();
