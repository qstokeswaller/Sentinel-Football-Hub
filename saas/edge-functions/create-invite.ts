/**
 * Supabase Edge Function: create-invite
 * Creates an invite link for a new user to join a club.
 * Only admins can create invites.
 *
 * Deploy: supabase functions deploy create-invite
 *
 * Request:
 *   POST /functions/v1/create-invite
 *   Headers: Authorization: Bearer <supabase_access_token>
 *   Body: { email?: string, role: 'admin'|'coach'|'viewer' }
 *
 * Response:
 *   { inviteUrl: string, token: string, expiresAt: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
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

        // Check if user is admin
        const { data: profile } = await supabase
            .from('profiles')
            .select('club_id, role')
            .eq('id', user.id)
            .single()

        if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
            return new Response(JSON.stringify({ error: 'Only admins can create invites' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const { email, role = 'coach' } = await req.json()

        if (!['admin', 'coach', 'viewer'].includes(role)) {
            return new Response(JSON.stringify({ error: 'Invalid role' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Generate secure token
        const tokenBytes = new Uint8Array(32)
        crypto.getRandomValues(tokenBytes)
        const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')

        // Expires in 7 days
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

        // Use service role client to bypass RLS for insert
        const adminSupabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const { error: insertError } = await adminSupabase
            .from('club_invites')
            .insert({
                club_id: profile.club_id,
                created_by: user.id,
                email: email || null,
                role,
                token,
                expires_at: expiresAt,
            })

        if (insertError) {
            console.error('Insert error:', insertError)
            return new Response(JSON.stringify({ error: 'Failed to create invite' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Build invite URL
        const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
        const inviteUrl = `${appUrl}/src/pages/login.html?invite=${token}`

        return new Response(JSON.stringify({
            inviteUrl,
            token,
            expiresAt,
            role,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('Error:', error)
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
