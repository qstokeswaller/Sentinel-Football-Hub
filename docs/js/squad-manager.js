/**
 * Squad Manager Logic
 * Handles persistence and data operations for players and squads via REST API or LocalStorage.
 */



class SquadManager {
    constructor() {
        this.squads = [];
        this.players = [];
    }

    async init() {
        // ALWAYS use API as per updated requirement
        try {
            const [squadsRes, playersRes] = await Promise.all([
                fetch(`${window.API_BASE_URL}/squads`),
                fetch(`${window.API_BASE_URL}/players`)
            ]);
            this.squads = await squadsRes.json();
            this.players = await playersRes.json();
            console.log('SquadManager initialized with API data');
            return true;
        } catch (error) {
            console.error('Error initializing SquadManager:', error);
            this.squads = [];
            this.players = [];
            return false;
        }
    }

    async addSquad(data) {
        const id = Date.now().toString();
        const newSquad = {
            id,
            name: data.name,
            ageGroup: data.ageGroup || 'General',
            leagues: data.leagues || [],
            coaches: data.coaches || []
        };

        try {
            const response = await fetch(`${window.API_BASE_URL}/squads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSquad)
            });
            if (!response.ok) throw new Error('Failed to save squad');
            this.squads.push(newSquad);
            return id;
        } catch (error) {
            console.error('Error adding squad:', error);
            throw error;
        }
    }

    async addPlayer(data) {
        const id = Date.now().toString();
        const newPlayer = {
            id,
            name: data.name,
            squadId: data.squadId,
            age: data.age,
            position: data.position,
            height: data.height || '',
            weight: data.weight || '',
            foot: data.foot || 'Right',
            previousClubs: data.previousClubs || '',
            bio: data.bio || '',
            createdAt: new Date().toISOString()
        };

        try {
            const response = await fetch(`${window.API_BASE_URL}/players`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newPlayer)
            });
            if (!response.ok) throw new Error('Failed to save player');
            this.players.push(newPlayer);
            return id;
        } catch (error) {
            console.error('Error adding player:', error);
            throw error;
        }
    }

    getSquads() {
        return this.squads;
    }

    getSquad(id) {
        return this.squads.find(s => s.id === id);
    }

    getPlayer(id) {
        return this.players.find(p => String(p.id) === String(id));
    }

    getPlayers(filters = {}) {
        let filtered = [...this.players];
        if (filters.squadId && filters.squadId !== 'all') {
            filtered = filtered.filter(p => p.squadId === filters.squadId);
        }
        if (filters.position && filters.position !== 'all') {
            filtered = filtered.filter(p => p.position === filters.position);
        }
        if (filters.ageRange && filters.ageRange !== 'all') {
            const [min, max] = filters.ageRange.split('-').map(Number);
            filtered = filtered.filter(p => {
                const age = Number(p.age);
                if (max) return age >= min && age <= max;
                return age >= min;
            });
        }
        if (filters.search) {
            const term = filters.search.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(term));
        }
        return filtered;
    }

    async updatePlayer(id, data) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/players/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error('Failed to update player');

            const index = this.players.findIndex(p => p.id === id);
            if (index !== -1) {
                this.players[index] = { ...this.players[index], ...data };
            }
            return true;
        } catch (error) {
            console.error('Error updating player:', error);
            return false;
        }
    }

    async deletePlayer(id) {
        if (!confirm('Are you sure you want to delete this player? This action cannot be undone.')) return false;
        try {
            const response = await fetch(`${window.API_BASE_URL}/players/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete player');
            this.players = this.players.filter(p => p.id !== id);
            return true;
        } catch (error) {
            console.error('Error deleting player:', error);
            return false;
        }
    }

    async deleteSquad(id) {
        if (!confirm('Are you sure you want to delete this squad? This will NOT delete the players in it.')) return false;
        try {
            const response = await fetch(`${window.API_BASE_URL}/squads/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete squad');

            // Local state update
            this.squads = this.squads.filter(s => String(s.id) !== String(id));
            this.players = this.players.map(p => {
                if (String(p.squadId) === String(id)) {
                    return { ...p, squadId: null };
                }
                return p;
            });

            console.log(`SquadManager: Deleted squad ${id} and unassigned its players locally`);
            return true;
        } catch (error) {
            console.error('Error deleting squad:', error);
            return false;
        }
    }

    // --- Assessment Methods ---
    async getAssessments(playerId) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/players/${playerId}/assessments`);
            if (!response.ok) throw new Error('Failed to fetch assessments');
            return await response.json();
        } catch (error) {
            console.error('Error fetching assessments:', error);
            return [];
        }
    }

    async saveAssessment(data) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/assessments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    id: data.id || 'assess_' + Date.now(),
                    createdAt: data.createdAt || new Date().toISOString()
                })
            });
            if (!response.ok) throw new Error('Failed to save assessment');
            return true;
        } catch (error) {
            console.error('Error saving assessment:', error);
            return false;
        }
    }

    // --- Development Structures Methods ---
    async getDevStructures(playerId) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/players/${playerId}/dev-structures`);
            if (!response.ok) throw new Error('Failed to fetch dev structures');
            return await response.json();
        } catch (error) {
            console.error('Error fetching dev structures:', error);
            return [];
        }
    }

    async saveDevStructure(data) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/dev-structures`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    id: data.id || 'ds_' + Date.now(),
                    createdAt: data.createdAt || new Date().toISOString()
                })
            });
            if (!response.ok) throw new Error('Failed to save dev structure');
            return true;
        } catch (error) {
            console.error('SQUAD MANAGER ERROR: saveDevStructure failed:', error);
            return false;
        }
    }

    async saveSquadAssessment(data) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/squad-assessments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    id: data.id || 'sa_' + Date.now(),
                    createdAt: data.createdAt || new Date().toISOString()
                })
            });
            if (!response.ok) throw new Error('Failed to save squad assessment');
            return true;
        } catch (error) {
            console.error('SQUAD MANAGER ERROR: saveSquadAssessment failed:', error);
            return false;
        }
    }

    async getSquadAssessments(squadId) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/squads/${squadId}/assessments`);
            if (!response.ok) throw new Error('Failed to fetch squad assessments');
            return await response.json();
        } catch (error) {
            console.error('SQUAD MANAGER ERROR: getSquadAssessments failed:', error);
            return [];
        }
    }

    async getSquadAssessment(id) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/squad-assessments/${id}`);
            if (!response.ok) throw new Error('Failed to fetch squad assessment');
            return await response.json();
        } catch (error) {
            console.error('SQUAD MANAGER ERROR: getSquadAssessment failed:', error);
            return null;
        }
    }

    async deleteAssessment(id) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/assessments/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete assessment');
            return true;
        } catch (error) {
            console.error('SQUAD MANAGER ERROR: deleteAssessment failed:', error);
            return false;
        }
    }

    async deleteDevStructure(id) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/dev-structures/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete dev structure');
            return true;
        } catch (error) {
            console.error('SQUAD MANAGER ERROR: deleteDevStructure failed:', error);
            return false;
        }
    }

    async deleteSquadAssessment(id) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/squad-assessments/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete squad assessment');
            return true;
        } catch (error) {
            console.error('SQUAD MANAGER ERROR: deleteSquadAssessment failed:', error);
            return false;
        }
    }
}

// Global instance
const squadManager = new SquadManager();
