/**
 * Supabase Edge Function: provision-club-admin
 * Creates a club + invites the admin via Supabase magic link email.
 * Only platform admins (super_admin) can call this.
 *
 * Deploy: supabase functions deploy provision-club-admin
 * Set secrets: supabase secrets set APP_URL=https://your-live-domain.com
 *
 * Request:
 *   POST /functions/v1/provision-club-admin
 *   Headers: Authorization: Bearer <supabase_access_token>
 *   Body: {
 *     clubName: string,
 *     adminEmail: string,
 *     adminName: string,
 *     archetype: 'academy' | 'private_coaching',
 *     logoUrl?: string  // optional — already uploaded to storage
 *   }
 *
 * Response:
 *   { clubId: string, message: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildDefaultSettings(archetype: string) {
    const base: Record<string, unknown> = {
        archetype,
        plan: 'trial',
        status: 'active',
        branding: {},
        features: {},
    }

    if (archetype === 'academy') {
        base.features = {
            squads: true,
            matches: true,
            analytics: true,
            session_planner: true,
            match_plans: true,
            scouting: true,
            reports: true,
            assessments: true,
            training_register: true,
        }
    } else if (archetype === 'private_coaching') {
        base.features = {
            squads: true,
            matches: true,
            analytics: true,
            session_planner: true,
            match_plans: false,
            scouting: false,
            reports: true,
            assessments: true,
            training_register: true,
        }
    }
    return base
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Authenticate the calling user (platform admin)
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Verify caller is platform admin
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, club_id')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'super_admin') {
            return new Response(JSON.stringify({ error: 'Only platform admins can provision clubs' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const { clubName, adminEmail, adminName, archetype, logoUrl } = await req.json()

        if (!clubName || !adminEmail || !adminName) {
            return new Response(JSON.stringify({ error: 'clubName, adminEmail, and adminName are required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Service role client — bypasses RLS, can use admin auth API
        const adminSupabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        // 1. Create the club
        const settings = buildDefaultSettings(archetype || 'academy')
        settings.branding = {
            club_display_name: clubName,
            ...(logoUrl ? { logo_url: logoUrl } : {}),
        }

        const { data: club, error: clubError } = await adminSupabase
            .from('clubs')
            .insert({ name: clubName, settings })
            .select('id')
            .single()

        if (clubError) {
            console.error('Club creation failed:', clubError)
            return new Response(JSON.stringify({ error: 'Failed to create club: ' + clubError.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 2. Invite the admin via Supabase magic link
        //    This creates the auth user AND sends the email in one call.
        //    The redirect URL points to the live app's login page.
        const appUrl = (Deno.env.get('APP_URL') || 'https://sentinel-football-hub.vercel.app').replace(/\/+$/, '')
        const redirectTo = `${appUrl}/src/pages/login.html`

        const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
            adminEmail,
            {
                data: {
                    full_name: adminName,
                    club_id: club.id,
                    role: 'admin',
                },
                redirectTo,
            }
        )

        if (inviteError) {
            console.error('Invite email failed:', inviteError)
            // Club was created but invite failed — still return the club ID
            return new Response(JSON.stringify({
                clubId: club.id,
                error: 'Club created but invite email failed: ' + inviteError.message,
                fallbackMessage: 'You can manually create an invite link from the club detail view.',
            }), {
                status: 207, // multi-status
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 3. Pre-create the profile row so it's ready when the admin clicks the link
        const { error: profileError } = await adminSupabase
            .from('profiles')
            .upsert({
                id: inviteData.user.id,
                full_name: adminName,
                club_id: club.id,
                role: 'admin',
                email: adminEmail,
            }, { onConflict: 'id' })

        if (profileError) {
            console.error('Profile creation warning:', profileError)
            // Non-fatal — the auth trigger or first login will create it
        }

        return new Response(JSON.stringify({
            clubId: club.id,
            userId: inviteData.user.id,
            message: `Club "${clubName}" created. Invite email sent to ${adminEmail}.`,
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('Error:', error)
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
