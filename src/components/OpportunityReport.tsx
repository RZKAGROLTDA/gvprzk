import React, { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Download, 
  Printer, 
  Mail, 
  Loader2, 
  User, 
  Building, 
  Calendar, 
  MapPin, 
  Crop, 
  Package, 
  DollarSign, 
  FileText,
  Camera,
  Hash,
  AtSign,
  Phone
} from 'lucide-react';
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
import { useToast } from "@/hooks/use-toast";
import { Task } from "@/types/task";
import { formatSalesValue } from '@/lib/securityUtils';
import { calculateTaskSalesValue } from '@/lib/salesValueCalculator';
import { getTaskTypeLabel } from './TaskFormCore';
import { generateTaskPDF } from './TaskPDFGenerator';
import { resolveFilialName } from '@/lib/taskStandardization';

interface OpportunityReportProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
}

export const OpportunityReport: React.FC<OpportunityReportProps> = ({
  task,
  isOpen,
  onClose
}) => {
  const { toast } = useToast();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const getSalesStatusInfo = (task: Task) => {
    if (task.salesConfirmed && task.salesType === 'ganho') {
      return { label: 'Venda Realizada', color: 'bg-green-500', variant: 'default' as const };
    }
    if (task.salesConfirmed && task.salesType === 'parcial') {
      return { label: 'Venda Parcial', color: 'bg-blue-500', variant: 'secondary' as const };
    }
    if (task.salesType === 'perdido') {
      return { label: 'Perdida', color: 'bg-red-500', variant: 'destructive' as const };
    }
    if (task.isProspect) {
      return { label: 'Prospect', color: 'bg-yellow-500', variant: 'outline' as const };
    }
    return { label: 'Em Análise', color: 'bg-gray-500', variant: 'secondary' as const };
  };

  const statusInfo = getSalesStatusInfo(task);
  const salesValue = calculateTaskSalesValue(task);
  const opportunityValue = task.salesValue;

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await generateTaskPDF(task, calculateTaskSalesValue, getTaskTypeLabel);
      toast({
        title: "PDF gerado com sucesso!",
        description: "O relatório foi baixado automaticamente.",
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Ocorreu um erro ao gerar o arquivo.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleEmail = () => {
    const subject = `Relatório de Oportunidade - ${task.client}`;
    const body = `Segue em anexo o relatório de oportunidade para o cliente ${task.client}.
    
Detalhes:
- Cliente: ${task.client}
- Valor da Oportunidade: ${formatSalesValue(opportunityValue)}
- Status: ${statusInfo.label}
- Data de Criação: ${format(task.createdAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })}

Atenciosamente,
${task.responsible}`;

    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-4">
          <DialogTitle className="text-2xl font-bold text-center">
            Relatório de Oportunidade
          </DialogTitle>
          
          {/* Action Buttons */}
          <div className="flex justify-center gap-2">
            <Button 
              onClick={generatePDF} 
              disabled={isGeneratingPDF}
              className="flex items-center gap-2"
            >
              {isGeneratingPDF ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Gerar PDF
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button variant="outline" onClick={handleEmail}>
              <Mail className="w-4 h-4 mr-2" />
              Enviar por E-mail
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-6">
          {/* Quadro Resumo */}
          <Card className="border-2 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Resumo da Oportunidade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-primary/5 rounded-lg">
                  <User className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-bold text-lg">{task.client}</p>
                </div>
                <div className="text-center p-4 bg-primary/5 rounded-lg">
                  <DollarSign className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-sm text-muted-foreground">Valor da Oportunidade</p>
                  <p className="font-bold text-lg">{formatSalesValue(opportunityValue)}</p>
                </div>
                <div className="text-center p-4 bg-primary/5 rounded-lg">
                  <FileText className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={statusInfo.variant} className={`${statusInfo.color} text-white`}>
                    {statusInfo.label}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informações Gerais */}
          <Card>
            <CardHeader>
              <CardTitle>Informações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Cliente:</span>
                    <span className="font-medium">{task.client}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Código:</span>
                    <span className="font-medium">{task.clientCode || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AtSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">E-mail:</span>
                    <span className="font-medium">{task.email || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Telefone:</span>
                    <span className="font-medium">{task.phone || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Propriedade:</span>
                    <span className="font-medium">{task.property}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Vendedor:</span>
                    <span className="font-medium">{task.responsible}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Filial:</span>
                    <span className="font-medium">{resolveFilialName(task.filial) || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Crop className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Hectares:</span>
                    <span className="font-medium">{task.propertyHectares || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Família de Produtos:</span>
                    <span className="font-medium">{task.familyProduct || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Equipamentos */}
          {task.equipmentList && task.equipmentList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Lista de Equipamentos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {task.equipmentList.map((equipment, index) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span>{equipment.familyProduct}</span>
                      <Badge variant="outline">{equipment.quantity} unidades</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Produtos e Oportunidades */}
          <Card>
            <CardHeader>
              <CardTitle>Produtos e Oportunidades</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Produtos do Checklist */}
              {task.checklist && task.checklist.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3 text-primary">Produtos Oferecidos (Checklist):</h4>
                  <div className="space-y-3">
                    {task.checklist.filter(item => item.selected).map((item, index) => (
                      <div key={index} className="border border-border rounded-lg p-3 bg-card">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h5 className="font-medium text-foreground">{item.name}</h5>
                            <p className="text-sm text-muted-foreground capitalize">
                              Categoria: {item.category.replace('_', ' ')}
                            </p>
                            {item.observations && (
                              <p className="text-sm text-muted-foreground mt-1">
                                <span className="font-medium">Observações:</span> {item.observations}
                              </p>
                            )}
                          </div>
                          <div className="text-right space-y-1">
                            {item.quantity && (
                              <p className="text-sm font-medium">Qtd: {item.quantity}</p>
                            )}
                            {item.price && (
                              <p className="text-sm font-bold text-primary">
                                {formatSalesValue(item.price)}
                              </p>
                            )}
                          </div>
                        </div>
                        {item.photos && item.photos.length > 0 && (
                          <div className="mt-2 flex gap-2">
                            {item.photos.map((photo, photoIndex) => (
                              <img 
                                key={photoIndex}
                                src={photo} 
                                alt={`${item.name} - ${photoIndex + 1}`}
                                className="w-16 h-16 object-cover rounded border"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Total dos produtos selecionados */}
                  {(() => {
                    const total = task.checklist
                      .filter(item => item.selected && item.price && item.quantity)
                      .reduce((sum, item) => sum + (item.price! * item.quantity!), 0);
                    
                    return total > 0 && (
                      <div className="mt-4 p-3 bg-primary/10 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Total dos Produtos (Checklist):</span>
                          <span className="font-bold text-lg text-primary">
                            {formatSalesValue(total)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Produtos de Prospect */}
              {task.prospectItems && task.prospectItems.length > 0 && (
                <div className={task.checklist && task.checklist.length > 0 ? "pt-4 border-t" : ""}>
                  <h4 className="font-medium mb-3 text-primary">Itens de Prospect:</h4>
                  <div className="space-y-3">
                    {task.prospectItems.filter(item => item.selected).map((item, index) => (
                      <div key={index} className="border border-border rounded-lg p-3 bg-card">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h5 className="font-medium text-foreground">{item.name}</h5>
                            <p className="text-sm text-muted-foreground capitalize">
                              Categoria: {item.category.replace('_', ' ')}
                            </p>
                            {item.observations && (
                              <p className="text-sm text-muted-foreground mt-1">
                                <span className="font-medium">Observações:</span> {item.observations}
                              </p>
                            )}
                          </div>
                          <div className="text-right space-y-1">
                            {item.quantity && (
                              <p className="text-sm font-medium">Qtd: {item.quantity}</p>
                            )}
                            {item.price && (
                              <p className="text-sm font-bold text-primary">
                                {formatSalesValue(item.price)}
                              </p>
                            )}
                          </div>
                        </div>
                        {item.photos && item.photos.length > 0 && (
                          <div className="mt-2 flex gap-2">
                            {item.photos.map((photo, photoIndex) => (
                              <img 
                                key={photoIndex}
                                src={photo} 
                                alt={`${item.name} - ${photoIndex + 1}`}
                                className="w-16 h-16 object-cover rounded border"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Total dos itens de prospect */}
                  {(() => {
                    const total = task.prospectItems
                      .filter(item => item.selected && item.price && item.quantity)
                      .reduce((sum, item) => sum + (item.price! * item.quantity!), 0);
                    
                    return total > 0 && (
                      <div className="mt-4 p-3 bg-primary/10 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Total dos Itens (Prospect):</span>
                          <span className="font-bold text-lg text-primary">
                            {formatSalesValue(total)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Quando não há produtos */}
              {(!task.checklist || task.checklist.filter(item => item.selected).length === 0) && 
               (!task.prospectItems || task.prospectItems.filter(item => item.selected).length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum produto foi selecionado para esta oportunidade.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fotos */}
          {task.photos && task.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Fotos da Visita
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {task.photos.map((photo, index) => (
                    <div key={index} className="relative">
                      <img 
                        src={photo} 
                        alt={`Foto ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg border"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Observações Gerais */}
          {task.observations && (
            <Card>
              <CardHeader>
                <CardTitle>Observações Gerais</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {task.observations}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Notas de Prospect */}
          {task.prospectNotes && (
            <Card>
              <CardHeader>
                <CardTitle>Notas de Prospect</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {task.prospectNotes}
                </p>
                {task.prospectNotesJustification && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground">Justificativa:</p>
                    <p className="text-sm">{task.prospectNotesJustification}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Histórico e Status */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico e Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Data de Criação:</span>
                    <span className="font-medium">
                      {format(task.createdAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Última Atualização:</span>
                    <span className="font-medium">
                      {format(task.updatedAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Valor da Oportunidade:</span>
                    <span className="font-medium">{formatSalesValue(opportunityValue)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Valor de Venda Realizada:</span>
                    <span className="font-medium">{formatSalesValue(salesValue)}</span>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status da Venda:</span>
                <Badge variant={statusInfo.variant} className={`${statusInfo.color} text-white`}>
                  {statusInfo.label}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};