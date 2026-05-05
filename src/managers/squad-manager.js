import supabase from '../supabase.js';

class SquadManager {
    constructor() {
        this.squads = [];
        this.players = [];
        this.clubId = null;
        this._initialized = false;
    }

    async init(clubIdOverride) {
        if (this._initialized) return true;
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
            let squadsQuery = supabase.from('squads').select('*').order('created_at', { ascending: true });
            let playersQuery = supabase.from('players').select('*').order('name', { ascending: true });
            if (filterClubId) {
                squadsQuery = squadsQuery.eq('club_id', filterClubId);
                playersQuery = playersQuery.eq('club_id', filterClubId);
            }

            const [squadsRes, playersRes] = await Promise.all([squadsQuery, playersQuery]);

            if (squadsRes.error) throw squadsRes.error;
            if (playersRes.error) throw playersRes.error;

            // Map snake_case DB columns to camelCase for frontend compatibility
            this.squads = (squadsRes.data || []).map(s => ({
                id: s.id,
                name: s.name,
                ageGroup: s.age_group,
                leagues: s.leagues || [],
                coaches: s.coaches || [],
                currentSeasonId: s.current_season_id || null,
                leagueTableUrl: s.league_table_url || null,
                notes: s.notes || '',
                media: s.media || [],
                share_token: s.share_token || null,
                createdAt: s.created_at
            }));

            this.players = (playersRes.data || []).map(p => this._mapPlayer(p));

            this._initialized = true;
            return true;
        } catch (error) {
            console.error('Error initializing SquadManager:', error);
            this.squads = [];
            this.players = [];
            return false;
        }
    }

    resetInit() { this._initialized = false; }

    _mapPlayer(p) {
        return {
            id: p.id,
            name: p.name,
            squadId: p.squad_id,
            age: p.age,
            dateOfBirth: p.date_of_birth || '',
            jerseyNumber: p.jersey_number || '',
            position: p.position,
            height: p.height || '',
            weight: p.weight || '',
            foot: p.foot || 'Right',
            previousClubs: p.previous_clubs || '',
            currentClub: p.current_club || '',
            school: p.school || '',
            newToClub: p.new_to_club || false,
            nationality: p.nationality || '',
            joinDate: p.join_date || '',
            yearJoined: p.year_joined || '',
            phone: p.phone || '',
            email: p.email || '',
            emergencyContactName: p.emergency_contact_name || '',
            emergencyContactPhone: p.emergency_contact_phone || '',
            parentName: p.parent_name || '',
            parentPhone: p.parent_phone || '',
            parentEmail: p.parent_email || '',
            medicalInfo: p.medical_info || '',
            bio: p.bio || '',
            documents: p.documents || [],
            highlights: p.highlights || [],
            analysisVideos: p.analysis_videos || [],
            galleryPhotos: p.gallery_photos || [],
            profileImageUrl: p.profile_image_url || '',
            playerStatus: p.player_status || 'active',
            createdAt: p.created_at
        };
    }

    async addSquad(data) {
        const row = {
            club_id: this.clubId,
            name: data.name,
            age_group: data.ageGroup || 'General',
            leagues: data.leagues || [],
            coaches: data.coaches || [],
            league_table_url: data.leagueTableUrl || null,
        };

        const { data: inserted, error } = await supabase
            .from('squads')
            .insert(row)
            .select()
            .single();

        if (error) throw error;

        const mapped = {
            id: inserted.id,
            name: inserted.name,
            ageGroup: inserted.age_group,
            leagues: inserted.leagues || [],
            coaches: inserted.coaches || [],
            currentSeasonId: inserted.current_season_id || null,
            leagueTableUrl: inserted.league_table_url || null,
            notes: inserted.notes || '',
            media: inserted.media || [],
            share_token: inserted.share_token || null,
            createdAt: inserted.created_at
        };
        this.squads.push(mapped);
        return inserted.id;
    }

    async updateSquad(id, data) {
        const row = {};
        if (data.name !== undefined) row.name = data.name;
        if (data.ageGroup !== undefined) row.age_group = data.ageGroup;
        if (data.leagues !== undefined) row.leagues = data.leagues;
        if (data.coaches !== undefined) row.coaches = data.coaches;
        if (data.leagueTableUrl !== undefined) row.league_table_url = data.leagueTableUrl || null;
        if (data.notes !== undefined) row.notes = data.notes || null;
        if (data.media !== undefined) row.media = data.media;

        const { error } = await supabase.from('squads').update(row).eq('id', id);
        if (error) throw error;

        const index = this.squads.findIndex(s => s.id === id);
        if (index !== -1) this.squads[index] = { ...this.squads[index], ...data };
        return true;
    }

    async addPlayer(data) {
        const row = {
            club_id: this.clubId,
            name: data.name,
            squad_id: data.squadId || null,
            age: data.age,
            date_of_birth: data.dateOfBirth || null,
            jersey_number: data.jerseyNumber || null,
            position: data.position,
            height: data.height || '',
            weight: data.weight || '',
            foot: data.foot || 'Right',
            previous_clubs: data.previousClubs || '',
            current_club: data.currentClub || null,
            school: data.school || null,
            new_to_club: data.newToClub || false,
            nationality: data.nationality || null,
            join_date: data.joinDate || null,
            phone: data.phone || null,
            email: data.email || null,
            emergency_contact_name: data.emergencyContactName || null,
            emergency_contact_phone: data.emergencyContactPhone || null,
            parent_name: data.parentName || null,
            parent_phone: data.parentPhone || null,
            parent_email: data.parentEmail || null,
            medical_info: data.medicalInfo || null,
            bio: data.bio || '',
            profile_image_url: data.profileImageUrl || null,
        };

        const { data: inserted, error } = await supabase
            .from('players')
            .insert(row)
            .select()
            .single();

        if (error) throw error;

        this.players.push(this._mapPlayer(inserted));
        return inserted.id;
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
            filtered = filtered.filter(p =>
                p.position && p.position.split(',').map(s => s.trim()).includes(filters.position)
            );
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
        // Convert camelCase fields to snake_case for DB
        const row = {};
        if (data.name !== undefined) row.name = data.name;
        if (data.squadId !== undefined) row.squad_id = data.squadId;
        if (data.age !== undefined) row.age = data.age;
        if (data.position !== undefined) row.position = data.position;
        if (data.height !== undefined) row.height = data.height;
        if (data.weight !== undefined) row.weight = data.weight;
        if (data.foot !== undefined) row.foot = data.foot;
        if (data.previousClubs !== undefined) row.previous_clubs = data.previousClubs;
        if (data.currentClub !== undefined) row.current_club = data.currentClub;
        if (data.school !== undefined) row.school = data.school;
        if (data.newToClub !== undefined) row.new_to_club = data.newToClub;
        if (data.bio !== undefined) row.bio = data.bio;
        if (data.documents !== undefined) row.documents = data.documents;
        if (data.highlights !== undefined) row.highlights = data.highlights;
        if (data.analysisVideos !== undefined) row.analysis_videos = data.analysisVideos;
        if (data.galleryPhotos !== undefined) row.gallery_photos = data.galleryPhotos;
        if (data.profileImageUrl !== undefined) row.profile_image_url = data.profileImageUrl;
        if (data.dateOfBirth !== undefined) row.date_of_birth = data.dateOfBirth || null;
        if (data.jerseyNumber !== undefined) row.jersey_number = data.jerseyNumber;
        if (data.nationality !== undefined) row.nationality = data.nationality;
        if (data.joinDate !== undefined) row.join_date = data.joinDate || null;
        if (data.yearJoined !== undefined) row.year_joined = data.yearJoined || null;
        if (data.phone !== undefined) row.phone = data.phone;
        if (data.email !== undefined) row.email = data.email;
        if (data.emergencyContactName !== undefined) row.emergency_contact_name = data.emergencyContactName;
        if (data.emergencyContactPhone !== undefined) row.emergency_contact_phone = data.emergencyContactPhone;
        if (data.parentName !== undefined) row.parent_name = data.parentName;
        if (data.parentPhone !== undefined) row.parent_phone = data.parentPhone;
        if (data.parentEmail !== undefined) row.parent_email = data.parentEmail;
        if (data.medicalInfo !== undefined) row.medical_info = data.medicalInfo;

        const { error } = await supabase
            .from('players')
            .update(row)
            .eq('id', id);

        if (error) {
            console.error('Error updating player:', error);
            return false;
        }

        const index = this.players.findIndex(p => String(p.id) === String(id));
        if (index !== -1) {
            this.players[index] = { ...this.players[index], ...data };
        }
        return true;
    }

    async updatePlayerStatus(playerId, status) {
        const { error } = await supabase
            .from('players')
            .update({ player_status: status })
            .eq('id', playerId);
        if (error) { console.error('Error updating player status:', error); return false; }
        const player = this.players.find(p => String(p.id) === String(playerId));
        if (player) player.playerStatus = status;
        return true;
    }

    async deletePlayer(id) {

        // Save snapshot for recovery before deleting
        const player = this.players.find(p => String(p.id) === String(id));
        if (player && this.clubId) {
            try {
                const { data: fullRow } = await supabase.from('players').select('*').eq('id', id).single();
                if (fullRow) {
                    const { error: snapErr } = await supabase.from('deleted_items').insert({
                        club_id: this.clubId, item_type: 'player', item_id: id, item_data: fullRow
                    });
                    if (snapErr) console.warn('Recovery snapshot failed — player will still be deleted:', snapErr);
                }
            } catch (e) { console.warn('Recovery snapshot failed:', e); }
        }

        const { error } = await supabase.from('players').delete().eq('id', id);
        if (error) {
            console.error('Error deleting player:', error);
            return false;
        }
        this.players = this.players.filter(p => String(p.id) !== String(id));
        return true;
    }

    async deleteSquad(id) {

        // Save snapshot for recovery before deleting
        const squad = this.squads.find(s => s.id === id);
        if (squad && this.clubId) {
            try {
                const { data: fullRow } = await supabase.from('squads').select('*').eq('id', id).single();
                if (fullRow) {
                    const { error: snapErr } = await supabase.from('deleted_items').insert({
                        club_id: this.clubId, item_type: 'squad', item_id: id, item_data: fullRow
                    });
                    if (snapErr) console.warn('Recovery snapshot failed:', snapErr);
                }
            } catch (e) { console.warn('Recovery snapshot failed:', e); }
        }

        const { error } = await supabase.from('squads').delete().eq('id', id);
        if (error) {
            console.error('Error deleting squad:', error);
            return false;
        }
        this.squads = this.squads.filter(s => s.id !== id);
        return true;
    }

    // --- Assessment Methods ---
    async getAssessments(playerId) {
        const { data, error } = await supabase
            .from('assessments')
            .select('*')
            .eq('player_id', playerId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching assessments:', error);
            return [];
        }
        return (data || []).map(a => ({
            id: a.id,
            playerId: a.player_id,
            matchId: a.match_id,
            date: a.date,
            type: a.type,
            ratings: a.ratings || {},
            notes: a.notes,
            feedback: { comments: a.notes || '' },
            attachment: a.attachment,
            author: a.author,
            createdAt: a.created_at
        }));
    }

    async saveAssessment(data) {
        const row = {
            club_id: this.clubId,
            player_id: data.playerId,
            match_id: data.matchId || null,
            date: data.date,
            type: data.type,
            ratings: data.ratings || {},
            notes: data.notes || '',
            attachment: data.attachment || null,
            author: data.author || ''
        };

        const { error } = await supabase.from('assessments').insert(row);
        if (error) {
            console.error('Error saving assessment:', error);
            return false;
        }
        return true;
    }

    // --- Development Structures ---
    async getDevStructures(playerId) {
        const { data, error } = await supabase
            .from('dev_structures')
            .select('*')
            .eq('player_id', playerId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching dev structures:', error);
            return [];
        }
        return (data || []).map(d => ({
            id: d.id,
            playerId: d.player_id,
            date: d.date,
            structures: d.structures || {},
            createdAt: d.created_at
        }));
    }

    async saveDevStructure(data) {
        const row = {
            club_id: this.clubId,
            player_id: data.playerId,
            date: data.date,
            structures: data.structures || {}
        };

        let error;
        if (data.id) {
            ({ error } = await supabase.from('dev_structures').update(row).eq('id', data.id));
        } else {
            ({ error } = await supabase.from('dev_structures').insert(row));
        }

        if (error) {
            console.error('Error saving dev structure:', error);
            return false;
        }
        return true;
    }

    async saveSquadAssessment(data) {
        const row = {
            club_id: this.clubId,
            squad_id: data.squadId,
            date: data.date,
            context: data.context || '',
            ratings: data.ratings || {},
            feedback: data.feedback || {},
            author: data.author || ''
        };

        const { error } = await supabase.from('squad_assessments').insert(row);
        if (error) {
            console.error('Error saving squad assessment:', error);
            return false;
        }
        return true;
    }

    async getSquadAssessments(squadId) {
        const { data, error } = await supabase
            .from('squad_assessments')
            .select('*')
            .eq('squad_id', squadId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching squad assessments:', error);
            return [];
        }
        return (data || []).map(sa => ({
            id: sa.id,
            squadId: sa.squad_id,
            date: sa.date,
            context: sa.context,
            ratings: sa.ratings || {},
            feedback: sa.feedback || {},
            author: sa.author,
            createdAt: sa.created_at
        }));
    }

    async getSquadAssessment(id) {
        const { data, error } = await supabase
            .from('squad_assessments')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching squad assessment:', error);
            return null;
        }
        return data ? {
            id: data.id,
            squadId: data.squad_id,
            date: data.date,
            context: data.context,
            ratings: data.ratings || {},
            feedback: data.feedback || {},
            author: data.author,
            createdAt: data.created_at
        } : null;
    }

    async deleteAssessment(id) {
        const { error } = await supabase.from('assessments').delete().eq('id', id);
        if (error) {
            console.error('Error deleting assessment:', error);
            return false;
        }
        return true;
    }

    async deleteDevStructure(id) {
        const { error } = await supabase.from('dev_structures').delete().eq('id', id);
        if (error) {
            console.error('Error deleting dev structure:', error);
            return false;
        }
        return true;
    }

    async deleteSquadAssessment(id) {
        const { error } = await supabase.from('squad_assessments').delete().eq('id', id);
        if (error) {
            console.error('Error deleting squad assessment:', error);
            return false;
        }
        return true;
    }
}

// Singleton export
const squadManager = new SquadManager();
export default squadManager;
