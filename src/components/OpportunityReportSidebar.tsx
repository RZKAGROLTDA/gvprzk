import React from 'react';
import { Task } from '@/types/task';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { MapPin, Mail, Phone, FileText, Printer, Download, Building2, User, Calendar, DollarSign, Target, Activity } from 'lucide-react';
import { formatSalesValue } from '@/lib/securityUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OpportunityReportSidebarProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OpportunityReportSidebar: React.FC<OpportunityReportSidebarProps> = ({
  task,
  isOpen,
  onClose
}) => {
  if (!task) return null;

  const formatCurrency = (value: number | string | null | undefined) => {
    if (!value) return "R$ 0,00";
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return "R$ 0,00";
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(numValue);
  };

  const formatDate = (date: string | Date) => {
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return format(dateObj, 'dd/MM/yyyy HH:mm', { locale: ptBR });
    } catch {
      return '—';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const handleGeneratePDF = () => {
    // TODO: Implement PDF generation
    console.log('Gerar PDF do relatório');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSendEmail = () => {
    // TODO: Implement email sending
    console.log('Enviar relatório por email');
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full max-w-4xl overflow-y-auto">
        <SheetHeader className="space-y-4">
          <SheetTitle className="text-2xl font-bold text-center">
            Relatório de Oportunidade
          </SheetTitle>
          
          {/* Quadro Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <User className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Cliente</p>
                    <p className="font-semibold text-lg">{task.client || '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Target className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Oportunidade</p>
                    <p className="font-semibold text-lg">{formatCurrency(task.salesValue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Venda Realizada</p>
                    <p className="font-semibold text-lg">
                      {task.salesConfirmed ? formatCurrency(task.salesValue) : 'R$ 0,00'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Activity className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant={getStatusColor(task.status)} className="mt-1">
                      {task.status || '—'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Metadados */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Metadados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Vendedor:</span>
                  <span className="text-sm">{task.responsible || '—'}</span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filial:</span>
                  <span className="text-sm">{task.filial || '—'}</span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Hectares:</span>
                  <span className="text-sm">{task.propertyHectares || '—'}</span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Família de Produtos:</span>
                  <span className="text-sm">{task.familyProduct || '—'}</span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Tipo de Atividade:</span>
                  <span className="text-sm">
                    {task.taskType === 'prospection' ? 'Visita' : 
                     task.taskType === 'ligacao' ? 'Ligação' : 
                     task.taskType === 'checklist' ? 'Checklist' : task.taskType || '—'}
                  </span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Criado em:</span>
                  <span className="text-sm">{formatDate(task.createdAt)}</span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Última atualização:</span>
                  <span className="text-sm">{formatDate(task.updatedAt)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Dados do Cliente */}
          <Card>
            <CardHeader>
              <CardTitle>Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium">Nome/Razão Social:</span>
                  <p className="text-sm mt-1">{task.client || '—'}</p>
                </div>
                
                <div>
                  <span className="text-sm font-medium">Documento:</span>
                  <p className="text-sm mt-1">{task.clientCode || '—'}</p>
                </div>
                
                <div>
                  <span className="text-sm font-medium">Telefone:</span>
                  <p className="text-sm mt-1">{task.phone || '—'}</p>
                </div>
                
                <div>
                  <span className="text-sm font-medium">Email:</span>
                  <p className="text-sm mt-1">{task.email || '—'}</p>
                </div>
                
                <div className="md:col-span-2">
                  <span className="text-sm font-medium">Endereço:</span>
                  <p className="text-sm mt-1">{task.property || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dados do Vendedor */}
          <Card>
            <CardHeader>
              <CardTitle>Dados do Vendedor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium">Nome:</span>
                  <p className="text-sm mt-1">{task.responsible || '—'}</p>
                </div>
                
                <div>
                  <span className="text-sm font-medium">Email:</span>
                  <p className="text-sm mt-1">—</p>
                </div>
                
                <div>
                  <span className="text-sm font-medium">Telefone/WhatsApp:</span>
                  <p className="text-sm mt-1">—</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Equipamentos */}
          {task.equipmentList && Array.isArray(task.equipmentList) && task.equipmentList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Equipamentos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {task.equipmentList.map((equipment: any, index: number) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <span className="text-sm font-medium">Modelo/Descrição:</span>
                          <p className="text-sm">{equipment.model || equipment.description || '—'}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Nº de Série/Patrimônio:</span>
                          <p className="text-sm">{equipment.serialNumber || equipment.patrimony || '—'}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Ano:</span>
                          <p className="text-sm">{equipment.year || '—'}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Observações:</span>
                          <p className="text-sm">{equipment.observations || '—'}</p>
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
              <CardTitle>Produtos Ofertados</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Preço Unitário</TableHead>
                    <TableHead>Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>{task.familyProduct || 'Produto não especificado'}</TableCell>
                    <TableCell>1</TableCell>
                    <TableCell>{formatCurrency(task.salesValue)}</TableCell>
                    <TableCell>{formatCurrency(task.salesValue)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              
              <Separator className="my-4" />
              
              <div className="flex justify-end">
                <div className="text-right">
                  <p className="text-lg font-semibold">
                    Total da Oportunidade: {formatCurrency(task.salesValue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fotos / Anexos */}
          {task.photos && task.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Fotos / Anexos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {task.photos.map((photo, index) => (
                    <div key={index} className="aspect-square border rounded-lg overflow-hidden">
                      <img 
                        src={photo} 
                        alt={`Foto ${index + 1}`}
                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => window.open(photo, '_blank')}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Localização */}
          {task.checkInLocation && (
            <Card>
              <CardHeader>
                <CardTitle>Localização</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {task.checkInLocation.lat && task.checkInLocation.lng && (
                    <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <MapPin className="h-8 w-8 mx-auto mb-2" />
                        <p>Mapa da localização</p>
                        <p className="text-sm">
                          Lat: {task.checkInLocation.lat}, Lng: {task.checkInLocation.lng}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <span className="text-sm font-medium">Endereço:</span>
                    <p className="text-sm mt-1">{task.property || '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Observações Gerais */}
          <Card>
            <CardHeader>
              <CardTitle>Observações Gerais</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm whitespace-pre-wrap">
                  {task.observations || task.prospectNotes || '—'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Ações do Relatório */}
          <Card>
            <CardHeader>
              <CardTitle>Ações do Relatório</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleGeneratePDF} className="flex items-center space-x-2">
                  <Download className="h-4 w-4" />
                  <span>Gerar PDF</span>
                </Button>
                
                <Button variant="outline" onClick={handlePrint} className="flex items-center space-x-2">
                  <Printer className="h-4 w-4" />
                  <span>Imprimir</span>
                </Button>
                
                <Button variant="outline" onClick={handleSendEmail} className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span>Enviar por e-mail</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
};