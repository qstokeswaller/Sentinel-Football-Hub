-- ============================================================
-- Sentinel Football Hub — Full Production Schema
-- Last synced: 2026-04-04
-- This documents ALL tables in the live Supabase database.
-- ============================================================

-- ============================================================
-- CLUBS
-- ============================================================
CREATE TABLE clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PROFILES (linked to auth.users)
-- ============================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,  -- NULL for platform admins
    full_name TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'coach' CHECK (role IN ('super_admin', 'admin', 'coach', 'viewer', 'scout')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SQUADS
-- ============================================================
CREATE TABLE squads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age_group TEXT DEFAULT 'General',
    leagues JSONB DEFAULT '[]',
    coaches JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SQUAD COACHES (join table)
-- ============================================================
CREATE TABLE squad_coaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(squad_id, coach_id)
);

-- ============================================================
-- PLAYERS
-- ============================================================
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    squad_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    age TEXT,
    date_of_birth DATE,
    jersey_number TEXT,
    position TEXT,
    height TEXT,
    weight TEXT,
    foot TEXT DEFAULT 'Right',
    previous_clubs TEXT,
    current_club TEXT,
    school TEXT,
    new_to_club BOOLEAN DEFAULT false,
    nationality TEXT,
    join_date DATE,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    medical_info TEXT,
    bio TEXT,
    documents JSONB DEFAULT '[]',
    highlights JSONB DEFAULT '[]',
    analysis_videos JSONB DEFAULT '[]',
    profile_image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SESSIONS
-- ============================================================
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
    is_template BOOLEAN DEFAULT false,
    share_token TEXT UNIQUE,
    player_ids JSONB DEFAULT '[]',
    season TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- DRILLS
-- ============================================================
CREATE TABLE drills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT,
    description TEXT,
    pitch_type TEXT DEFAULT 'full',
    orientation TEXT DEFAULT 'landscape',
    drawing_data JSONB DEFAULT '{}',
    image TEXT,
    category TEXT DEFAULT 'General',
    category_tag TEXT,
    author TEXT,
    team TEXT,
    video_url TEXT,
    animation_id UUID REFERENCES animations(id) ON DELETE SET NULL,
    order_index INTEGER DEFAULT 0,
    phase INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ANIMATIONS (Konva.js keyframe data)
-- ============================================================
CREATE TABLE animations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT,
    pitch_type TEXT DEFAULT 'full',
    frame_duration INTEGER DEFAULT 1500,
    frames JSONB DEFAULT '[]',
    video_url TEXT,
    thumbnail TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MATCHES
-- ============================================================
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
    match_type TEXT DEFAULT 'team',
    watched_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    season TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MATCH PLAYER STATS
-- ============================================================
CREATE TABLE match_player_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    appeared BOOLEAN DEFAULT false,
    started BOOLEAN DEFAULT false,
    minutes_played INTEGER DEFAULT 0,
    goals INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    motm BOOLEAN DEFAULT false,
    rating INTEGER,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(match_id, player_id)
);

-- ============================================================
-- MATCH PLANS
-- ============================================================
CREATE TABLE match_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    squad_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    title TEXT,
    data JSONB DEFAULT '{}',
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- REPORTS (session reports)
-- ============================================================
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    title TEXT,
    date TEXT,
    focus TEXT,
    notes TEXT,
    rating INTEGER,
    attendance_count INTEGER DEFAULT 0,
    attendance_total INTEGER DEFAULT 0,
    absent_player_ids JSONB DEFAULT '[]',
    drills JSONB DEFAULT '[]',
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ASSESSMENTS (player assessments)
-- ============================================================
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    date TEXT,
    type TEXT,
    ratings JSONB DEFAULT '{}',
    notes TEXT,
    attachment TEXT,
    author TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SQUAD ASSESSMENTS
-- ============================================================
CREATE TABLE squad_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    date TEXT,
    context TEXT,
    ratings JSONB DEFAULT '{}',
    feedback JSONB DEFAULT '{}',
    author TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- DEV STRUCTURES (player development plans)
-- ============================================================
CREATE TABLE dev_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    date TEXT,
    structures JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- CALENDAR EVENTS
-- ============================================================
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'Custom',
    date DATE NOT NULL,
    start_time TEXT,
    end_time TEXT,
    location TEXT,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#64748b',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TRAINING ATTENDANCE
-- ============================================================
CREATE TABLE training_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    absent_player_ids JSONB DEFAULT '[]',
    attendance_count INTEGER NOT NULL DEFAULT 0,
    attendance_total INTEGER NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(session_id, squad_id)
);

-- ============================================================
-- CLUB INVITES
-- ============================================================
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
-- SCOUTED PLAYERS
-- ============================================================
CREATE TABLE scouted_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age TEXT,
    dob DATE,
    position TEXT,
    height TEXT,
    weight TEXT,
    foot TEXT,
    current_club TEXT,
    current_team TEXT,
    agent_name TEXT,
    agent_contact TEXT,
    scouting_status TEXT NOT NULL DEFAULT 'watching',
    target_squad_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    notes TEXT,
    photo_url TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SCOUTING REPORTS
-- ============================================================
CREATE TABLE scouting_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    scouted_player_id UUID NOT NULL REFERENCES scouted_players(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    ratings JSONB DEFAULT '{}',
    feedback JSONB DEFAULT '{}',
    match_context TEXT,
    scout_name TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    global_average NUMERIC,
    date TEXT,
    verdict TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SCOUTING VIDEOS
-- ============================================================
CREATE TABLE scouting_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    scouted_player_id UUID NOT NULL REFERENCES scouted_players(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PRICING RULES (Financials — private_coaching)
-- ============================================================
CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    description TEXT,
    conditions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INVOICES (Financials — private_coaching)
-- ============================================================
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(10,2) DEFAULT 0,
    discount NUMERIC(10,2) DEFAULT 0,
    penalties NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2) DEFAULT 0,
    notes TEXT,
    line_items JSONB DEFAULT '[]',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(club_id, player_id, month)
);

-- ============================================================
-- VIDEO UPLOADS (R2 storage references)
-- ============================================================
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

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_profiles_club ON profiles(club_id);
CREATE INDEX idx_squads_club ON squads(club_id);
CREATE INDEX idx_squad_coaches_coach ON squad_coaches(coach_id);
CREATE INDEX idx_players_club ON players(club_id);
CREATE INDEX idx_players_squad ON players(squad_id);
CREATE INDEX idx_sessions_club ON sessions(club_id);
CREATE INDEX idx_sessions_date ON sessions(date);
CREATE INDEX idx_drills_club ON drills(club_id);
CREATE INDEX idx_drills_session ON drills(session_id);
CREATE INDEX idx_drills_animation ON drills(animation_id);
CREATE INDEX idx_drills_category_tag ON drills(category_tag);
CREATE INDEX idx_matches_club ON matches(club_id);
CREATE INDEX idx_matches_squad ON matches(squad_id);
CREATE INDEX idx_match_player_stats_match ON match_player_stats(match_id);
CREATE INDEX idx_match_player_stats_player ON match_player_stats(player_id);
CREATE INDEX idx_reports_club ON reports(club_id);
CREATE INDEX idx_reports_session ON reports(session_id);
CREATE INDEX idx_assessments_player ON assessments(player_id);
CREATE INDEX idx_calendar_events_club ON calendar_events(club_id);
CREATE INDEX idx_training_attendance_session ON training_attendance(session_id);
CREATE INDEX idx_club_invites_token ON club_invites(token);
CREATE INDEX idx_pricing_rules_club ON pricing_rules(club_id);
CREATE INDEX idx_invoices_club_month ON invoices(club_id, month);
CREATE INDEX idx_invoices_player ON invoices(player_id);
CREATE INDEX idx_scouted_players_club ON scouted_players(club_id);
CREATE INDEX idx_scouting_reports_player ON scouting_reports(scouted_player_id);
