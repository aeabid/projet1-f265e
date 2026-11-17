-- رفع الصورة كان يفشل (400): الرفع مع upsert يحتاج قراءة الملف، ولم تكن هناك سياسة قراءة في حاوية الصور
create policy "avatars own read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
