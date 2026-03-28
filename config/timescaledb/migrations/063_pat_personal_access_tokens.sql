-- =============================================================================
-- Migration 063: Personal Access Tokens (PAT) support for api_keys
-- =============================================================================
-- See internal-docs/adr/003-pat-delegated-auth.md
-- =============================================================================

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS created_by_sub TEXT;

COMMENT ON COLUMN api_keys.created_by_sub IS 'Keycloak subject (sub) of the user who created this key; used for PAT audit.';

-- Hash lookup bypassing RLS for gateway validation path (called only from tenant-webhook internal endpoint).
CREATE OR REPLACE FUNCTION public.validate_pat_key_hash(p_key_hash TEXT)
RETURNS TABLE (
    tenant_id TEXT,
    valid BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ak.tenant_id::TEXT,
           (ak.is_active AND (ak.expires_at IS NULL OR ak.expires_at > NOW()))::BOOLEAN
    FROM api_keys ak
    WHERE ak.key_hash = p_key_hash
      AND ak.key_type = 'pat'
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validate_pat_key_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_pat_key_hash(TEXT) TO nekazari;

COMMENT ON FUNCTION public.validate_pat_key_hash(TEXT) IS
    'Returns tenant_id and validity for a PAT key hash; SECURITY DEFINER for PAT validation without RLS tenant context.';
