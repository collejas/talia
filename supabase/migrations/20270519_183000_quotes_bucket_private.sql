-- Ensure the quotes bucket is private so PDFs are only accessible via signed URLs.
begin;

update storage.buckets
set public = false
where name = 'quotes';

commit;
