-- Apply only to the dedicated GENZ Supabase project, after inspecting existing storage policies.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('genz-evidence','genz-evidence',false,5242880,ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;
-- No anon/authenticated object policies are added. All file requests pass through
-- authenticated GENZ routes; the storage secret stays on the server.
