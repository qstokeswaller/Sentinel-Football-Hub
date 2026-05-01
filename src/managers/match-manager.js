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
            status: m.status || (m.is_past ? 'result' : 'fixture'),
            matchFormat: m.match_format || '11-a-side',
            formation: m.formation || '',
            homeScore: m.home_score,
            awayScore: m.away_score,
            halfTimeHomeScore: m.half_time_home_score ?? null,
            halfTimeAwayScore: m.half_time_away_score ?? null,
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
            seasonId: m.season_id || null,
            lineup: m.lineup || { starters: [], subs: [] },
            matchEvents: m.match_events || [],
            reportTitle: m.report_title || '',
            reportGeneral: m.report_general || '',
            reportAttacking: m.report_attacking || '',
            reportDefending: m.report_defending || '',
            reportIndividual: m.report_individual || '',
            reportImprovements: m.report_improvements || '',
            reportVisibility: m.report_visibility || 'private',
            matchPhotos: m.match_photos || [],
            playerRatings: m.player_ratings || {},
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
        if (info.halfTimeHomeScore !== undefined) row.half_time_home_score = info.halfTimeHomeScore;
        if (info.halfTimeAwayScore !== undefined) row.half_time_away_score = info.halfTimeAwayScore;
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
        if (info.status !== undefined) row.status = info.status;
        if (info.matchFormat !== undefined) row.match_format = info.matchFormat;
        if (info.formation !== undefined) row.formation = info.formation;
        if (info.lineup !== undefined) row.lineup = info.lineup;
        if (info.matchEvents !== undefined) row.match_events = info.matchEvents;
        if (info.reportTitle !== undefined) row.report_title = info.reportTitle;
        if (info.reportGeneral !== undefined) row.report_general = info.reportGeneral;
        if (info.reportAttacking !== undefined) row.report_attacking = info.reportAttacking;
        if (info.reportDefending !== undefined) row.report_defending = info.reportDefending;
        if (info.reportIndividual !== undefined) row.report_individual = info.reportIndividual;
        if (info.reportImprovements !== undefined) row.report_improvements = info.reportImprovements;
        if (info.reportVisibility !== undefined) row.report_visibility = info.reportVisibility;
        if (info.matchPhotos !== undefined) row.match_photos = info.matchPhotos;
        if (info.playerRatings !== undefined) row.player_ratings = info.playerRatings;
        if (info.seasonId !== undefined) row.season_id = info.seasonId;

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
        const isResult = matchData.status === 'result';
        const row = {
            club_id: this.clubId,
            squad_id: matchData.squadId,
            date: matchData.date,
            time: matchData.time,
            venue: matchData.venue,
            opponent: matchData.opponent,
            competition: matchData.competition,
            is_past: isResult,
            status: matchData.status || 'fixture',
            match_format: matchData.matchFormat || '11-a-side',
            formation: matchData.formation || null,
            home_score: isResult ? (matchData.homeScore ?? null) : null,
            away_score: isResult ? (matchData.awayScore ?? null) : null,
            home_team: matchData.homeTeam,
            away_team: matchData.awayTeam,
            our_side: matchData.ourSide || 'home',
            result: matchData.result || null,
            notes: matchData.notes || null,
            stats: this.getDefaultStats(),
            videos: matchData.videos || [],
            links: matchData.links || [],
            match_type: matchData.matchType || 'team',
            watched_player_id: matchData.watchedPlayerId || null,
            season_id: matchData.seasonId || null,
            lineup: matchData.lineup || { starters: [], subs: [] },
            match_events: matchData.matchEvents || [],
            report_title: matchData.reportTitle || null,
            report_general: matchData.reportGeneral || null,
            report_visibility: 'private',
            match_photos: [],
            player_ratings: {}
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
            saves: row.saves || 0,
            cleanSheet: row.clean_sheet || false,
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
            notes: ps.notes || '',
            saves: ps.saves || 0,
            clean_sheet: ps.cleanSheet || false
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

    // --- Season helpers ---

    async getSeasons() {
        if (!this.clubId) return [];
        const { data, error } = await supabase
            .from('seasons')
            .select('id, name, status, is_current, match_format, start_date, end_date')
            .eq('club_id', this.clubId)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) { console.error('Error fetching seasons:', error); return []; }
        return data || [];
    }

    async getOrCreateActiveSeason() {
        const seasons = await this.getSeasons();
        const active = seasons.find(s => s.is_current || s.status === 'active');
        if (active) return active;

        const year = new Date().getFullYear();
        const { data, error } = await supabase
            .from('seasons')
            .insert({
                club_id: this.clubId,
                name: `${year} Season`,
                status: 'active',
                is_current: true,
                win_points: 3,
                draw_points: 1,
                loss_points: 0,
                match_format: '11-a-side'
            })
            .select()
            .single();
        if (error) { console.error('Error creating default season:', error); return null; }
        return data;
    }

    async upsertMatchPlayerStat(matchId, playerId, updates) {
        const row = {
            club_id: this.clubId,
            match_id: matchId,
            player_id: playerId,
            ...updates
        };
        const { error } = await supabase
            .from('match_player_stats')
            .upsert(row, { onConflict: 'match_id,player_id' });
        if (error) { console.error('Error upserting match player stat:', error); return false; }
        return true;
    }

    async recalcPlayerSeasonStats(playerId, seasonId) {
        if (!seasonId) return;

        // Get team match IDs for this season only — exclude player_watch observations
        const { data: seasonMatches } = await supabase
            .from('matches')
            .select('id, match_type')
            .eq('club_id', this.clubId)
            .eq('season_id', seasonId);

        const teamMatchIds = (seasonMatches || [])
            .filter(m => m.match_type !== 'player_watch')
            .map(m => m.id);

        // No team matches in this season — zero out stats
        if (teamMatchIds.length === 0) {
            await supabase.from('player_season_stats').upsert({
                player_id: playerId, season_id: seasonId, club_id: this.clubId,
                appearances: 0, sub_appearances: 0, goals: 0, assists: 0,
                yellow_cards: 0, red_cards: 0, saves: 0, clean_sheets: 0,
                average_rating: null, updated_at: new Date().toISOString()
            }, { onConflict: 'player_id,season_id' });
            return;
        }

        const { data: rows, error } = await supabase
            .from('match_player_stats')
            .select('appeared, started, goals, assists, yellow_cards, red_cards, rating, saves, clean_sheet')
            .eq('player_id', playerId)
            .in('match_id', teamMatchIds);
        if (error || !rows) return;

        const totals = rows.reduce((acc, r) => {
            if (r.appeared) {
                if (r.started) acc.appearances += 1;
                else acc.sub_appearances += 1;
            }
            acc.goals += r.goals || 0;
            acc.assists += r.assists || 0;
            acc.yellow_cards += r.yellow_cards || 0;
            acc.red_cards += r.red_cards || 0;
            acc.saves += r.saves || 0;
            if (r.clean_sheet) acc.clean_sheets += 1;
            if (r.rating) { acc._ratingSum += r.rating; acc._ratingCount += 1; }
            return acc;
        }, { appearances: 0, sub_appearances: 0, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, saves: 0, clean_sheets: 0, _ratingSum: 0, _ratingCount: 0 });

        const avgRating = totals._ratingCount > 0 ? (totals._ratingSum / totals._ratingCount).toFixed(2) : null;

        await supabase.from('player_season_stats').upsert({
            player_id: playerId,
            season_id: seasonId,
            club_id: this.clubId,
            appearances: totals.appearances,
            sub_appearances: totals.sub_appearances,
            goals: totals.goals,
            assists: totals.assists,
            yellow_cards: totals.yellow_cards,
            red_cards: totals.red_cards,
            saves: totals.saves,
            clean_sheets: totals.clean_sheets,
            average_rating: avgRating,
            updated_at: new Date().toISOString()
        }, { onConflict: 'player_id,season_id' });
    }
}

const matchManager = new MatchManager();
export default matchManager;
