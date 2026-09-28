-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 13: site content (Phase 9, 2026-09-29).
-- Each case runs in its own rolled-back subtransaction; nothing it writes survives.
--
--   who may call      super_admin -> ok; the six other admin roles and a buyer -> 42501;
--                     anon -> 42501 (no EXECUTE)
--   banner rules      a blank or 81-character headline, a button with no destination,
--                     six unsafe destinations, a foreign or never-uploaded image and a
--                     schedule that ends before it starts -> 22023; an unknown id -> P0002
--   lifecycle         create (last position, with a planted image object), edit,
--                     deactivate, reorder (and a partial order -> 22023), delete (returns
--                     the image path; again -> P0002); the Admin Log names the actor
--   public read       anon sees active banners that haven't ended, not inactive or ended
--                     ones, never created_by, and can't write; the theme is readable
--   theme             get returns the saved theme, defaults, 10 fonts and the floors; a
--                     bad hex, an unoffered font, low-contrast text and a light accent
--                     -> 22023; a good save lands lowercased and anon reads it
--   storage           a super admin may write banners/<uuid>.<ext> in site-content, and
--                     nothing else there or in site-config; vendor_ops may not
--   snapshot          three writes in one transaction queue exactly one rebuild call
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h13$
declare
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  labels text[] := array[
    'super_admin', 'vendor_ops', 'product_moderator', 'support', 'finance_admin', 'ads_moderator', 'manager',
    'buyer', 'anon', 'banner rules', 'lifecycle', 'public read', 'theme', 'storage', 'snapshot'];
  roles  text[] := array['super_admin', 'vendor_ops', 'product_moderator', 'support', 'finance_admin', 'ads_moderator', 'manager'];
  i int; n int; t text; j jsonb; a uuid; b uuid; img text; img2 text; q0 int;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      insert into admin.admin_users (id, admin_role, is_active)
      values (pr, (case when i between 1 and 7 then roles[i] else 'super_admin' end)::public.admin_role_type, true)
      on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;

      if i = 9 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      elsif i <> 12 then
        perform set_config('request.jwt.claims', json_build_object('sub', case when i = 8 then buyer else pr end, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', (case when i = 8 then buyer else pr end)::text, true);
        set local role authenticated;
      end if;

      if i <= 9 then
        j := public.admin_site_banners();
        raise exception using errcode = 'P0099', message = format('%s banners listed', jsonb_array_length(j));

      elsif i = 10 then
        t := '';
        begin perform public.admin_site_banner_save(p_title => '   '); exception when others then t := t || 'blank ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => repeat('x', 81)); exception when others then t := t || '81 chars ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => 'H13', p_cta_label => 'Go'); exception when others then t := t || 'button, no path ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => 'H13', p_link_path => '//evil.example'); exception when others then t := t || '//x ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => 'H13', p_link_path => '/\evil.example'); exception when others then t := t || '/\x ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => 'H13', p_link_path => 'https://evil.example'); exception when others then t := t || 'https ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => 'H13', p_link_path => 'javascript:alert(1)'); exception when others then t := t || 'javascript: ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => 'H13', p_link_path => '/a b'); exception when others then t := t || 'space ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => 'H13', p_link_path => '/x"><script>'); exception when others then t := t || 'quote ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => 'H13', p_image_path => 'other/x.png'); exception when others then t := t || 'foreign image ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => 'H13', p_image_path => 'banners/' || gen_random_uuid() || '.png'); exception when others then t := t || 'not uploaded ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_title => 'H13', p_starts_at => now(), p_ends_at => now() - interval '1 day'); exception when others then t := t || 'ends first ' || sqlstate || '; '; end;
        begin perform public.admin_site_banner_save(p_id => gen_random_uuid(), p_title => 'H13'); exception when others then t := t || 'unknown id ' || sqlstate; end;
        raise exception using errcode = 'P0099', message = t;

      elsif i = 11 then
        -- Plant the image object as postgres, then save as the admin.
        reset role;
        img := 'banners/' || gen_random_uuid() || '.webp';
        insert into storage.objects (bucket_id, name) values ('site-content', img);
        set local role authenticated;
        n := jsonb_array_length(public.admin_site_banners());
        a := public.admin_site_banner_save(p_title => '  H13 banner  ', p_subtitle => 'H13 sub', p_cta_label => 'Open',
                                           p_link_path => '/advertisements?from=h13', p_image_path => img);
        b := public.admin_site_banner_save(p_title => 'H13 second');
        j := public.admin_site_banners();
        t := format('listed %s -> %s; new at positions %s, %s; title "%s"', n, jsonb_array_length(j),
                    (select e ->> 'position' from jsonb_array_elements(j) e where e ->> 'id' = a::text),
                    (select e ->> 'position' from jsonb_array_elements(j) e where e ->> 'id' = b::text),
                    (select e ->> 'title' from jsonb_array_elements(j) e where e ->> 'id' = a::text));
        perform public.admin_site_banner_save(p_id => a, p_title => 'H13 banner', p_link_path => '/advertisements',
                                              p_image_path => img, p_active => false);
        t := t || format('; after edit active=%s', (select e ->> 'active' from jsonb_array_elements(public.admin_site_banners()) e
                                                     where e ->> 'id' = a::text));
        -- Reorder: reverse everything; then a partial list is refused.
        perform public.admin_site_banner_reorder(
          (select array_agg((e ->> 'id')::uuid order by (e ->> 'position')::int desc) from jsonb_array_elements(public.admin_site_banners()) e));
        t := t || format('; reversed: first is now %s', (select e ->> 'title' from jsonb_array_elements(public.admin_site_banners()) e
                                                           order by (e ->> 'position')::int limit 1));
        begin perform public.admin_site_banner_reorder(array[a]); exception when others then t := t || '; partial order ' || sqlstate; end;
        img2 := public.admin_site_banner_delete(a);
        t := t || format('; delete returns the image path %s', img2 = img);
        begin perform public.admin_site_banner_delete(a); exception when others then t := t || '; again ' || sqlstate; end;
        reset role;
        t := t || format('; Admin Log rows by the admin: %s',
                 (select string_agg(x.action || ' ' || x.n, ', ' order by x.action) from (
                    select l.action, count(*) as n from admin.audit_log l
                     where l.target_table = 'public.site_banners' and l.actor_id = pr group by l.action) x));
        raise exception using errcode = 'P0099', message = t;

      elsif i = 12 then
        -- Fixtures as postgres: one active, one inactive, one ended, one starting tomorrow.
        insert into public.site_banners (title, active, starts_at, ends_at, position) values
          ('H13 live', true, null, null, 90), ('H13 off', false, null, null, 91),
          ('H13 ended', true, now() - interval '2 days', now() - interval '1 day', 92),
          ('H13 tomorrow', true, now() + interval '1 day', null, 93);
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
        select string_agg(x.title, ',' order by x.position) into t from public.site_banners x where x.title like 'H13%';
        t := 'anon sees ' || coalesce(t, '-');
        t := t || format('; theme rows %s', (select count(*) from public.site_theme));
        begin perform x.created_by from public.site_banners x limit 1; exception when others then t := t || '; created_by ' || sqlstate; end;
        begin insert into public.site_banners (title) values ('H13 anon'); exception when others then t := t || '; anon insert ' || sqlstate; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', buyer::text, true);
        set local role authenticated;
        begin update public.site_theme set ink = '#000000'; exception when others then t := t || '; buyer theme update ' || sqlstate; end;
        begin delete from public.site_banners; exception when others then t := t || '; buyer delete ' || sqlstate; end;
        raise exception using errcode = 'P0099', message = t;

      elsif i = 13 then
        j := public.admin_site_theme_get();
        t := format('saved ink %s, heading %s; %s fonts; floors %s/%s; defaults ink %s',
                    j -> 'theme' ->> 'ink', j -> 'theme' ->> 'heading_font', jsonb_array_length(j -> 'fonts'),
                    j -> 'floors' ->> 'ink_on_white', j -> 'floors' ->> 'white_on_accent', j -> 'defaults' ->> 'ink');
        begin perform public.admin_site_theme_save('blue', '#ef4d62', '#14ae5c', '#d0d4dc', '#363636', 'Roboto', 'Open Sans');
        exception when others then t := t || '; bad hex ' || sqlstate; end;
        begin perform public.admin_site_theme_save('#256fef', '#ef4d62', '#14ae5c', '#d0d4dc', '#363636', 'Comic Sans MS', 'Open Sans');
        exception when others then t := t || '; unoffered font ' || sqlstate; end;
        begin perform public.admin_site_theme_save('#256fef', '#ef4d62', '#14ae5c', '#d0d4dc', '#aaaaaa', 'Roboto', 'Open Sans');
        exception when others then t := t || '; grey text ' || sqlstate || ' (' || sqlerrm || ')'; end;
        begin perform public.admin_site_theme_save('#ffcc00', '#ef4d62', '#14ae5c', '#d0d4dc', '#363636', 'Roboto', 'Open Sans');
        exception when others then t := t || '; yellow accent ' || sqlstate; end;
        j := public.admin_site_theme_save('#1F5FE0', '#EF4D62', '#14AE5C', '#D0D4DC', '#222222', 'Inter', 'Mukta');
        t := t || format('; saved %s %s %s/%s', j ->> 'vendor_accent', j ->> 'ink', j ->> 'heading_font', j ->> 'body_font');
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
        t := t || format('; anon reads ink %s', (select x.ink from public.site_theme x));
        reset role;
        t := t || format('; Admin Log theme updates by the admin: %s',
                 (select count(*) from admin.audit_log l where l.target_table = 'public.site_theme' and l.actor_id = pr and l.action = 'update'));
        update admin.admin_users set admin_role = 'vendor_ops' where id = pr;
        perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', pr::text, true);
        set local role authenticated;
        begin perform public.admin_site_theme_save('#256fef', '#ef4d62', '#14ae5c', '#d0d4dc', '#363636', 'Roboto', 'Open Sans');
        exception when others then t := t || '; vendor_ops save ' || sqlstate; end;
        raise exception using errcode = 'P0099', message = t;

      elsif i = 14 then
        t := '';
        begin insert into storage.objects (bucket_id, name) values ('site-content', 'banners/' || gen_random_uuid() || '.webp'); t := t || 'uuid.webp ok';
        exception when others then t := t || 'uuid.webp ' || sqlstate; end;
        begin insert into storage.objects (bucket_id, name) values ('site-content', 'banners/logo.webp'); t := t || '; logo.webp ok';
        exception when others then t := t || '; logo.webp ' || sqlstate; end;
        begin insert into storage.objects (bucket_id, name) values ('site-content', 'other/' || gen_random_uuid() || '.webp'); t := t || '; other/ ok';
        exception when others then t := t || '; other/ ' || sqlstate; end;
        begin insert into storage.objects (bucket_id, name) values ('site-config', 'site.json'); t := t || '; site-config ok';
        exception when others then t := t || '; site-config ' || sqlstate; end;
        reset role;
        update admin.admin_users set admin_role = 'vendor_ops' where id = pr;
        set local role authenticated;
        begin insert into storage.objects (bucket_id, name) values ('site-content', 'banners/' || gen_random_uuid() || '.webp'); t := t || '; vendor_ops ok';
        exception when others then t := t || '; vendor_ops ' || sqlstate; end;
        raise exception using errcode = 'P0099', message = t;

      elsif i = 15 then
        reset role;
        -- A fresh transaction starts with the flag unset; the rehearsal's seed set it already.
        perform set_config('cosora.site_config_snapshot_queued', '', true);
        select count(*) into q0 from net.http_request_queue q where q.url like '%/site-config-snapshot';
        set local role authenticated;
        a := public.admin_site_banner_save(p_title => 'H13 queue one');
        b := public.admin_site_banner_save(p_title => 'H13 queue two');
        perform public.admin_site_theme_save('#256fef', '#ef4d62', '#14ae5c', '#d0d4dc', '#363636', 'Roboto', 'Open Sans');
        reset role;
        raise exception using errcode = 'P0099', message = format('rebuild calls queued: %s',
          (select count(*) from net.http_request_queue q where q.url like '%/site-config-snapshot') - q0);
      end if;
      raise exception using errcode = 'P0099', message = 'no error';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 140) || E'\n';
    end;
  end loop;
  raise exception 'H13 (rolled back)%', E'\n' || out;
end
$h13$;
