import React from 'react';
import { X, Download, Printer, Mail, MapPin, Camera } from 'lucide-react';
import { Task } from '@/types/task';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface OpportunityReportSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
}

const OpportunityReportSidebar: React.FC<OpportunityReportSidebarProps> = ({
  isOpen,
  onClose,
  task
}) => {
  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return '—';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDisplayValue = (value: any) => {
    if (value === null || value === undefined || value === '') return '—';
    return value;
  };

  const getTaskTypeLabel = (type: string) => {
    const types = {
      'prospection': 'Visita',
      'ligacao': 'Ligação',
      'checklist': 'Checklist'
    };
    return types[type as keyof typeof types] || type;
  };

  const getStatusColor = (status: string): "secondary" | "default" | "destructive" => {
    const colors = {
      'pending': 'secondary' as const,
      'completed': 'default' as const,
      'cancelled': 'destructive' as const
    };
    return colors[status as keyof typeof colors] || 'secondary';
  };

  const handleGeneratePDF = () => {
    // Implementar geração de PDF
    console.log('Generating PDF for task:', task?.id);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSendEmail = () => {
    // Implementar envio por email
    console.log('Sending email for task:', task?.id);
  };

  if (!task) return null;

  // Calcular valor total da oportunidade baseado nos produtos se disponível
  const opportunityValue = typeof task.salesValue === 'number' ? task.salesValue : 0;
  const realizedValue = task.salesConfirmed ? opportunityValue : 0;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-6">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-2xl font-bold">
              Relatório de Oportunidade
            </SheetTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Quadro Resumo */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Cliente</div>
                <div className="text-lg font-semibold">{getDisplayValue(task.client)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Valor da Oportunidade</div>
                <div className="text-lg font-semibold text-green-600">
                  {formatCurrency(opportunityValue)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Valor Realizado</div>
                <div className="text-lg font-semibold text-blue-600">
                  {formatCurrency(realizedValue)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Status</div>
                <Badge variant={getStatusColor(task.status)}>
                  {task.status === 'pending' ? 'Pendente' : 
                   task.status === 'completed' ? 'Concluído' : 'Cancelado'}
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Metadados */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Vendedor:</span>
                  <div className="font-medium">{getDisplayValue(task.responsible)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Filial:</span>
                  <div className="font-medium">{getDisplayValue(task.filial)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Hectares:</span>
                  <div className="font-medium">{getDisplayValue(task.propertyHectares)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Família de Produtos:</span>
                  <div className="font-medium">{getDisplayValue(task.familyProduct)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Tipo de Atividade:</span>
                  <div className="font-medium">{getTaskTypeLabel(task.taskType)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Propriedade:</span>
                  <div className="font-medium">{getDisplayValue(task.property)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Criado em:</span>
                  <div className="font-medium">{formatDate(task.createdAt)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Última atualização:</span>
                  <div className="font-medium">{formatDate(task.updatedAt)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dados do Cliente */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Nome/Razão Social:</span>
                  <div className="font-medium">{getDisplayValue(task.client)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Código do Cliente:</span>
                  <div className="font-medium">{getDisplayValue(task.clientCode)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Email:</span>
                  <div className="font-medium">{getDisplayValue(task.email)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Telefone:</span>
                  <div className="font-medium">{getDisplayValue(task.phone)}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-muted-foreground">Propriedade:</span>
                  <div className="font-medium">{getDisplayValue(task.property)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dados do Vendedor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados do Vendedor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Nome:</span>
                  <div className="font-medium">{getDisplayValue(task.responsible)}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Email:</span>
                  <div className="font-medium">—</div>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-muted-foreground">Telefone/WhatsApp:</span>
                  <div className="font-medium">—</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Equipamentos */}
          {task.equipmentList && task.equipmentList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Equipamentos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {task.equipmentList.map((equipment: any, index: number) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Modelo:</span>
                          <div className="font-medium">{getDisplayValue(equipment.model)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Nº de Série:</span>
                          <div className="font-medium">{getDisplayValue(equipment.serial)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ano:</span>
                          <div className="font-medium">{getDisplayValue(equipment.year)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Observações:</span>
                          <div className="font-medium">{getDisplayValue(equipment.observations)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Produtos Ofertados */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Produtos Ofertados</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Preço Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {task.prospectItems && task.prospectItems.length > 0 ? (
                    task.prospectItems.map((item: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {item.photo && (
                              <img 
                                src={item.photo} 
                                alt={item.name}
                                className="w-16 h-16 object-cover rounded cursor-pointer"
                                onClick={() => {/* Abrir imagem ampliada */}}
                              />
                            )}
                            <div>{getDisplayValue(item.name)}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{getDisplayValue(item.quantity)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency((item.quantity || 0) * (item.price || 0))}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhum produto ofertado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <Separator className="my-4" />
              <div className="flex justify-between items-center font-semibold">
                <span>Total da Oportunidade:</span>
                <span className="text-lg text-green-600">{formatCurrency(opportunityValue)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Fotos / Anexos */}
          {task.photos && task.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Fotos / Anexos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {task.photos.map((photo, index) => (
                    <img 
                      key={index}
                      src={photo} 
                      alt={`Foto ${index + 1}`}
                      className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-80"
                      onClick={() => {/* Abrir visualização ampliada */}}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Localização */}
          {task.checkInLocation && (task.checkInLocation as any).lat && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Localização
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-100 h-48 rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground">Mapa da localização</span>
                  {/* Aqui seria integrado um mapa real */}
                </div>
                {(task.checkInLocation as any).address && (
                  <div className="mt-3">
                    <span className="text-sm text-muted-foreground">Endereço:</span>
                    <div className="font-medium">{(task.checkInLocation as any).address}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Observações Gerais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Observações Gerais</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm">
                {getDisplayValue(task.observations)}
              </div>
            </CardContent>
          </Card>

          {/* Ações do Relatório */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ações do Relatório</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleGeneratePDF} className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Gerar PDF
                </Button>
                <Button variant="outline" onClick={handlePrint} className="flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Imprimir
                </Button>
                <Button variant="outline" onClick={handleSendEmail} className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Enviar por E-mail
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default OpportunityReportSidebar;