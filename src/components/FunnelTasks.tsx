/**
 * ⚠️ LEGADO REMOVIDO — Fase 3 padronização
 *
 * O antigo `FunnelTasks` usava `tasks.created_at` + `tasks.task_type` + filial texto,
 * o que gerava divergência com o CRM Agenda (ex.: "Visita" em 05/05 que não existe
 * em `task_followups`).
 *
 * Fonte operacional oficial agora é sempre:
 *   - tabela:  task_followups
 *   - data:    activity_date
 *   - tipo:    activity_type
 *   - filial:  filial_id
 *   - vendedor: responsible_user_id
 *   - RPC:     get_reports_dataset_v2
 *
 * Este arquivo apenas re-exporta a implementação oficial para impedir regressões.
 */
export { FunnelTasksOptimized as FunnelTasks } from './FunnelTasksOptimized';
