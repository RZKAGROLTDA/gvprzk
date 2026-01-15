
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Calendar, User, Building, Crop, Package, Camera, FileText, Download, Printer, Mail, Phone, Hash, AtSign, Car, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Task, ProductType } from "@/types/task";
import { useToast } from "@/hooks/use-toast";
import { useTaskEditData } from '@/hooks/useTaskEditData';
import { getStatusLabel, getStatusColor, resolveFilialName } from '@/lib/taskStandardization';
import { getTaskTypeLabel, calculateTaskTotalValue } from './TaskFormCore';
import { generateTaskPDF } from './TaskPDFGenerator';
import { SalesStatusDisplay } from './SalesStatusDisplay';
import { ProductListComponent } from './ProductListComponent';

// TypeScript module declaration for jsPDF autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

interface FormVisualizationProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

export const FormVisualization: React.FC<FormVisualizationProps> = ({
  task,
  isOpen,
  onClose,
  onTaskUpdated
}) => {
  const { toast } = useToast();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // MESMA fonte de dados do "Editar" (useTaskEditData) — e congelar em snapshot para não "mudar" depois de carregar
  const { data: taskEditData, loading, error } = useTaskEditData(isOpen ? task?.id : null);
  const [fullTaskSnapshot, setFullTaskSnapshot] = useState<Task | null>(null);
  const [snapshotSalesStatus, setSnapshotSalesStatus] = useState<'prospect' | 'ganho' | 'perdido' | 'parcial'>('prospect');
  const [snapshotOpportunityValue, setSnapshotOpportunityValue] = useState<number>(0);

  const detailsReady = isOpen && !loading && !!taskEditData;

  useEffect(() => {
    // ao fechar OU ao trocar a task com o modal aberto, limpar snapshot
    // (evita mostrar status/dados "da task anterior" enquanto carrega a atual)
    if (!isOpen) {
      setFullTaskSnapshot(null);
      setSnapshotSalesStatus('prospect');
      setSnapshotOpportunityValue(0);
      return;
    }

    // Se abriu/trocou de task, garantir que não existe snapshot antigo
    setFullTaskSnapshot(null);
    setSnapshotSalesStatus('prospect');
    setSnapshotOpportunityValue(0);
  }, [isOpen, task?.id]);

  // Criar snapshot UMA VEZ quando taskEditData carrega (inclui itens/produtos)
  useEffect(() => {
    if (!isOpen) return;
    if (!taskEditData) return;
    if (loading) return;
    if (fullTaskSnapshot) return; // já congelou — não atualizar mais

    // Mapear checklist
    const checklist: ProductType[] = (taskEditData.items || []).map((item) => ({
      id: item.id,
      name: item.produto,
      category: (item.sku || 'other') as ProductType['category'],
      selected: (item.qtd_vendida || 0) > 0,
      quantity: item.qtd_ofertada || 0,
      price: item.preco_unit || 0,
      observations: '',
      photos: [],
    }));

    // Calcular valor da oportunidade
    let totalValue = 0;
    const fromOpportunity = taskEditData.opportunity?.valor_total_oportunidade;
    if (typeof fromOpportunity === 'number' && fromOpportunity > 0) {
      totalValue = fromOpportunity;
    } else {
      const fromTask = taskEditData.sales_value;
      if (typeof fromTask === 'number' && fromTask > 0) {
        totalValue = fromTask;
      } else {
        totalValue = (taskEditData.items || []).reduce((sum, i) => {
          return sum + (i.preco_unit || 0) * (i.qtd_ofertada || 0);
        }, 0);
      }
    }

    // Calcular status exatamente como no modal de editar:
    // 1) Se existir opportunity.status, ele manda.
    // 2) Se NÃO existir, só considera venda quando sales_confirmed === true; caso contrário é prospect.
    const salesConfirmed = taskEditData.sales_confirmed;
    const salesType = taskEditData.sales_type;

    let calculatedStatus: 'prospect' | 'ganho' | 'perdido' | 'parcial' = 'prospect';

    const opportunityStatus = taskEditData.opportunity?.status;
    if (opportunityStatus) {
      switch (opportunityStatus) {
        case 'Prospect':
          calculatedStatus = 'prospect';
          break;
        case 'Venda Total':
          calculatedStatus = 'ganho';
          break;
        case 'Venda Parcial':
          calculatedStatus = 'parcial';
          break;
        case 'Venda Perdida':
          calculatedStatus = 'perdido';
          break;
        default:
          calculatedStatus = 'prospect';
      }
    } else if (salesConfirmed === true) {
      switch (salesType) {
        case 'ganho':
          calculatedStatus = 'ganho';
          break;
        case 'parcial':
          calculatedStatus = 'parcial';
          break;
        case 'perdido':
          calculatedStatus = 'perdido';
          break;
        default:
          calculatedStatus = 'prospect';
      }
    } else {
      calculatedStatus = 'prospect';
    }

    // Normalizar os campos para que componentes que usam mapSalesStatus (ex.: SalesStatusDisplay)
    // fiquem 100% consistentes com o status do "Editar".
    const normalizedSalesConfirmed: boolean | null =
      calculatedStatus === 'prospect' ? null : calculatedStatus === 'perdido' ? false : true;

    const normalizedSalesType: 'prospect' | 'ganho' | 'parcial' | 'perdido' =
      calculatedStatus === 'prospect'
        ? 'prospect'
        : calculatedStatus === 'parcial'
          ? 'parcial'
          : calculatedStatus === 'perdido'
            ? 'perdido'
            : 'ganho';

    const startDate = taskEditData.startDate || taskEditData.data;
    const endDate = taskEditData.endDate || taskEditData.data;

    const snapshot: Task = {
      id: taskEditData.id,
      name: taskEditData.name || '',
      responsible: taskEditData.responsible || '',
      client: taskEditData.cliente_nome || '',
      clientCode: taskEditData.clientCode,
      property: taskEditData.property || '',
      email: taskEditData.cliente_email || undefined,
      phone: taskEditData.phone || undefined,
      filial: taskEditData.filial || undefined,
      filialAtendida: taskEditData.filialAtendida,
      taskType: (taskEditData.taskType || taskEditData.tipo || 'prospection') as Task['taskType'],
      checklist: checklist,
      startDate: startDate ? new Date(startDate as any) : new Date(),
      endDate: endDate ? new Date(endDate as any) : new Date(),
      startTime: taskEditData.startTime || '',
      endTime: taskEditData.endTime || '',
      observations: taskEditData.notas || taskEditData.observations || '',
      priority: (taskEditData.priority || 'medium') as Task['priority'],
      reminders: [],
      photos: taskEditData.photos || [],
      documents: taskEditData.documents || [],
      checkInLocation: taskEditData.check_in_location as any,
      initialKm: (taskEditData.initialKm as any) || 0,
      finalKm: (taskEditData.finalKm as any) || 0,
      status: (taskEditData.status as any) || 'pending',
      createdBy: taskEditData.vendedor_id,
      createdAt: new Date(),
      updatedAt: new Date(),
      isProspect: calculatedStatus === 'prospect',
      prospectNotes: undefined,
      salesConfirmed: normalizedSalesConfirmed ?? undefined,
      salesType: normalizedSalesType as any,
      // Para exibição, usar o mesmo valor calculado/fixado
      salesValue: totalValue,
      partialSalesValue: taskEditData.partial_sales_value || undefined,
      familyProduct: taskEditData.familyProduct,
      equipmentQuantity: taskEditData.equipmentQuantity,
      propertyHectares: taskEditData.propertyHectares,
      equipmentList: Array.isArray(taskEditData.equipment_list) ? (taskEditData.equipment_list as any) : undefined,
      prospectItems: undefined,
      isMasked: (task as any).isMasked,
    };

    // CONGELAR todos os valores calculados
    setFullTaskSnapshot(snapshot);
    setSnapshotSalesStatus(calculatedStatus);
    setSnapshotOpportunityValue(totalValue);

    console.log('📸 FormVisualization: Snapshot criado', {
      id: snapshot.id,
      salesConfirmed,
      salesType,
      calculatedStatus,
      totalValue,
    });
  }, [isOpen, taskEditData, loading, fullTaskSnapshot, task]);

  // Mostrar loading dentro do modal enquanto carrega os dados
  if (isOpen && (!detailsReady || !fullTaskSnapshot)) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <DialogHeader className="pb-6 border-b">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-primary rounded-lg shadow-lg">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Relatório Completo de Oportunidade
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Carregando informações...
                </p>
              </div>
            </div>
          </DialogHeader>
          
          {error ? (
            <div className="space-y-4 py-8">
              <p className="text-sm text-destructive text-center">{error}</p>
              <div className="flex justify-center">
                <Button variant="outline" onClick={onClose}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="text-muted-foreground">Carregando detalhes da oportunidade...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }


  const fullTask = fullTaskSnapshot!;
  const salesStatus = snapshotSalesStatus;
  const opportunityTotalValue = snapshotOpportunityValue;

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await generateTaskPDF(fullTask, calculateTaskTotalValue, getTaskTypeLabel);

      toast({
        title: "PDF gerado com sucesso!",
        description: "O arquivo foi baixado automaticamente.",
      });
    } catch (error) {
      console.error('❌ Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Ocorreu um erro ao gerar o arquivo. Verifique os dados e tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrint = () => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const productsRows = (fullTask.checklist || [])
      .map((item) => {
        const subtotal = (item.price || 0) * (item.quantity || 1);
        return `
          <tr>
            <td style="text-align:center;">${item.selected ? '✓' : ''}</td>
            <td>${escapeHtml(String(item.name || 'N/A'))}</td>
            <td>${escapeHtml(String(item.category || 'N/A'))}</td>
            <td style="text-align:center;">${item.quantity || 1}</td>
            <td style="text-align:right;">R$ ${(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="text-align:right; font-weight:600;">R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          </tr>`;
      })
      .join('');

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=980,height=720');
    if (!printWindow) return;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Relatório de Oportunidade</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #111; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    .sub { color: #555; font-size: 12px; margin: 0 0 14px; }
    h2 { font-size: 14px; margin: 16px 0 8px; }
    .box { border: 1px solid #ddd; padding: 10px; border-radius: 8px; }
    .row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; margin: 2px 0; }
    .label { color: #666; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
    th { background: #f5f5f5; text-align: left; }
  </style>
</head>
<body>
  <h1>Relatório Completo de Oportunidade</h1>
  <p class="sub">${escapeHtml(getTaskTypeLabel(fullTask.taskType || 'prospection'))} • ${escapeHtml(format(new Date(fullTask.startDate), 'dd/MM/yyyy', { locale: ptBR }))}</p>

  <div class="box">
    <h2>Cliente</h2>
    <div class="row"><span class="label">Nome</span><span>${escapeHtml(fullTask.client || 'N/A')}</span></div>
    <div class="row"><span class="label">Propriedade</span><span>${escapeHtml(fullTask.property || 'N/A')}</span></div>
    <div class="row"><span class="label">Responsável</span><span>${escapeHtml(fullTask.responsible || 'N/A')}</span></div>
    <div class="row"><span class="label">Filial</span><span>${escapeHtml(resolveFilialName(fullTask.filial) || 'Não informado')}</span></div>
  </div>

  <h2>Produtos e Serviços (${(fullTask.checklist || []).length})</h2>
  <table>
    <thead>
      <tr>
        <th style="width:28px; text-align:center;">✓</th>
        <th>Produto / Serviço</th>
        <th style="width:120px;">Categoria</th>
        <th style="width:44px; text-align:center;">Qtd</th>
        <th style="width:90px; text-align:right;">Preço</th>
        <th style="width:90px; text-align:right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${productsRows || '<tr><td colspan="6" style="text-align:center; color:#666;">Nenhum produto/serviço cadastrado.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleEmail = () => {
    const subject = `Relatório de Oportunidade - ${fullTask?.client || 'Cliente'}`;
    const body = `Olá,\n\nSegue em anexo o relatório da oportunidade para o cliente ${fullTask?.client || 'N/A'}.\n\nDetalhes:\n- Propriedade: ${fullTask?.property || 'N/A'}\n- Responsável: ${fullTask?.responsible || 'N/A'}\n- Data: ${fullTask?.startDate ? format(new Date(fullTask.startDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}\n\nAtenciosamente,\n${fullTask?.responsible || 'Equipe'}`;

    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  // Não bloquear o dialog inteiro - dados já estão congelados no snapshot
  const displayChecklist = fullTask.checklist || [];


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader className="pb-6 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-primary rounded-lg shadow-lg">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <DialogTitle className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Relatório Completo de Oportunidade
                </DialogTitle>
                <p className="text-lg text-muted-foreground mt-1">
                  Visualização detalhada de todas as informações
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="gradient" size="sm" onClick={generatePDF} disabled={isGeneratingPDF}>
                <Download className="w-4 h-4 mr-2" />
                {isGeneratingPDF ? 'Gerando...' : 'Gerar PDF'}
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint} className="border-primary text-primary hover:bg-primary hover:text-white">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={handleEmail} className="border-primary text-primary hover:bg-primary hover:text-white">
                <Mail className="w-4 h-4 mr-2" />
                Enviar Email
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-8 pt-6">
          {/* Cabeçalho da Oportunidade com Dados Principais */}
          <Card className="border-primary shadow-lg bg-gradient-to-r from-primary/5 via-white to-primary/5">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                    <User className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-primary">{fullTask.client}</h2>
                    <p className="text-lg text-muted-foreground">{fullTask.property}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(fullTask.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {fullTask.startTime} - {fullTask.endTime}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={`${getStatusColor(salesStatus)} text-lg px-4 py-2 border-2`}>
                    {getStatusLabel(salesStatus)}
                  </Badge>
                  <div className="mt-3">
                    <p className="text-sm text-muted-foreground">Valor da Oportunidade</p>
                    <p className="text-2xl font-bold text-primary">
                      R$ {opportunityTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
          </Card>

          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Informações Gerais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Tipo de Tarefa</label>
                  <p className="font-medium">{getTaskTypeLabel(fullTask.taskType || 'prospection')}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                  <p className="font-medium flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    {fullTask.responsible}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Filial</label>
                  <p className="font-medium flex items-center gap-2">
                    <Building className="w-4 h-4 text-primary" />
                    {resolveFilialName(fullTask.filial) || 'Não informado'}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Data</label>
                  <p className="font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    {format(new Date(fullTask.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Horário</label>
                  <p className="font-medium">{fullTask.startTime} - {fullTask.endTime}</p>
                </div>
              </div>

              <Separator className="my-6" />

              {/* Informações do Cliente */}
              <div className="space-y-4">
                <h4 className="font-semibold text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Dados do Cliente
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Nome do Cliente</label>
                    <p className="font-medium">{fullTask.client}</p>
                  </div>
                  {fullTask.clientCode && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Código do Cliente</label>
                      <p className="font-medium flex items-center gap-2">
                        <Hash className="w-4 h-4 text-muted-foreground" />
                        {fullTask.clientCode}
                      </p>
                    </div>
                  )}
                  {fullTask.email && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      <p className="font-medium flex items-center gap-2">
                        <AtSign className="w-4 h-4 text-muted-foreground" />
                        {fullTask.email}
                      </p>
                    </div>
                  )}
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-muted-foreground">Propriedade</label>
                     <p className="font-medium">{fullTask.property}</p>
                   </div>
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-muted-foreground">Hectares da Propriedade</label>
                     <p className="font-medium flex items-center gap-2">
                       <Crop className="w-4 h-4 text-success" />
                       {fullTask.propertyHectares ? `${fullTask.propertyHectares} ha` : 'Não informado'}
                     </p>
                   </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informações de Equipamentos */}
          {(fullTask.familyProduct || fullTask.equipmentQuantity || (fullTask.equipmentList && fullTask.equipmentList.length > 0)) && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Car className="w-5 h-5" />
                  Informações de Equipamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {fullTask.familyProduct && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Família Principal do Produto</label>
                      <p className="font-medium flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        {fullTask.familyProduct}
                      </p>
                    </div>
                  )}
                  {fullTask.equipmentQuantity && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Quantidade Total de Equipamentos</label>
                      <p className="font-medium text-lg text-primary">
                        {fullTask.equipmentQuantity} equipamentos
                      </p>
                    </div>
                  )}
                </div>

                {fullTask.equipmentList && fullTask.equipmentList.length > 0 && (
                  <div className="mt-6">
                    <Separator className="mb-4" />
                    <h4 className="font-semibold text-lg mb-4">Lista Detalhada de Equipamentos</h4>
                    <div className="space-y-3">
                      {fullTask.equipmentList.map((equipment, index) => (
                        <div key={equipment.id || index} className="border rounded-lg p-4 bg-muted/30">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-muted-foreground">Família do Produto</label>
                              <p className="font-medium text-primary">{equipment.familyProduct}</p>
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-muted-foreground">Quantidade</label>
                              <p className="font-medium text-lg">{equipment.quantity}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 p-4 bg-gradient-card rounded-lg border">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">Total de Equipamentos Listados</p>
                        <p className="text-xl font-bold text-primary">
                          {fullTask.equipmentList.reduce((total, eq) => total + eq.quantity, 0)} equipamentos
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Lista de Equipamentos */}
          {fullTask.equipmentList && fullTask.equipmentList.length > 0 && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Lista de Equipamentos
                </CardTitle>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">Total de famílias de equipamentos:</span>
                  <Badge variant="outline" className="border text-xs">
                    {fullTask.equipmentList.length} famílias
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fullTask.equipmentList.map((equipment, index) => (
                    <div 
                      key={index} 
                      className="border rounded-lg p-4 bg-gradient-to-r from-primary/5 to-primary/2 border-primary/20"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg text-primary">
                            {equipment.familyProduct}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Família de equipamentos identificada
                          </p>
                        </div>
                        <Badge variant="default" className="bg-primary text-primary-foreground">
                          {equipment.quantity} {equipment.quantity === 1 ? 'unidade' : 'unidades'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <label className="text-sm font-medium text-muted-foreground">Família do Produto</label>
                          <p className="font-medium text-lg capitalize">{equipment.familyProduct.toLowerCase()}</p>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <label className="text-sm font-medium text-muted-foreground">Quantidade Identificada</label>
                          <p className="font-bold text-xl text-primary">{equipment.quantity}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Resumo Total dos Equipamentos */}
                  <div className="mt-6 p-4 bg-gradient-to-r from-secondary/10 to-secondary/5 rounded-lg border border-secondary/20">
                    <h4 className="font-semibold mb-3 text-secondary">Resumo dos Equipamentos</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Total de Famílias</p>
                        <p className="text-2xl font-bold text-secondary">
                          {fullTask.equipmentList.length}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total de Equipamentos</p>
                        <p className="text-2xl font-bold text-secondary">
                          {fullTask.equipmentList.reduce((sum, equipment) => sum + equipment.quantity, 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Produtos/Serviços - Visualização - SEMPRE EXIBIR */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {fullTask.taskType === 'ligacao' ? 'Produtos para Ofertar' : 'Produtos e Serviços'} ({displayChecklist.length})
                </CardTitle>
                <Badge variant="outline" className="text-sm">
                  Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculateTaskTotalValue(fullTask as any))}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {fullTask.taskType === 'ligacao' 
                  ? 'Lista de produtos ofertados durante a ligação'
                  : 'Lista de produtos e serviços da oportunidade'
                }
              </p>
            </CardHeader>
            <CardContent>
              {displayChecklist.length > 0 ? (
                <div className="space-y-4">
                  {displayChecklist.map((item, index) => {
                    const itemTotal = (item.price || 0) * (item.quantity || 1);
                    
                    return (
                      <div 
                        key={item.id || index} 
                        className={`border rounded-lg p-4 ${
                          item.selected 
                            ? 'bg-primary/5 border-primary/30 shadow-sm' 
                            : 'bg-muted/20 border-border'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-semibold text-lg">
                                  {item.name}
                                </h4>
                                <p className="text-sm text-muted-foreground mb-2">
                                  Categoria: <span className="font-medium">{item.category}</span>
                                </p>
                              </div>
                              <Badge 
                                variant={item.selected ? "default" : "outline"}
                                className={item.selected ? "bg-success text-success-foreground" : ""}
                              >
                                {item.selected ? '✓ Selecionado' : 'Não Selecionado'}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Quantidade</label>
                                <div className="h-8 px-2 rounded-md bg-muted border flex items-center">
                                  <span className="text-sm font-medium">
                                    {item.quantity || 1}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Preço Unitário</label>
                                <div className="h-8 px-2 rounded-md bg-muted border flex items-center">
                                  <span className="text-sm font-medium">
                                    {new Intl.NumberFormat('pt-BR', { 
                                      style: 'currency', 
                                      currency: 'BRL' 
                                    }).format(item.price || 0)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Subtotal</label>
                                <div className={`h-8 px-2 rounded-md border flex items-center justify-end ${
                                  item.selected 
                                    ? 'bg-green-100 border-green-300 text-green-700 font-bold' 
                                    : 'bg-gray-50 border-gray-200 text-gray-500'
                                }`}>
                                  <span className="text-sm font-medium">
                                    {new Intl.NumberFormat('pt-BR', { 
                                      style: 'currency', 
                                      currency: 'BRL' 
                                    }).format(itemTotal)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Status</label>
                                <div className="h-8 px-2 rounded-md bg-muted border flex items-center">
                                  <span className={`text-sm font-medium ${item.selected ? 'text-success' : 'text-muted-foreground'}`}>
                                    {item.selected ? 'Incluído' : 'Não incluído'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {item.observations && (
                              <div className="mt-4 p-3 bg-muted/50 rounded-md">
                                <label className="text-sm font-medium text-muted-foreground">Observações do Produto</label>
                                <p className="text-sm mt-1 text-foreground">{item.observations}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  <Separator className="my-6" />
                  
                  {/* Resumo dos Produtos */}
                  <div className="bg-gradient-card rounded-lg p-6 border">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">
                          {fullTask.taskType === 'ligacao' ? 'Produtos Ofertados' : 'Produtos Selecionados'}
                        </p>
                        <p className="text-2xl font-bold text-primary">
                          {displayChecklist.filter(item => item.selected).length}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">Valor Total</p>
                        <p className="text-3xl font-bold text-success">
                          R$ {calculateTaskTotalValue(fullTask as any).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum produto/serviço cadastrado nesta atividade.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fotos */}
          {fullTask.photos && fullTask.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Fotos Anexadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {fullTask.photos.map((photo, index) => (
                    <div key={index} className="aspect-square rounded-lg overflow-hidden border">
                      <img 
                        src={photo} 
                        alt={`Foto ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                        onClick={() => window.open(photo, '_blank')}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Localização */}
          {fullTask.checkInLocation && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Dados de Localização
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Coordenadas</label>
                    <p className="font-medium">
                      {fullTask.checkInLocation.lat}, {fullTask.checkInLocation.lng}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Data/Hora do Check-in</label>
                    <p className="font-medium">
                      {format(new Date(fullTask.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                </div>
                
                {/* Link para Google Maps */}
                <div className="mt-4">
                  <Button variant="outline" size="sm" asChild>
                    <a 
                      href={`https://www.google.com/maps?q=${fullTask.checkInLocation.lat},${fullTask.checkInLocation.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      Ver no Google Maps
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          {fullTask.observations && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Observações Adicionais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-4 border-l-4 border-primary">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{fullTask.observations}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Seção de Deslocamento removida conforme solicitação do usuário */}

          {/* Status da Oportunidade - Componente Padronizado */}
          <SalesStatusDisplay 
            task={fullTask} 
            showDetails={true} 
            showLossReason={true} 
          />

          {/* Produtos Vendidos Parcialmente */}
          {salesStatus === 'parcial' && (fullTask.prospectItems?.some(p => p.selected) || fullTask.checklist?.some(p => p.selected)) && (
            <ProductListComponent
              products={fullTask.prospectItems?.length ? fullTask.prospectItems : fullTask.checklist || []}
              readOnly={true}
              showSelectedOnly={true}
              title="Produtos da Venda Parcial"
            />
          )}

          {/* Notas de Prospect */}
          {fullTask.prospectNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Notas de Prospecção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-4 border-l-4 border-blue-500">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{fullTask.prospectNotes}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lembretes */}
          {fullTask.reminders && fullTask.reminders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Lembretes Configurados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {fullTask.reminders.map((reminder, index) => (
                    <div key={reminder.id || index} className="border rounded-lg p-4 bg-muted/30">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold">{reminder.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{reminder.description}</p>
                          <div className="flex items-center gap-4 mt-3 text-sm">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>{format(new Date(reminder.date), 'dd/MM/yyyy', { locale: ptBR })}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span>{reminder.time}</span>
                            </div>
                          </div>
                        </div>
                        <Badge variant={reminder.completed ? 'default' : 'secondary'} className="ml-4">
                          {reminder.completed ? 'Concluído' : 'Pendente'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documentos */}
          {fullTask.documents && fullTask.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Documentos Anexados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {fullTask.documents.map((doc, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <FileText className="w-5 h-5 text-primary" />
                      <span className="flex-1 font-medium">Documento {index + 1}</span>
                      <Button variant="outline" size="sm" asChild>
                        <a href={doc} target="_blank" rel="noopener noreferrer">
                          Visualizar
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
