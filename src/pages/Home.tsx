import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { MapPin, Phone, Wrench, Building } from 'lucide-react';
export const Home: React.FC = () => {
  const navigate = useNavigate();
  const menuItems = [{
    id: 'farm-visit',
    title: 'Visita à Fazenda',
    description: 'Registrar visita a propriedades rurais',
    icon: MapPin,
    color: 'from-green-500 to-emerald-600',
    onClick: () => navigate('/create-task?type=farm_visit')
  }, {
    id: 'workshop-checklist',
    title: 'Checklist Oficina',
    description: 'Verificação técnica e organizacional',
    icon: Wrench,
    color: 'from-blue-500 to-cyan-600',
    onClick: () => navigate('/create-task?type=workshop_checklist')
  }, {
    id: 'client-call',
    title: 'Ligação ao Cliente',
    description: 'Contato telefônico e follow-up',
    icon: Phone,
    color: 'from-purple-500 to-violet-600',
    onClick: () => navigate('/create-task?type=client_call')
  }];
  return <div className="bg-gradient-to-br from-background to-muted/20 p-4 sm:p-6 pt-4 sm:pt-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-4 sm:mb-6">
          <div className="flex items-center justify-center mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 bg-primary/10 rounded-full">
              <Building className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-xl sm:text-3xl font-bold mb-2 sm:mb-3">Gestão Visitas</h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto px-4">
            Gerencie suas atividades de campo, oficina e contatos de forma simples e eficiente
          </p>
        </div>

        {/* Menu Principal */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8 items-stretch">
          {menuItems.map(item => {
          const IconComponent = item.icon;
          return <Card key={item.id} className="group hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 cursor-pointer border-0 bg-gradient-to-br from-card to-card/80 flex flex-col" onClick={item.onClick}>
                <CardContent className="p-4 sm:p-6 text-center flex flex-col flex-1">
                  <div className={`mx-auto mb-3 sm:mb-4 p-3 sm:p-4 rounded-full bg-gradient-to-br ${item.color} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <IconComponent className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                  </div>
                  <h3 className="text-base sm:text-xl font-bold mb-1 sm:mb-2 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-3 sm:mb-4 flex-1">
                    {item.description}
                  </p>
                  <Button className="w-full group-hover:bg-primary/90 transition-colors mt-auto" size="sm" onClick={e => {
                e.stopPropagation();
                item.onClick();
              }}>
                    Iniciar
                  </Button>
                </CardContent>
              </Card>;
        })}
        </div>

        {/* Acesso Rápido */}
        
      </div>
    </div>;
};