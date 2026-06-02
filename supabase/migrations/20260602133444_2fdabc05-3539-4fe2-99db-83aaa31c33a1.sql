DROP POLICY IF EXISTS "deviation-photos public read" ON storage.objects;

-- Allow only signed-in users (qualidade/pcp) to list/select bucket objects.
-- Public URL access via getPublicUrl still works because the bucket is public.
CREATE POLICY "deviation-photos auth read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'deviation-photos'
  AND (is_qualidade(auth.uid()) OR is_pcp(auth.uid()))
);