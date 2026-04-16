-- ============================================================
-- Football Performance Hub — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor to create all tables
-- ============================================================

-- ── 1. Clubs (top-level tenant) ─────────────────────────────
CREATE TABLE clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. User Profiles (extends auth.users) ───────────────────
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'coach', 'viewer')) DEFAULT 'coach',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 3. Squads ───────────────────────────────────────────────
CREATE TABLE squads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age_group TEXT,
    leagues JSONB DEFAULT '[]',
    coaches JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 4. Squad-Coach assignments ──────────────────────────────
CREATE TABLE squad_coaches (
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (squad_id, coach_id)
);

-- ── 5. Players ──────────────────────────────────────────────
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    squad_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    age TEXT,
    position TEXT,
    height TEXT,
    weight TEXT,
    foot TEXT,
    previous_clubs TEXT,
    bio TEXT,
    documents JSONB DEFAULT '[]',
    highlights JSONB DEFAULT '[]',
    analysis_videos JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 6. Matches ──────────────────────────────────────────────
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    squad_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    date TEXT,
    time TEXT,
    venue TEXT,
    opponent TEXT,
    competition TEXT,
    is_past BOOLEAN DEFAULT false,
    home_score INTEGER,
    away_score INTEGER,
    home_team TEXT,
    away_team TEXT,
    our_side TEXT DEFAULT 'home',
    result TEXT,
    notes TEXT,
    stats JSONB DEFAULT '{}',
    videos JSONB DEFAULT '[]',
    links JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 7. Sessions (SHARED within club) ────────────────────────
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    date TEXT,
    start_time TEXT,
    venue TEXT,
    duration TEXT,
    players_count TEXT,
    ability_level TEXT,
    equipment TEXT,
    purpose TEXT,
    notes TEXT,
    author TEXT,
    team TEXT,
    image TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 8. Drills (linked to sessions, SHARED) ──────────────────
CREATE TABLE drills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    title TEXT,
    description TEXT,
    pitch_type TEXT DEFAULT 'full',
    orientation TEXT DEFAULT 'landscape',
    drawing_data JSONB DEFAULT '{}',
    image TEXT,
    category TEXT DEFAULT 'General',
    author TEXT,
    team TEXT,
    video_url TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 9. Reports ──────────────────────────────────────────────
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    date TEXT,
    attendance_count INTEGER,
    attendance_total INTEGER,
    notes TEXT,
    drill_notes JSONB DEFAULT '{}',
    training_load JSONB DEFAULT '{}',
    intensity TEXT,
    focus TEXT,
    rating INTEGER,
    absent_player_ids JSONB DEFAULT '[]',
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 10. Assessments ─────────────────────────────────────────
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    date TEXT,
    type TEXT,
    ratings JSONB DEFAULT '{}',
    notes TEXT,
    attachment TEXT,
    author TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 11. Dev Structures (Player Development) ─────────────────
CREATE TABLE dev_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    date TEXT,
    structures JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 12. Match Plans (SHARED within club) ────────────────────
CREATE TABLE match_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    squad_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 13. Squad Assessments ───────────────────────────────────
CREATE TABLE squad_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    date TEXT,
    context TEXT,
    ratings JSONB DEFAULT '{}',
    feedback JSONB DEFAULT '{}',
    author TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 14. Video Uploads (Cloudflare R2) ───────────────────────
CREATE TABLE video_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT,
    description TEXT,
    r2_object_key TEXT NOT NULL,
    r2_public_url TEXT,
    file_size_bytes BIGINT,
    mime_type TEXT,
    linked_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    linked_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 15. Club Invites ────────────────────────────────────────
CREATE TABLE club_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES profiles(id),
    email TEXT,
    role TEXT NOT NULL DEFAULT 'coach',
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_profiles_club ON profiles(club_id);
CREATE INDEX idx_squads_club ON squads(club_id);
CREATE INDEX idx_squad_coaches_coach ON squad_coaches(coach_id);
CREATE INDEX idx_players_club ON players(club_id);
CREATE INDEX idx_players_squad ON players(squad_id);
CREATE INDEX idx_matches_club ON matches(club_id);
CREATE INDEX idx_matches_squad ON matches(squad_id);
CREATE INDEX idx_sessions_club ON sessions(club_id);
CREATE INDEX idx_drills_club ON drills(club_id);
CREATE INDEX idx_drills_session ON drills(session_id);
CREATE INDEX idx_reports_club ON reports(club_id);
CREATE INDEX idx_reports_session ON reports(session_id);
CREATE INDEX idx_assessments_club ON assessments(club_id);
CREATE INDEX idx_assessments_player ON assessments(player_id);
CREATE INDEX idx_assessments_match ON assessments(match_id);
CREATE INDEX idx_dev_structures_player ON dev_structures(player_id);
CREATE INDEX idx_match_plans_club ON match_plans(club_id);
CREATE INDEX idx_squad_assessments_club ON squad_assessments(club_id);
CREATE INDEX idx_squad_assessments_squad ON squad_assessments(squad_id);
CREATE INDEX idx_video_uploads_club ON video_uploads(club_id);
CREATE INDEX idx_club_invites_token ON club_invites(token);


-- ============================================================
-- AUTH TRIGGER: Auto-create profile on user signup
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Only auto-create profile if club_id is provided in metadata.
    -- Users created via the Supabase Auth dashboard without metadata
    -- will need their profile inserted manually.
    IF NEW.raw_user_meta_data->>'club_id' IS NOT NULL THEN
        INSERT INTO profiles (id, club_id, full_name, role)
        VALUES (
            NEW.id,
            (NEW.raw_user_meta_data->>'club_id')::UUID,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            COALESCE(NEW.raw_user_meta_data->>'role', 'coach')
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- UPDATED_AT TRIGGER for match_plans
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER match_plans_updated_at
    BEFORE UPDATE ON match_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
