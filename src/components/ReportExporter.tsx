import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { mapSupabaseTaskToTask } from '@/lib/taskMapper';
import { mapSalesStatus, getStatusLabel } from '@/lib/taskStandardization';
import { getSalesValueAsNumber } from '@/lib/securityUtils';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface ReportExporterProps {
  variant?: 'default' | 'outline' | 'ghost' | 'gradient';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

export const ReportExporter: React.FC<ReportExporterProps> = ({ 
  variant = 'outline', 
  size = 'default',
  className = '' 
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const { user } = useAuth();


  const fetchVisitData = async () => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    // Buscar tarefas de visita com todas as informações relacionadas
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select(`
        *,
        products (*),
        reminders (*)
      `)
      .eq('task_type', 'prospection')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return tasks;
  };

  const exportToPDF = async () => {
    try {
      setIsExporting(true);
      const visitData = await fetchVisitData();

      if (!visitData || visitData.length === 0) {
        toast({
          title: "Aviso",
          description: "Nenhuma visita encontrada para exportar",
          variant: "destructive"
        });
        return;
      }

      const doc = new jsPDF();
      
      // Título do relatório
      doc.setFontSize(18);
      doc.text('Relatório de Visitas às Fazendas', 20, 20);
      
      doc.setFontSize(12);
      doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 20, 30);
      doc.text(`Total de visitas: ${visitData.length}`, 20, 40);

      // Preparar dados para a tabela
      const tableData = visitData.map((visit) => {
        const mappedTask = mapSupabaseTaskToTask(visit);
        const salesStatus = mapSalesStatus(mappedTask);
        const salesValue = getSalesValueAsNumber(mappedTask.salesValue);
        
        return [
          visit.responsible || 'N/A',
          visit.client || 'N/A',
          visit.property || 'N/A',
          visit.start_date ? format(new Date(visit.start_date), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A',
          `R$ ${salesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          getStatusLabel(salesStatus),
          visit.status === 'completed' ? 'Concluída' : 
          visit.status === 'in_progress' ? 'Em Andamento' : 
          visit.status === 'pending' ? 'Pendente' : 'Fechada',
          visit.observations || 'Sem observações'
        ];
      });

      // Adicionar tabela
      doc.autoTable({
        head: [['Responsável', 'Cliente', 'Propriedade', 'Data', 'Valor Oportunidade', 'Status Venda', 'Status Tarefa', 'Observações']],
        body: tableData,
        startY: 50,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [22, 160, 133] },
        margin: { top: 50 }
      });

      // Adicionar resumo financeiro com valores corretos
      const totalValue = visitData.reduce((sum, visit) => {
        const mappedTask = mapSupabaseTaskToTask(visit);
        return sum + getSalesValueAsNumber(mappedTask.salesValue);
      }, 0);
      const completedVisits = visitData.filter(visit => visit.status === 'completed').length;
      const salesData = visitData.map(visit => {
        const mappedTask = mapSupabaseTaskToTask(visit);
        return mapSalesStatus(mappedTask);
      });
      const partiaisCount = salesData.filter(status => status === 'parcial').length;
      const ganhosCount = salesData.filter(status => status === 'ganho').length;
      
      const finalY = (doc as any).lastAutoTable.finalY + 20;
      
      doc.setFontSize(14);
      doc.text('Resumo Financeiro e de Vendas:', 20, finalY);
      doc.setFontSize(12);
      doc.text(`Total de Oportunidades: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, finalY + 10);
      doc.text(`Visitas Concluídas: ${completedVisits}`, 20, finalY + 20);
      doc.text(`Vendas Parciais: ${partiaisCount}`, 20, finalY + 30);
      doc.text(`Vendas Realizadas: ${ganhosCount}`, 20, finalY + 40);
      doc.text(`Taxa de Conclusão: ${((completedVisits / visitData.length) * 100).toFixed(1)}%`, 20, finalY + 50);

      // Salvar o PDF
      doc.save(`relatorio-visitas-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`);
      
      toast({
        title: "✅ Relatório Exportado",
        description: "PDF gerado com sucesso!"
      });

    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar o relatório PDF",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = async () => {
    try {
      setIsExporting(true);
      const visitData = await fetchVisitData();

      if (!visitData || visitData.length === 0) {
        toast({
          title: "Aviso",
          description: "Nenhuma visita encontrada para exportar",
          variant: "destructive"
        });
        return;
      }

      // Preparar dados para Excel
      const excelData = visitData.map((visit) => {
        const mappedTask = mapSupabaseTaskToTask(visit);
        const salesStatus = mapSalesStatus(mappedTask);
        const salesValue = getSalesValueAsNumber(mappedTask.salesValue);
        
        return {
          'Responsável': visit.responsible || 'N/A',
          'Cliente': visit.client || 'N/A',
          'Propriedade': visit.property || 'N/A',
          'Data da Visita': visit.start_date ? format(new Date(visit.start_date), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A',
          'Horário Início': visit.start_time || 'N/A',
          'Horário Fim': visit.end_time || 'N/A',
          'Valor da Oportunidade': salesValue,
          'Status da Venda': getStatusLabel(salesStatus),
          'Status da Tarefa': visit.status === 'completed' ? 'Concluída' : 
                   visit.status === 'in_progress' ? 'Em Andamento' : 
                   visit.status === 'pending' ? 'Pendente' : 'Fechada',
          'É Prospect': visit.is_prospect ? 'Sim' : 'Não',
          'KM Inicial': visit.initial_km || 0,
          'KM Final': visit.final_km || 0,
          'Observações': visit.observations || 'Sem observações',
          'Data de Criação': visit.created_at ? format(new Date(visit.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A'
        };
      });

      // Criar planilha
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Visitas');

      // Criar aba de resumo com dados de vendas
      const totalValue = visitData.reduce((sum, visit) => {
        const mappedTask = mapSupabaseTaskToTask(visit);
        return sum + getSalesValueAsNumber(mappedTask.salesValue);
      }, 0);
      const completedVisits = visitData.filter(visit => visit.status === 'completed').length;
      const salesData = visitData.map(visit => {
        const mappedTask = mapSupabaseTaskToTask(visit);
        return mapSalesStatus(mappedTask);
      });
      const partiaisCount = salesData.filter(status => status === 'parcial').length;
      const ganhosCount = salesData.filter(status => status === 'ganho').length;
      const prospectCount = salesData.filter(status => status === 'prospect').length;
      const perdidosCount = salesData.filter(status => status === 'perdido').length;
      
      const summaryData = [
        { 'Métrica': 'Total de Visitas', 'Valor': visitData.length },
        { 'Métrica': 'Visitas Concluídas', 'Valor': completedVisits },
        { 'Métrica': 'Taxa de Conclusão (%)', 'Valor': ((completedVisits / visitData.length) * 100).toFixed(1) },
        { 'Métrica': 'Total de Oportunidades (R$)', 'Valor': totalValue.toFixed(2) },
        { 'Métrica': 'Prospects', 'Valor': prospectCount },
        { 'Métrica': 'Vendas Parciais', 'Valor': partiaisCount },
        { 'Métrica': 'Vendas Realizadas', 'Valor': ganhosCount },
        { 'Métrica': 'Vendas Perdidas', 'Valor': perdidosCount }
      ];

      const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Resumo');

      // Salvar arquivo
      XLSX.writeFile(workbook, `relatorio-visitas-${format(new Date(), 'yyyy-MM-dd-HHmm')}.xlsx`);
      
      toast({
        title: "✅ Relatório Exportado",
        description: "Planilha Excel gerada com sucesso!"
      });

    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar a planilha Excel",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (format === 'pdf') {
      await exportToPDF();
    } else {
      await exportToExcel();
    }
  };

  return (
    <div className="flex gap-2">
      <Button 
        type="button" 
        variant={variant} 
        size={size}
        className={className}
        onClick={() => handleExport('pdf')}
        disabled={isExporting}
      >
        <Download className="h-4 w-4 mr-2" />
        {isExporting ? 'Gerando...' : 'Exportar PDF'}
      </Button>
      
      <Button 
        type="button" 
        variant={variant} 
        size={size}
        className={className}
        onClick={() => handleExport('excel')}
        disabled={isExporting}
      >
        <Download className="h-4 w-4 mr-2" />
        {isExporting ? 'Gerando...' : 'Exportar Excel'}
      </Button>
    </div>
  );
};