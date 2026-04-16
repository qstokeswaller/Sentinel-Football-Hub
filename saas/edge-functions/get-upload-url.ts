/**
 * Supabase Edge Function: get-upload-url
 * Generates a presigned PUT URL for uploading videos to Cloudflare R2.
 *
 * Deploy: supabase functions deploy get-upload-url
 *
 * Request:
 *   POST /functions/v1/get-upload-url
 *   Headers: Authorization: Bearer <supabase_access_token>
 *   Body: { filename: string, contentType: string, category: 'player'|'match'|'general', linkedId?: string }
 *
 * Response:
 *   { uploadUrl: string, objectKey: string, publicUrl: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3'
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Verify auth
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

        // Get user's club_id
        const { data: profile } = await supabase
            .from('profiles')
            .select('club_id')
            .eq('id', user.id)
            .single()

        if (!profile) {
            return new Response(JSON.stringify({ error: 'Profile not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const { filename, contentType, category, linkedId } = await req.json()

        if (!filename || !contentType) {
            return new Response(JSON.stringify({ error: 'filename and contentType are required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Build R2 object key
        const timestamp = Date.now()
        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        let objectKey = `${profile.club_id}/`

        if (category === 'player' && linkedId) {
            objectKey += `players/${linkedId}/${timestamp}_${safeFilename}`
        } else if (category === 'match' && linkedId) {
            objectKey += `matches/${linkedId}/${timestamp}_${safeFilename}`
        } else {
            objectKey += `general/${timestamp}_${safeFilename}`
        }

        // Create R2 presigned URL
        const r2Client = new S3Client({
            region: 'auto',
            endpoint: `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
                secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
            },
        })

        const command = new PutObjectCommand({
            Bucket: Deno.env.get('R2_BUCKET_NAME') || 'football-hub-videos',
            Key: objectKey,
            ContentType: contentType,
        })

        const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 }) // 1 hour

        const publicDomain = Deno.env.get('R2_PUBLIC_DOMAIN') || ''
        const publicUrl = publicDomain ? `https://${publicDomain}/${objectKey}` : ''

        return new Response(JSON.stringify({
            uploadUrl,
            objectKey,
            publicUrl,
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
