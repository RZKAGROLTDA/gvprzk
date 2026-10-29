import type { SpecialCondition } from '@/hooks/useSpecialConditions';
import { conditionTypeLabel } from '@/lib/specialConditions';

export function specialConditionExcelRows(list: SpecialCondition[], sellers: Map<string, string>) {
  return list.map(e => ({
    'Código Cliente': e.client_code,
    'Cliente': e.client_name,
    'Filial': e.filial_name || '',
    'Vendedor': e.seller_name || sellers.get(e.seller_id) || '',
    'Valor Venda': Number(e.sale_value || 0),
    'Desconto %': Number(e.discount_percent || 0),
    'Tipo de Condição': e.condition_type ? conditionTypeLabel(e.condition_type) : '',
    'Margem %': e.margin_percent === null ? '' : Number(e.margin_percent),
    'Desconto Total': Number(e.total_discount_value || 0),
    'NF': e.invoice_number || '',
    'Cond. Pagamento': e.payment_condition || '',
    'Parcelamento': e.installments || '',
    'Tipo Pagamento': e.payment_type || '',
    'Data Venda': e.sale_date || '',
    'Data Pagamento': e.payment_date || '',
    'Status': e.status,
    'Aprovado por': e.approved_by ? sellers.get(e.approved_by) || '' : '',
    'Aprovado em': e.approved_at ? new Date(e.approved_at).toLocaleString('pt-BR') : '',
    'Observação': e.observation || '',
  }));
}