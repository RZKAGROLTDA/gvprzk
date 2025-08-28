
import { Task } from '@/types/task';
import { resolveFilialName, loadFiliaisCache } from './taskStandardization';

// Utility function to map Supabase task data to application Task format
export const mapSupabaseTaskToTask = (supabaseTask: any): Task => {
  // Logs removidos para performance

  // Handle secure customer data from the secure view
  const customerData = supabaseTask.customer_data;
  const isMasked = customerData?.is_masked || false;

  // Resolver nome da filial automaticamente
  const filialResolved = resolveFilialName(supabaseTask.filial);

  // Map products with detailed logging - usando task_products do Supabase
  const products = (supabaseTask.task_products || supabaseTask.products)?.map((product: any) => {
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

  // PADRONIZAÇÃO: Garantir que TODAS as tasks tenham produtos em ambos checklist E prospectItems
  const taskType = supabaseTask.task_type || 'prospection';
  
  // Para compatibilidade total, sempre garantir que ambos existam
  const checklist = products; // Todas as tasks têm checklist com todos os produtos
  const prospectItems = products; // Todas as tasks têm prospectItems para vendas parciais

  const mappedTask: Task = {
    id: supabaseTask.id,
    name: supabaseTask.name,
    responsible: supabaseTask.responsible,
    // Use secure customer data if available, fallback to direct access for backwards compatibility
    client: customerData?.client || supabaseTask.client,
    clientCode: supabaseTask.clientcode || '',
    property: customerData?.property || supabaseTask.property || '',
    filial: supabaseTask.filial || '',
    email: customerData?.email || supabaseTask.email || '',
    taskType: supabaseTask.task_type || 'prospection',
    checklist: checklist,
    startDate: new Date(supabaseTask.start_date),
    endDate: new Date(supabaseTask.end_date),
    startTime: supabaseTask.start_time,
    endTime: supabaseTask.end_time,
    observations: supabaseTask.observations || '',
    priority: supabaseTask.priority,
    reminders: Array.isArray(supabaseTask.reminders) ? supabaseTask.reminders.map((reminder: any) => ({
      id: reminder.id,
      title: reminder.title,
      description: reminder.description || '',
      date: new Date(reminder.date),
      time: reminder.time,
      completed: reminder.completed || false,
    })) : [],
    photos: Array.isArray(supabaseTask.photos) ? supabaseTask.photos : [],
    documents: Array.isArray(supabaseTask.documents) ? supabaseTask.documents : [],
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
    // prospectItems são carregados baseado no tipo de tarefa
    prospectItems: prospectItems,
    // Use secure sales value if available
    salesValue: customerData?.sales_value || supabaseTask.sales_value || 0,
    salesConfirmed: supabaseTask.sales_confirmed, // Preservar valor exato do banco
    salesType: supabaseTask.sales_type,
    partialSalesValue: supabaseTask.partial_sales_value,
    familyProduct: supabaseTask.family_product || '',
    equipmentQuantity: supabaseTask.equipment_quantity || 0,
    propertyHectares: supabaseTask.propertyhectares || 0,
    equipmentList: Array.isArray(supabaseTask.equipment_list) ? supabaseTask.equipment_list : [],
    // Add security metadata
    isMasked
  };

  // Log removido para performance

  return mappedTask;
};
