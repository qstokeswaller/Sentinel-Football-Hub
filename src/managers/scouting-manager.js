import supabase from '../supabase.js';

class ScoutingManager {
    constructor() {
        this.players = [];
        this.clubId = null;
        this._initialized = false;
        this._reportsByPlayer = {};   // { playerId: [report, ...] }
    }

    async init(clubIdOverride) {
        if (this._initialized) return true;
        try {
            const impClubId = sessionStorage.getItem('impersonating_club_id');
            if (clubIdOverride) {
                this.clubId = clubIdOverride;
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('club_id')
                        .eq('id', user.id)
                        .single();
                    this.clubId = impClubId || profile?.club_id || null;
                }
            }

            // Fetch players and reports in PARALLEL (not sequential)
            let pq = supabase
                .from('scouted_players')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);
            if (this.clubId) pq = pq.eq('club_id', this.clubId);

            let rq = supabase
                .from('scouting_reports')
                .select('*')
                .order('date', { ascending: false })
                .limit(1000);
            if (this.clubId) rq = rq.eq('club_id', this.clubId);

            const [{ data: players, error: pErr }, { data: reports, error: rErr }] = await Promise.all([pq, rq]);
            if (pErr) throw pErr;
            if (rErr) throw rErr;

            // Group reports by player and compute summaries
            this._reportsByPlayer = {};
            for (const r of (reports || [])) {
                const pid = r.scouted_player_id;
                if (!this._reportsByPlayer[pid]) this._reportsByPlayer[pid] = [];
                this._reportsByPlayer[pid].push(r);
            }

            // Attach summary fields to each player
            this.players = (players || []).map(p => {
                const pReports = this._reportsByPlayer[p.id] || [];
                const latest = pReports[0] || null;
                p._reportCount = pReports.length;
                p._latestVerdict = latest?.verdict || null;
                p._latestAvg = latest?.global_average ? parseFloat(latest.global_average) : null;
                p._latestScout = latest?.scout_name || null;
                p._latestDate = latest?.date || null;
                return p;
            });

            this._initialized = true;
            return true;
        } catch (err) {
            console.error('ScoutingManager init error:', err);
            this.players = [];
            return false;
        }
    }

    getPlayer(id) {
        return this.players.find(p => p.id === id) || null;
    }

    getCachedReports(playerId) {
        return this._reportsByPlayer[playerId] || [];
    }

    async addPlayer(data) {
        const payload = { ...data, club_id: this.clubId };
        const { data: row, error } = await supabase
            .from('scouted_players')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        row._reportCount = 0;
        row._latestVerdict = null;
        row._latestAvg = null;
        row._latestScout = null;
        this.players.unshift(row);
        return row;
    }

    async updatePlayer(id, data) {
        const { data: row, error } = await supabase
            .from('scouted_players')
            .update(data)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        const idx = this.players.findIndex(p => p.id === id);
        if (idx >= 0) {
            const old = this.players[idx];
            row._reportCount = old._reportCount;
            row._latestVerdict = old._latestVerdict;
            row._latestAvg = old._latestAvg;
            row._latestScout = old._latestScout;
            this.players[idx] = row;
        }
        return row;
    }

    async deletePlayer(id) {
        // Delete reports first, then player
        await supabase.from('scouting_reports').delete().eq('scouted_player_id', id);
        await supabase.from('scouting_videos').delete().eq('scouted_player_id', id);
        const { error } = await supabase.from('scouted_players').delete().eq('id', id);
        if (error) throw error;
        this.players = this.players.filter(p => p.id !== id);
        delete this._reportsByPlayer[id];
    }

    async updateStatus(id, newStatus) {
        return this.updatePlayer(id, { scouting_status: newStatus });
    }

    // ── Reports ──
    async getReports(scoutedPlayerId) {
        const { data, error } = await supabase
            .from('scouting_reports')
            .select('*')
            .eq('scouted_player_id', scoutedPlayerId)
            .order('date', { ascending: false });
        if (error) throw error;
        this._reportsByPlayer[scoutedPlayerId] = data || [];
        return data || [];
    }

    async addReport(data) {
        const globalAverage = this.computeGlobalAverage(data.ratings);
        const payload = { ...data, club_id: this.clubId, global_average: globalAverage };
        const { data: row, error } = await supabase
            .from('scouting_reports')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;

        // Update cached reports
        const pid = data.scouted_player_id;
        if (!this._reportsByPlayer[pid]) this._reportsByPlayer[pid] = [];
        this._reportsByPlayer[pid].unshift(row);

        // Update player summary
        const player = this.getPlayer(pid);
        if (player) {
            player._reportCount = this._reportsByPlayer[pid].length;
            player._latestVerdict = row.verdict || player._latestVerdict;
            player._latestAvg = row.global_average ? parseFloat(row.global_average) : player._latestAvg;
            player._latestScout = row.scout_name || player._latestScout;
            player._latestDate = row.date || player._latestDate;
        }
        return row;
    }

    async updateReport(id, data) {
        if (data.ratings) {
            data.global_average = this.computeGlobalAverage(data.ratings);
        }
        const { data: row, error } = await supabase
            .from('scouting_reports')
            .update(data)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return row;
    }

    async deleteReport(id) {
        const { error } = await supabase
            .from('scouting_reports')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }

    // ── Videos ──
    async getVideos(scoutedPlayerId) {
        const { data, error } = await supabase
            .from('scouting_videos')
            .select('*')
            .eq('scouted_player_id', scoutedPlayerId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async addVideo(videoData) {
        const payload = { ...videoData, club_id: this.clubId };
        const { data: row, error } = await supabase
            .from('scouting_videos')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return row;
    }

    async deleteVideo(id) {
        const { error } = await supabase
            .from('scouting_videos')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }

    // ── Helpers ──
    computeGlobalAverage(ratings) {
        if (!ratings || typeof ratings !== 'object') return 0;
        const values = Object.values(ratings).filter(v => typeof v === 'number' && v > 0);
        if (values.length === 0) return 0;
        return parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
    }

    computeCategoryAverages(ratings, sections) {
        const avgs = {};
        for (const section of sections) {
            const vals = section.attributes
                .map(a => ratings?.[a.key])
                .filter(v => typeof v === 'number' && v > 0);
            avgs[section.key] = vals.length > 0
                ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
                : 0;
        }
        return avgs;
    }

    async promoteToSquad(scoutedPlayerId, squadId) {
        const player = this.getPlayer(scoutedPlayerId);
        if (!player) throw new Error('Scouted player not found');

        const { data: newPlayer, error } = await supabase
            .from('players')
            .insert({
                name: player.name,
                position: player.position,
                dob: player.dob,
                club_id: this.clubId,
                squad_id: squadId,
            })
            .select()
            .single();
        if (error) throw error;

        await this.updateStatus(scoutedPlayerId, 'signed');
        return newPlayer;
    }

    reset() {
        this.players = [];
        this.clubId = null;
        this._initialized = false;
        this._reportsByPlayer = {};
    }
}

const scoutingManager = new ScoutingManager();
export default scoutingManager;
