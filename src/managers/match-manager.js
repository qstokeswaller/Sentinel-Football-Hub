import supabase from '../supabase.js';

class MatchManager {
    constructor() {
        this.matches = [];
        this.clubId = null;
    }

    async init(clubIdOverride) {
        try {
            // Accept clubId from caller (page-init already has it) to avoid redundant auth calls
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

            // Filter queries by the effective club_id (covers both normal + impersonation)
            const filterClubId = impClubId || this.clubId;
            let matchesQuery = supabase.from('matches').select('*').order('date', { ascending: false });
            if (filterClubId) {
                matchesQuery = matchesQuery.eq('club_id', filterClubId);
            }

            const { data, error } = await matchesQuery;

            if (error) throw error;

            this.matches = (data || []).map(m => this._mapMatch(m));
            console.log('MatchManager initialized with Supabase data');
            return true;
        } catch (error) {
            console.error('Error initializing MatchManager:', error);
            this.matches = [];
            return false;
        }
    }

    _mapMatch(m) {
        return {
            id: m.id,
            squadId: m.squad_id,
            date: m.date,
            time: m.time,
            venue: m.venue,
            opponent: m.opponent,
            competition: m.competition,
            isPast: m.is_past,
            homeScore: m.home_score,
            awayScore: m.away_score,
            homeTeam: m.home_team,
            awayTeam: m.away_team,
            ourSide: m.our_side || 'home',
            result: m.result,
            notes: m.notes,
            stats: m.stats || {},
            videos: m.videos || [],
            links: m.links || [],
            matchType: m.match_type || 'team',
            watchedPlayerId: m.watched_player_id || null,
            createdAt: m.created_at
        };
    }

    getMatches() {
        return this.matches || [];
    }

    getEmptyStats() {
        return {
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
        return this.matches.find(m => String(m.id) === String(id));
    }

    async updateMatchStats(id, stats) {
        const match = this.matches.find(m => String(m.id) === String(id));
        if (!match) return false;

        const updatedStats = { ...(match.stats || {}), ...stats };
        if (stats.home) updatedStats.home = { ...(match.stats?.home || {}), ...stats.home };
        if (stats.away) updatedStats.away = { ...(match.stats?.away || {}), ...stats.away };

        const { error } = await supabase
            .from('matches')
            .update({ stats: updatedStats })
            .eq('id', id);

        if (error) {
            console.error('Error updating match stats:', error);
            throw error;
        }
        match.stats = updatedStats;
        return true;
    }

    async updateMatchInfo(id, info) {
        const match = this.matches.find(m => String(m.id) === String(id));
        if (!match) return false;

        // Convert camelCase to snake_case for DB
        const row = {};
        if (info.date !== undefined) row.date = info.date;
        if (info.time !== undefined) row.time = info.time;
        if (info.venue !== undefined) row.venue = info.venue;
        if (info.opponent !== undefined) row.opponent = info.opponent;
        if (info.competition !== undefined) row.competition = info.competition;
        if (info.isPast !== undefined) row.is_past = info.isPast;
        if (info.homeScore !== undefined) row.home_score = info.homeScore;
        if (info.awayScore !== undefined) row.away_score = info.awayScore;
        if (info.homeTeam !== undefined) row.home_team = info.homeTeam;
        if (info.awayTeam !== undefined) row.away_team = info.awayTeam;
        if (info.ourSide !== undefined) row.our_side = info.ourSide;
        if (info.result !== undefined) row.result = info.result;
        if (info.notes !== undefined) row.notes = info.notes;
        if (info.stats !== undefined) row.stats = info.stats;
        if (info.videos !== undefined) row.videos = info.videos;
        if (info.links !== undefined) row.links = info.links;
        if (info.matchType !== undefined) row.match_type = info.matchType;
        if (info.watchedPlayerId !== undefined) row.watched_player_id = info.watchedPlayerId;

        const { error } = await supabase
            .from('matches')
            .update(row)
            .eq('id', id);

        if (error) {
            console.error('Error updating match info:', error);
            throw error;
        }
        Object.assign(match, info);
        return true;
    }

    async createMatch(matchData) {
        const row = {
            club_id: this.clubId,
            squad_id: matchData.squadId,
            date: matchData.date,
            time: matchData.time,
            venue: matchData.venue,
            opponent: matchData.opponent,
            competition: matchData.competition,
            is_past: matchData.isPast || false,
            home_score: matchData.homeScore,
            away_score: matchData.awayScore,
            home_team: matchData.homeTeam,
            away_team: matchData.awayTeam,
            our_side: matchData.ourSide || 'home',
            result: matchData.result,
            notes: matchData.notes,
            stats: this.getDefaultStats(),
            videos: [],
            links: [],
            match_type: matchData.matchType || 'team',
            watched_player_id: matchData.watchedPlayerId || null
        };

        const { data: inserted, error } = await supabase
            .from('matches')
            .insert(row)
            .select()
            .single();

        if (error) {
            console.error('Error creating match:', error);
            throw error;
        }

        const mapped = this._mapMatch(inserted);
        this.matches.push(mapped);
        return mapped;
    }

    async deleteMatch(id) {
        const { error } = await supabase.from('matches').delete().eq('id', id);
        if (error) {
            console.error('Error deleting match:', error);
            throw error;
        }
        this.matches = this.matches.filter(m => String(m.id) !== String(id));
        return true;
    }

    // --- Match Player Stats ---

    _mapPlayerStat(row) {
        return {
            id: row.id,
            matchId: row.match_id,
            playerId: row.player_id,
            appeared: row.appeared,
            started: row.started,
            minutesPlayed: row.minutes_played,
            goals: row.goals,
            assists: row.assists,
            yellowCards: row.yellow_cards,
            redCards: row.red_cards,
            motm: row.motm,
            rating: row.rating,
            notes: row.notes,
            createdAt: row.created_at
        };
    }

    async getMatchPlayerStats(matchId) {
        const { data, error } = await supabase
            .from('match_player_stats')
            .select('*')
            .eq('match_id', matchId);

        if (error) {
            console.error('Error fetching match player stats:', error);
            return [];
        }
        return (data || []).map(r => this._mapPlayerStat(r));
    }

    async saveMatchPlayerStats(matchId, playerStatsArray) {
        const rows = playerStatsArray.map(ps => ({
            club_id: this.clubId,
            match_id: matchId,
            player_id: ps.playerId,
            appeared: ps.appeared || false,
            started: ps.started || false,
            minutes_played: ps.minutesPlayed || 0,
            goals: ps.goals || 0,
            assists: ps.assists || 0,
            yellow_cards: ps.yellowCards || 0,
            red_cards: ps.redCards || 0,
            motm: ps.motm || false,
            rating: ps.rating || null,
            notes: ps.notes || ''
        }));

        const { error } = await supabase
            .from('match_player_stats')
            .upsert(rows, { onConflict: 'match_id,player_id' });

        if (error) {
            console.error('Error saving match player stats:', error);
            throw error;
        }
        return true;
    }

    async getMatchPlan(matchId) {
        const { data, error } = await supabase
            .from('match_plans')
            .select('*')
            .eq('match_id', matchId)
            .order('updated_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Error fetching match plan:', error);
            return null;
        }
        if (!data || data.length === 0) return null;
        const plan = data[0];
        return { id: plan.id, matchId: plan.match_id, squadId: plan.squad_id, data: plan.data || {}, title: plan.title };
    }

    async getPlayerCareerStats(playerId) {
        const { data, error } = await supabase
            .from('match_player_stats')
            .select('*')
            .eq('player_id', playerId)
            .eq('appeared', true);

        if (error) {
            console.error('Error fetching player career stats:', error);
            return [];
        }
        return (data || []).map(r => this._mapPlayerStat(r));
    }
}

const matchManager = new MatchManager();
export default matchManager;
