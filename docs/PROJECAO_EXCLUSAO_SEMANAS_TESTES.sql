-- Somente PostgreSQL isolado com fixture de acesso; nunca executar no GVPS.
BEGIN;
INSERT INTO public.filiais(id,nome) VALUES
 ('10000000-0000-0000-0000-000000000001','Querência'),
 ('10000000-0000-0000-0000-000000000002','Canarana'),
 ('10000000-0000-0000-0000-000000000003','Tele Vendas');
INSERT INTO public.profiles(user_id,name,filial_id,approval_status,employment_status) VALUES
 ('20000000-0000-0000-0000-000000000001','Admin','10000000-0000-0000-0000-000000000001','approved','active'),
 ('20000000-0000-0000-0000-000000000002','Supervisor','10000000-0000-0000-0000-000000000001','approved','active'),
 ('20000000-0000-0000-0000-000000000003','Gerente','10000000-0000-0000-0000-000000000001','approved','active');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('20000000-0000-0000-0000-000000000001','admin'),
 ('20000000-0000-0000-0000-000000000002','supervisor'),
 ('20000000-0000-0000-0000-000000000003','manager');
INSERT INTO public.user_filiais(user_id,filial_id) VALUES
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001');
CREATE FUNCTION pg_temp.assert_ok(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION pg_temp.reject(command text,code text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=code THEN RAISE NOTICE 'PASS: %',label; RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'FAIL: % não recusado',label;
END $$;
SELECT set_config('test.uid','20000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE f uuid := '10000000-0000-0000-0000-000000000001';
  other uuid := '10000000-0000-0000-0000-000000000002';
  e1 uuid; e3 uuid; e4 uuid; e_new uuid; other_entry uuid;
  original jsonb; p record; v bigint;
BEGIN
  INSERT INTO public.projection_goals(filial_id,ano,mes,meta) VALUES(f,2026,11,2000);
  e1:=public.projection_save_entry(f,f,2026,11,1,1000,1200,'original');
  e3:=public.projection_save_entry(f,f,2026,11,3,1500,1700,'S3');
  e4:=public.projection_save_entry(f,f,2026,11,4,1800.25,1900.50,'S4');
  other_entry:=public.projection_save_entry(other,other,2026,11,1,500,600,NULL);
  SELECT to_jsonb(e) INTO original FROM public.projection_entries e WHERE id=e4;
  PERFORM pg_temp.reject(format('SELECT public.projection_delete_entry(%L,%L,1,%L)',f,e4,'  '),'22023','Motivo obrigatório');
  PERFORM public.projection_delete_entry(f,e4,1,'Lançamento incorreto');
  SELECT filial_id,meta,s4_sem,ultima_semana,ultima_sem_risco INTO p FROM public.get_projection_panel(f,2026,11);
  PERFORM pg_temp.assert_ok(p.s4_sem IS NULL AND p.ultima_semana=3 AND p.ultima_sem_risco=1500,'Excluir S4 retorna S3 sem somar semanas');
  PERFORM pg_temp.assert_ok(p.meta=2000,'Meta preservada');
  PERFORM pg_temp.assert_ok(EXISTS(SELECT 1 FROM public.projection_entries e WHERE e.id=e4 AND
    to_jsonb(e)-ARRAY['deleted_at','deleted_by','deletion_reason','version']=original-ARRAY['deleted_at','deleted_by','deletion_reason','version']), 'Dados e datas originais preservados');
  PERFORM pg_temp.assert_ok(EXISTS(SELECT 1 FROM public.projection_entry_history h JOIN public.projection_entries e ON e.id=h.entry_id WHERE e.id=e4 AND h.entry_snapshot->'lancamento'=to_jsonb(e) AND h.deletion_reason='Lançamento incorreto' AND h.changed_by=auth.uid() AND h.changed_at=e.deleted_at),'Snapshot, motivo, autor e horário corretos');
  PERFORM pg_temp.reject(format('SELECT public.projection_delete_entry(%L,%L,1,%L)',f,e4,'duplicada'),'40001','Exclusão repetida recusada');
  PERFORM pg_temp.reject(format('UPDATE public.projection_entries SET sem_risco=10 WHERE id=%L',e4),'55000','Excluído não pode ser alterado');
  PERFORM pg_temp.reject(format('DELETE FROM public.projection_entries WHERE id=%L',e1),'55000','Exclusão física bloqueada');
  PERFORM pg_temp.reject(format('UPDATE public.projection_entry_history SET observacao=%L WHERE entry_id=%L','nova',e4),'55000','Histórico não pode ser alterado');
  PERFORM pg_temp.reject(format('DELETE FROM public.projection_entry_history WHERE entry_id=%L',e4),'55000','Histórico não pode ser apagado');
  UPDATE public.profiles SET name='Admin renomeado' WHERE user_id=auth.uid();
  PERFORM pg_temp.assert_ok(EXISTS(SELECT 1 FROM public.get_projection_deleted_entry(f,e4) d WHERE d.snapshot->>'excluido_por_nome'='Admin'),'Snapshot preserva nome após renomeação');
  e_new:=public.projection_save_entry(f,f,2026,11,4,1850,1950,'Novo S4');
  PERFORM pg_temp.assert_ok(e_new<>e4 AND (SELECT count(*) FROM public.projection_entries WHERE filial_id=f AND semana=4 AND deleted_at IS NULL)=1,'Relançamento recebe novo UUID e único ativo');
  PERFORM public.projection_save_entry(f,f,2026,11,4,1860,1960,'editado');
  PERFORM pg_temp.reject(format('SELECT public.projection_delete_entry(%L,%L,1,%L)',f,e_new,'desatualizada'),'40001','Versão antiga após edição recusada');
  SELECT version INTO v FROM public.projection_entries WHERE id=e_new;
  PERFORM public.projection_delete_entry(f,e_new,v,'Exclusão válida');
  PERFORM public.projection_delete_entry(f,e3,1,'Remover S3');
  PERFORM pg_temp.assert_ok((SELECT ultima_semana=1 FROM public.get_projection_panel(f,2026,11)),'Sem S2 retorna S1');
  PERFORM public.projection_delete_entry(f,e1,1,'Remover única válida');
  PERFORM pg_temp.assert_ok((SELECT ultima_semana IS NULL AND ultima_sem_risco IS NULL AND s1_sem IS NULL AND s3_sem IS NULL AND s4_sem IS NULL FROM public.get_projection_panel(f,2026,11)),'Sem semanas ativas fica pendente');
  PERFORM pg_temp.assert_ok((SELECT count(*) FROM public.get_projection_entries(f,2026,11))=0,'Listagem ignora excluídos');
  PERFORM pg_temp.assert_ok((SELECT count(*) FROM public.get_projection_deletions(f,2026,11))=4,'Histórico lista quatro exclusões');
  PERFORM set_config('test.uid','20000000-0000-0000-0000-000000000003',true);
  PERFORM pg_temp.reject(format('SELECT public.projection_delete_entry(%L,%L,1,%L)',f,other_entry,'gerente'),'42501','Gerente não exclui');
  PERFORM set_config('test.uid','20000000-0000-0000-0000-000000000002',true);
  PERFORM pg_temp.reject(format('SELECT public.projection_delete_entry(%L,%L,1,%L)',other,other_entry,'fora do escopo'),'42501','Supervisor não exclui filial não autorizada');
  PERFORM pg_temp.reject(format('SELECT public.projection_delete_entry(NULL,%L,1,%L)',other_entry,'sem ativa'),'42501','Supervisor sem Filial Ativa recusado');
  e_new:=public.projection_save_entry(f,f,2026,11,2,1300,1400,'supervisor');
  PERFORM public.projection_delete_entry(f,e_new,1,'Supervisor autorizado');
  PERFORM pg_temp.assert_ok(EXISTS(SELECT 1 FROM public.projection_entries WHERE id=e_new AND deleted_by=auth.uid()),'Supervisor exclui sua Filial Ativa');
  PERFORM set_config('test.uid','20000000-0000-0000-0000-000000000001',true);
  PERFORM pg_temp.reject('SELECT public.projection_save_entry(NULL,''10000000-0000-0000-0000-000000000003'',2026,11,1,1,1,NULL)','42501','Tele Vendas recusada para admin');
  UPDATE public.profiles SET employment_status='inactive' WHERE user_id=auth.uid();
  PERFORM pg_temp.reject(format('SELECT public.projection_delete_entry(%L,%L,1,%L)',other,other_entry,'inativo'),'42501','Admin inativo recusado');
  PERFORM set_config('test.uid','',true);
  PERFORM pg_temp.reject(format('SELECT public.projection_delete_entry(%L,%L,1,%L)',other,other_entry,'anônimo'),'42501','Anônimo recusado');
  PERFORM pg_temp.assert_ok(NOT has_table_privilege('authenticated','public.projection_entries','UPDATE') AND NOT has_table_privilege('authenticated','public.projection_entry_history','SELECT'),'Tabelas fechadas para usuários comuns');
END $$;
ROLLBACK;