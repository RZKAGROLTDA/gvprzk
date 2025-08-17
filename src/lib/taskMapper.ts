
import { Task } from '@/types/task';
import { resolveFilialName, loadFiliaisCache } from './taskStandardization';

// Utility function to map Supabase task data to application Task format
export const mapSupabaseTaskToTask = (supabaseTask: any): Task => {
  console.log('🔍 MAPPER: Mapeando tarefa do Supabase:', supabaseTask.id, {
    is_prospect: supabaseTask.is_prospect,
    sales_confirmed: supabaseTask.sales_confirmed,
    sales_value: supabaseTask.sales_value,
    filial: supabaseTask.filial
  });
  
  console.log('🔍 MAPPER: Tipos dos valores:', {
    'is_prospect tipo': typeof supabaseTask.is_prospect,
    'sales_confirmed tipo': typeof supabaseTask.sales_confirmed,
    'sales_confirmed === null': supabaseTask.sales_confirmed === null,
    'sales_confirmed === undefined': supabaseTask.sales_confirmed === undefined
  });

  // Resolver nome da filial automaticamente
  const filialResolved = resolveFilialName(supabaseTask.filial);

  const mappedTask: Task = {
    id: supabaseTask.id,
    name: supabaseTask.name,
    responsible: supabaseTask.responsible,
    client: supabaseTask.client,
    property: supabaseTask.property || '',
    filial: supabaseTask.filial || '',
    cpf: supabaseTask.cpf || '',
    email: supabaseTask.email || '',
    taskType: supabaseTask.task_type || 'prospection',
    checklist: supabaseTask.products?.map((product: any) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      selected: product.selected || false,
      quantity: product.quantity || 0,
      price: product.price || 0,
      observations: product.observations || '',
      photos: product.photos || [],
    })) || [],
    startDate: new Date(supabaseTask.start_date),
    endDate: new Date(supabaseTask.end_date),
    startTime: supabaseTask.start_time,
    endTime: supabaseTask.end_time,
    observations: supabaseTask.observations || '',
    priority: supabaseTask.priority,
    reminders: supabaseTask.reminders?.map((reminder: any) => ({
      id: reminder.id,
      title: reminder.title,
      description: reminder.description || '',
      date: new Date(reminder.date),
      time: reminder.time,
      completed: reminder.completed || false,
    })) || [],
    photos: supabaseTask.photos || [],
    documents: supabaseTask.documents || [],
    checkInLocation: supabaseTask.check_in_location ? {
      lat: supabaseTask.check_in_location.lat,
      lng: supabaseTask.check_in_location.lng,
      timestamp: new Date(supabaseTask.check_in_location.timestamp),
    } : undefined,
    initialKm: supabaseTask.initial_km || 0,
    finalKm: supabaseTask.final_km || 0,
    status: supabaseTask.status,
    createdBy: supabaseTask.created_by,
    createdAt: new Date(supabaseTask.created_at),
    updatedAt: new Date(supabaseTask.updated_at),
    // Usar o valor direto do banco para isProspect
    isProspect: Boolean(supabaseTask.is_prospect),
    prospectNotes: supabaseTask.prospect_notes || '',
    prospectItems: supabaseTask.products || [], // Carregar TODOS os produtos, não apenas os selecionados
    salesValue: supabaseTask.sales_value || 0,
    salesConfirmed: supabaseTask.sales_confirmed, // Preservar valor exato do banco
    familyProduct: supabaseTask.family_product || '',
    equipmentQuantity: supabaseTask.equipment_quantity || 0,
    propertyHectares: supabaseTask.property_hectares || 0,
    equipmentList: supabaseTask.equipment_list || [],
  };

  console.log('🔍 MAPPER: Tarefa mapeada:', mappedTask.id, {
    isProspect: mappedTask.isProspect,
    salesConfirmed: mappedTask.salesConfirmed,
    salesValue: mappedTask.salesValue,
    filialOriginal: supabaseTask.filial,
    filialResolved: filialResolved
  });
  
  console.log('🔍 MAPPER: Valores finais para status:', {
    'salesConfirmed === null': mappedTask.salesConfirmed === null,
    'salesConfirmed === true': mappedTask.salesConfirmed === true,
    'salesConfirmed === false': mappedTask.salesConfirmed === false,
    'isProspect': mappedTask.isProspect
  });

  return mappedTask;
};
