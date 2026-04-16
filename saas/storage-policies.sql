-- ============================================================
-- Football Performance Hub — Supabase Storage Bucket Policies
-- Run AFTER rls-policies.sql in Supabase SQL Editor
-- ============================================================
-- Note: Buckets must be created in the Supabase Dashboard first
-- (Storage > New Bucket), then apply these policies.
--
-- Bucket creation settings:
--   - report-attachments: Private, 50MB file limit
--   - player-documents:   Private, 25MB file limit
--   - drill-images:       Private, 10MB file limit
--   - session-images:     Private, 10MB file limit
--   - avatars:            Private, 5MB file limit
--
-- File path convention: {club_id}/{optional_subfolder}/{filename}
-- ============================================================


-- ── report-attachments ──────────────────────────────────────
-- PDFs, images, and other files attached to training reports

CREATE POLICY "report_attachments_select"
ON storage.objects FOR SELECT USING (
    bucket_id = 'report-attachments'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
);

CREATE POLICY "report_attachments_insert"
ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'report-attachments'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
);

CREATE POLICY "report_attachments_delete"
ON storage.objects FOR DELETE USING (
    bucket_id = 'report-attachments'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
    AND public.is_admin()
);


-- ── player-documents ────────────────────────────────────────
-- Contracts, medical records, IDs, etc.

CREATE POLICY "player_documents_select"
ON storage.objects FOR SELECT USING (
    bucket_id = 'player-documents'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
);

CREATE POLICY "player_documents_insert"
ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'player-documents'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
);

CREATE POLICY "player_documents_delete"
ON storage.objects FOR DELETE USING (
    bucket_id = 'player-documents'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
    AND public.is_admin()
);


-- ── drill-images ────────────────────────────────────────────
-- Canvas PNG snapshots from the drill builder

CREATE POLICY "drill_images_select"
ON storage.objects FOR SELECT USING (
    bucket_id = 'drill-images'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
);

CREATE POLICY "drill_images_insert"
ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'drill-images'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
);

CREATE POLICY "drill_images_delete"
ON storage.objects FOR DELETE USING (
    bucket_id = 'drill-images'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
);


-- ── session-images ──────────────────────────────────────────
-- Session cover/thumbnail images

CREATE POLICY "session_images_select"
ON storage.objects FOR SELECT USING (
    bucket_id = 'session-images'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
);

CREATE POLICY "session_images_insert"
ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'session-images'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
);

CREATE POLICY "session_images_delete"
ON storage.objects FOR DELETE USING (
    bucket_id = 'session-images'
    AND (storage.foldername(name))[1] = public.get_my_club_id()::TEXT
);


-- ── avatars ─────────────────────────────────────────────────
-- User profile photos
-- Path convention: {user_id}/{filename}

CREATE POLICY "avatars_select"
ON storage.objects FOR SELECT USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

CREATE POLICY "avatars_insert"
ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

CREATE POLICY "avatars_update"
ON storage.objects FOR UPDATE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

CREATE POLICY "avatars_delete"
ON storage.objects FOR DELETE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);
