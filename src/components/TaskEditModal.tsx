import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTaskEditData } from '@/hooks/useTaskEditData';
import { useSecurityCache } from '@/hooks/useSecurityCache';
import { useOpportunityManager } from '@/hooks/useOpportunityManager';
import { StandardTaskForm } from './StandardTaskForm';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface TaskEditModalProps {
  taskId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdate: () => void;
}

interface OpportunityItem {
  id: string;
  produto: string;
  sku: string;
  qtd_ofertada: number;
  qtd_vendida: number;
  preco_unit: number;
  subtotal_ofertado: number;
  subtotal_vendido: number;
  incluir_na_venda_parcial?: boolean;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  taskId,
  isOpen,
  onClose,
  onTaskUpdate
}) => {
  console.log('🔧 TaskEditModal: Renderizado com props:', { taskId, isOpen });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: taskData, loading, error, updateTaskData } = useTaskEditData(taskId);
  const { invalidateAll } = useSecurityCache();
  const { ensureOpportunity } = useOpportunityManager();
  
  // Buscar lista de filiais para o campo Filial Atendida
  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais'],
    queryFn: async () => {
      const { data, error } = await supabase.from('filiais').select('id, nome').order('nome');
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 10 // 10 minutos
  });
  
  console.log('🔧 TaskEditModal: Estado dos dados:', { taskData: !!taskData, loading, error });
  
  // Map task type from different sources to standardized values
  const mapTaskType = (type: string): 'visita' | 'ligacao' | 'checklist' => {
    switch (type) {
      case 'prospection':
      case 'field-visit':
      case 'visita':
        return 'visita';
      case 'ligacao':
      case 'call':
        return 'ligacao';
      case 'checklist':
      case 'workshop-checklist':
        return 'checklist';
      default:
        return 'visita';
    }
  };
  
  // Status mapping from opportunity status and task data
  const getInitialStatus = () => {
    console.log('🔧 getInitialStatus: dados da opportunity:', taskData?.opportunity);
    console.log('🔧 getInitialStatus: dados da task:', { 
      sales_confirmed: taskData?.sales_confirmed,
      sales_type: taskData?.sales_type,
      partial_sales_value: taskData?.partial_sales_value
    });
    
    // Se não há opportunity, usar os dados da task
    if (!taskData?.opportunity) {
      if (taskData?.sales_confirmed) {
        switch (taskData?.sales_type) {
          case 'ganho': return 'venda_total';
          case 'parcial': return 'venda_parcial';
          case 'perdido': return 'venda_perdida';
          default: return 'prospect';
        }
      }
      return 'prospect';
    }
    
    const status = taskData.opportunity.status;
    console.log('🔧 getInitialStatus: status da opportunity:', status);
    
    switch (status) {
      case 'Prospect': return 'prospect';
      case 'Venda Total': return 'venda_total';
      case 'Venda Parcial': return 'venda_parcial';
      case 'Venda Perdida': return 'venda_perdida';
      default: 
        console.log('🔧 getInitialStatus: status não reconhecido, usando prospect');
        return 'prospect';
    }
  };

  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    filial: '',
    filialAtendida: '',
    observacoes: '',
    status: 'prospect',
    prospectNotes: '',
    prospectNotesJustification: '',
    products: [] as OpportunityItem[],
    // Campos adicionais da tarefa
    name: '',
    responsible: '',
    property: '',
    phone: '',
    clientCode: '',
    taskType: 'visita' as 'visita' | 'ligacao' | 'checklist',
    priority: 'medium' as 'low' | 'medium' | 'high',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    familyProduct: '',
    equipmentQuantity: 0,
    propertyHectares: 0,
    fallbackTotalValue: 0
  });

  // Load task data into form when available
  useEffect(() => {
    console.log('🔧 TaskEditModal: useEffect - taskData mudou:', { 
      hasTaskData: !!taskData,
      taskId: taskData?.id,
      cliente_nome: taskData?.cliente_nome 
    });
    
    if (!taskData) return;
    
    const newFormData = {
      customerName: taskData.cliente_nome || '',
      customerEmail: taskData.cliente_email || '',
      filial: taskData.filial || '',
      filialAtendida: taskData.filialAtendida || '',
      observacoes: taskData.notas || '',
      status: getInitialStatus(),
      prospectNotes: taskData.prospectNotes || '',
      prospectNotesJustification: taskData.prospectNotesJustification || '',
      products: (taskData.items || []).map(item => {
        // CRÍTICO: Para venda parcial, usar qtd_vendida como base
        // Para venda total, usar qtd_ofertada como base
        const currentStatus = getInitialStatus();
        const isPartialSale = currentStatus === 'venda_parcial';
        const isVendaTotal = currentStatus === 'venda_total';
        
        // Buscar o nome real do produto na tabela products
        const realProductName = taskData.originalProducts?.find(p => p.id === item.id)?.name || item.produto;
        
        console.log('🔧 Mapeando item:', { 
          produto: item.produto,
          realProductName,
          qtd_ofertada: item.qtd_ofertada, 
          qtd_vendida: item.qtd_vendida,
          status: currentStatus,
          isPartialSale,
          isVendaTotal
        });
        
        return {
          id: item.id,
          produto: realProductName, // Usar o nome real da tabela products
          sku: item.sku,
          qtd_ofertada: item.qtd_ofertada,
          qtd_vendida: item.qtd_vendida,
          preco_unit: item.preco_unit,
          subtotal_ofertado: item.subtotal_ofertado,
          subtotal_vendido: item.subtotal_vendido,
          // CRÍTICO: Lógica correta para incluir na venda parcial
          incluir_na_venda_parcial: isPartialSale ? (item.qtd_vendida > 0) : isVendaTotal
        };
      }),
      // Preencher campos adicionais da tarefa
      name: taskData.name || '',
      responsible: taskData.responsible || '',
      property: taskData.property || '',
      phone: taskData.phone || '',
      clientCode: taskData.clientCode || '',
      taskType: mapTaskType(taskData.taskType || taskData.tipo || taskData.task_type || 'prospection'),
      priority: (taskData.priority as 'low' | 'medium' | 'high') || 'medium',
      startDate: taskData.startDate ? new Date(taskData.startDate).toISOString().split('T')[0] : '',
      endDate: taskData.endDate ? new Date(taskData.endDate).toISOString().split('T')[0] : '',
      startTime: taskData.startTime || '',
      endTime: taskData.endTime || '',
      familyProduct: taskData.familyProduct || '',
      equipmentQuantity: taskData.equipmentQuantity || 0,
      propertyHectares: taskData.propertyHectares || 0,
      fallbackTotalValue: taskData.sales_value || 0,
      // salesValue deve refletir o TOTAL da oportunidade (todos os produtos ofertados),
      // NUNCA o valor da venda fechada/parcial.
      salesValue: taskData.opportunity?.valor_total_oportunidade || taskData.sales_value || 0,
      prospectValue: taskData.opportunity?.valor_total_oportunidade || taskData.sales_value || 0,
      partialSalesValue: taskData.partial_sales_value || 0
    };
    
    console.log('🔧 TaskEditModal: Atualizando formData:', newFormData);
    setFormData(newFormData);
  }, [taskData]);

  const handleSubmit = async (formDataWithValues: any) => {
    console.log('🚀 SUBMIT INICIADO:', { formDataWithValues, formData });
    setIsSubmitting(true);

    try {
      if (!taskId || !taskData) {
        console.error('❌ SUBMIT ERRO: Task não encontrada');
        toast.error('Erro: Task não encontrada');
        return;
      }

      // Usar os dados recebidos do StandardTaskForm que já incluem os valores calculados
      const formDataToProcess = formDataWithValues || formData;

      // Validação para venda perdida
      if (formDataToProcess.status === 'venda_perdida' && (!formDataToProcess.prospectNotes || formDataToProcess.prospectNotes.trim() === '')) {
        toast.error('O motivo da perda é obrigatório');
        return;
      }

      // Map status to opportunity status
      const statusMapping = {
        prospect: 'Prospect',
        venda_total: 'Venda Total',
        venda_parcial: 'Venda Parcial',
        venda_perdida: 'Venda Perdida'
      };

      const opportunityStatus = statusMapping[formDataToProcess.status as keyof typeof statusMapping];

      // CRÍTICO: Calcular valores corretos
      // Para venda parcial: valor total = valor original do prospect (não deve mudar), valor parcial = soma dos produtos vendidos
      // Para venda total: valor total = valor parcial = soma de todos os produtos
      const valorVendaParcial = formDataToProcess.partialSalesValue || 0;
      
      // CRÍTICO: valor_total_oportunidade NUNCA deve mudar após criação
      // Deve ser o valor original da oportunidade existente OU o valor total dos produtos se for nova
      const valorTotalOriginal = taskData?.opportunity?.valor_total_oportunidade || 0;
      const prospectValue = formDataToProcess.salesValue || 0; // Valor total dos produtos atualmente
      
      // CORREÇÃO: Usar valor original se existir, senão usar valor dos produtos
      // Isso garante que venda parcial não altere o valor_total_oportunidade
      const valorTotalOportunidade = valorTotalOriginal > 0 ? valorTotalOriginal : prospectValue;
      
      console.log('🔧 TaskEditModal: Valores para ensureOpportunity:', {
        valorTotalOriginal,
        prospectValue,
        valorTotalOportunidade,
        valorVendaParcial,
        status: formDataToProcess.status,
        isVendaTotal: formDataToProcess.status === 'venda_total',
        isVendaParcial: formDataToProcess.status === 'venda_parcial'
      });
        
      // Valor para salvar na tabela tasks - sempre preservar o valor original da task
      const valorTaskOriginal = taskData?.opportunity?.valor_total_oportunidade || valorTotalOportunidade;

      console.log('🔧 TaskEditModal: Valores calculados recebidos:', {
        salesValue: valorTotalOportunidade,
        prospectValue: valorTotalOriginal,
        partialSalesValue: valorVendaParcial
      });

      // CRÍTICO: Para venda total, garantir que qtd_vendida = qtd_ofertada ANTES de processar
      if (formDataToProcess.status === 'venda_total') {
        console.log('🔧 CORRIGINDO PRODUTOS para venda total');
        formDataToProcess.products = formDataToProcess.products.map(product => {
          console.log('🔧 Produto antes da correção:', {
            id: product.id,
            qtd_vendida: product.qtd_vendida,
            qtd_ofertada: product.qtd_ofertada
          });
          
          const produtoCorrigido = {
            ...product,
            qtd_vendida: product.qtd_ofertada, // Para venda total: vendido = ofertado
            incluir_na_venda_parcial: true // Garantir que está incluído
          };
          
          console.log('🔧 Produto após correção:', {
            id: produtoCorrigido.id,
            qtd_vendida: produtoCorrigido.qtd_vendida,
            qtd_ofertada: produtoCorrigido.qtd_ofertada
          });
          
          return produtoCorrigido;
        });
      }

      // Prepare update data including all task fields and calculated values
      const updatedData = {
        cliente_nome: formDataToProcess.customerName,
        cliente_email: formDataToProcess.customerEmail,
        filial: formDataToProcess.filial,
        observations: formDataToProcess.observacoes,
        prospect_notes: formDataToProcess.prospectNotes || null,
        prospect_notes_justification: formDataToProcess.prospectNotesJustification || null,
        task_type: mapTaskType(formDataToProcess.taskType),
        // Additional task fields
        name: formDataToProcess.name,
        responsible: formDataToProcess.responsible,
        property: formDataToProcess.property,
        phone: formDataToProcess.phone,
        clientcode: formDataToProcess.clientCode,
        priority: formDataToProcess.priority,
        status: 'closed', // Sempre fechado para indicar que não está mais pendente
        // Valores calculados corretos para ambas as tabelas
        salesValue: valorTotalOportunidade,
        prospectValue: valorTotalOriginal,
        partialSalesValue: valorVendaParcial,
        // CRÍTICO: NÃO incluir sales_value no update - deve preservar valor original
        // sales_value: NÃO ATUALIZAR
        partial_sales_value: valorVendaParcial,
        // Sales type based on status - DEVE usar 'ganho' para venda total (constraint do banco)
        sales_type: formDataToProcess.status === 'venda_total' ? 'ganho' :
                   formDataToProcess.status === 'venda_parcial' ? 'parcial' :
                   formDataToProcess.status === 'venda_perdida' ? 'perdido' :
                   formDataToProcess.status === 'prospect' ? 'prospect' : null,
        sales_confirmed: formDataToProcess.status !== 'prospect',
        opportunity: {
          status: opportunityStatus,
          valor_venda_fechada: formDataToProcess.status === 'venda_total' 
            ? valorTotalOportunidade // Para venda total, usar valor total
            : formDataToProcess.status === 'venda_parcial' 
              ? valorVendaParcial // Para venda parcial, usar valor parcial
              : 0 // Para prospects e perdas, 0
          // NÃO alterar valor_total_oportunidade - ele preserva o valor original
        },
        items: formDataToProcess.products.map(product => {
          console.log('📤 ITEM ENVIADO PARA updateTaskData:', {
            id: product.id,
            produto: product.produto,
            qtd_vendida: product.incluir_na_venda_parcial ? product.qtd_vendida : 0,
            qtd_ofertada: product.qtd_ofertada,
            preco_unit: product.preco_unit,
            incluir_na_venda_parcial: product.incluir_na_venda_parcial
          });
          return {
            id: product.id,
            produto: product.produto,
            qtd_vendida: product.incluir_na_venda_parcial ? product.qtd_vendida : 0,
            qtd_ofertada: product.qtd_ofertada,
            preco_unit: product.preco_unit
          };
        })
      };

      console.log('🔧 TaskEditModal: Dados de atualização preparados:', {
        salesValue: updatedData.salesValue,
        partialSalesValue: updatedData.partialSalesValue,
        partial_sales_value: updatedData.partial_sales_value,
        sales_type: updatedData.sales_type,
        sales_confirmed: updatedData.sales_confirmed,
        status: updatedData.status,
        formDataStatus: formDataToProcess.status,
        opportunity: updatedData.opportunity
      });

      // LOG ESPECÍFICO PARA PROSPECT
      if (formDataToProcess.status === 'prospect') {
        console.log('🚨 PROSPECT DETECTADO - Valores esperados:', {
          sales_type: 'prospect',
          sales_confirmed: false,
          valor_venda_fechada: 0,
          partial_sales_value: 0
        });
      }

      // LOG ESPECÍFICO PARA VENDA PARCIAL
      if (formDataToProcess.status === 'venda_parcial') {
        console.log('🚨 VENDA PARCIAL DETECTADA - Valores esperados:', {
          sales_type: 'parcial',
          sales_confirmed: true,
          valor_venda_fechada: valorVendaParcial,
          partial_sales_value: valorVendaParcial,
          status: 'closed'
        });
      }

      console.log('🔍 DEBUG CONDIÇÃO ensureOpportunity:', {
        valorTotalOportunidade,
        isValorMaiorQueZero: valorTotalOportunidade > 0,
        formDataStatus: formDataToProcess.status,
        isNotProspect: formDataToProcess.status !== 'prospect',
        deveExecutarEnsureOpportunity: valorTotalOportunidade > 0 || formDataToProcess.status !== 'prospect'
      });

      // opportunityId declarado fora do if para estar em scope no updateTaskData abaixo
      let opportunityId: string | undefined;

      // CRÍTICO: Garantir que a oportunidade seja criada/atualizada usando o manager
      if (valorTotalOportunidade > 0 || formDataToProcess.status !== 'prospect') {
        console.log('🔧 CHAMANDO ensureOpportunity com:', {
          taskId,
          clientName: formDataToProcess.customerName,
          filial: formDataToProcess.filial,
          formDataStatus: formDataToProcess.status, // DEBUG: verificar o status recebido
          salesValue: valorTotalOportunidade,
          salesType: formDataToProcess.status === 'venda_total' ? 'ganho' :
                    formDataToProcess.status === 'venda_parcial' ? 'parcial' :
                    formDataToProcess.status === 'venda_perdida' ? 'perdido' : 'ganho',
          partialSalesValue: valorVendaParcial
        });
        
        console.log('🎯 ANTES de chamar ensureOpportunity:', {
          taskId: taskId,
          salesValue: valorTotalOportunidade,
          salesType: formDataToProcess.status,
          valorVendaParcial
        });
        
        opportunityId = await ensureOpportunity({
          taskId: taskId,
          clientName: formDataToProcess.customerName,
          filial: formDataToProcess.filial,
          salesValue: valorTotalOportunidade,
          salesType: formDataToProcess.status === 'venda_total' ? 'ganho' :
                    formDataToProcess.status === 'venda_parcial' ? 'parcial' :
                    formDataToProcess.status === 'venda_perdida' ? 'perdido' : 'ganho',
          partialSalesValue: valorVendaParcial,
          salesConfirmed: formDataToProcess.status !== 'prospect',
          items: formDataToProcess.products.map(product => {
            const qtdVendida = formDataToProcess.status === 'venda_total' 
              ? product.qtd_ofertada  // Para venda total, vendido = ofertado
              : (product.incluir_na_venda_parcial ? product.qtd_vendida : 0); // Para parcial, usar conforme seleção
            
            console.log('🔧 ITEM SENDO ENVIADO:', {
              id: product.id,
              status: formDataToProcess.status,
              qtd_vendida: qtdVendida,
              qtd_ofertada: product.qtd_ofertada,
              preco_unit: product.preco_unit,
              isVendaTotal: formDataToProcess.status === 'venda_total'
            });
            
            return {
              id: product.id,
              produto: product.produto, // IMPORTANTE: Incluir o nome do produto
              qtd_vendida: qtdVendida,
              qtd_ofertada: product.qtd_ofertada,
              preco_unit: product.preco_unit
            };
          })
        });
        
        console.log('🔧 DADOS ENVIADOS PARA ensureOpportunity:', {
          taskId,
          salesValue: valorTotalOportunidade,
          salesType: formDataToProcess.status === 'venda_total' ? 'ganho' :
                    formDataToProcess.status === 'venda_parcial' ? 'parcial' :
                    formDataToProcess.status === 'venda_perdida' ? 'perdido' : 'ganho',
          partialSalesValue: valorVendaParcial,
          formStatus: formDataToProcess.status
        });
        
        console.log('✅ DEPOIS de chamar ensureOpportunity, ID:', opportunityId);
      }

      // Passa o opportunityId recém-criado para que updateTaskData possa criar
      // opportunity_items mesmo quando data.opportunity era null no momento do carregamento.
      const success = await updateTaskData(updatedData, opportunityId);
      console.log('🔧 RESULTADO updateTaskData:', success);
      
      if (success) {
        console.log('✅ SUCESSO: Task atualizada, invalidando cache');
        await invalidateAll();
        onTaskUpdate();
        onClose();
      } else {
        console.error('❌ ERRO: updateTaskData retornou false');
        toast.error('Erro ao atualizar task');
      }

    } catch (error: any) {
      console.error('🔍 TaskEditModal - Erro geral:', error);
      toast.error(`Erro ao atualizar task: ${error?.message || 'Erro desconhecido'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state
  if (loading || !taskData) {
    console.log('🔧 TaskEditModal: Exibindo estado de carregamento:', { loading, hasTaskData: !!taskData, error });
    
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {loading ? 'Carregando dados da task...' : error ? 'Erro ao carregar' : 'Carregando...'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            {loading && (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Carregando dados da task...</p>
              </>
            )}
            {error && (
              <div className="text-center space-y-4">
                <div className="space-y-2">
                  <p className="text-red-600 font-medium">Erro: {error}</p>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {error.includes('permissão') || error.includes('não encontrada') ? (
                      <div className="space-y-2">
                        <p>Problema de acesso detectado. Isso pode ser devido a:</p>
                        <ul className="text-xs list-disc list-inside space-y-1">
                          <li>Cache de autenticação desatualizado</li>
                          <li>Permissões alteradas recentemente</li>
                          <li>Sessão expirada</li>
                        </ul>
                        <p className="font-medium">Tente recarregar a página para atualizar suas permissões.</p>
                      </div>
                    ) : (
                      <p>Verifique sua conexão com a internet e tente novamente.</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button 
                    onClick={async () => {
                      // Clear all possible caches
                      await invalidateAll();
                      // Force session refresh
                      await supabase.auth.refreshSession();
                      // Hard reload
                      window.location.reload();
                    }} 
                    variant="outline"
                    size="sm"
                  >
                    Recarregar Página
                  </Button>
                  <Button 
                    onClick={onClose} 
                    variant="outline"
                    size="sm"
                  >
                    Fechar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Tarefa</DialogTitle>
        </DialogHeader>
        
        <StandardTaskForm
          formData={formData}
          onFormDataChange={setFormData}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          showProductsSection={true}
          title="Editar Tarefa"
          filiais={filiais}
        />
      </DialogContent>
    </Dialog>
  );
};