
import { Task } from '@/types/task';
import { resolveFilialName, loadFiliaisCache } from './taskStandardization';

// Utility function to map Supabase task data to application Task format
export const mapSupabaseTaskToTask = (supabaseTask: any): Task => {
  // Logs removidos para performance

  // Resolver nome da filial automaticamente
  const filialResolved = resolveFilialName(supabaseTask.filial);

  // Map products with detailed logging
  const checklist = supabaseTask.products?.map((product: any) => {
    const mappedProduct = {
      id: product.id,
      name: product.name,
      category: product.category,
      selected: Boolean(product.selected), // Ensure boolean conversion
      quantity: product.quantity || 0,
      price: product.price || 0,
      observations: product.observations || '',
      photos: product.photos || [],
    };
    
    // Log removido para performance
    return mappedProduct;
  }) || [];

  const mappedTask: Task = {
    id: supabaseTask.id,
    name: supabaseTask.name,
    responsible: supabaseTask.responsible,
    client: supabaseTask.client,
    clientCode: supabaseTask.clientcode || '',
    property: supabaseTask.property || '',
    filial: supabaseTask.filial || '',
    email: supabaseTask.email || '',
    taskType: supabaseTask.task_type || 'prospection',
    checklist: checklist,
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
    salesType: supabaseTask.sales_type,
    familyProduct: supabaseTask.family_product || '',
    equipmentQuantity: supabaseTask.equipment_quantity || 0,
    propertyHectares: supabaseTask.propertyhectares || 0,
    equipmentList: supabaseTask.equipment_list || [],
  };

  // Log removido para performance

  return mappedTask;
};
