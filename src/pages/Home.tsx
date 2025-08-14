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
  return <div className="bg-gradient-to-br from-background to-muted/20 p-4 sm:p-6 pt-8 sm:pt-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex items-center justify-center mb-4 sm:mb-6">
            <div className="p-3 sm:p-4 bg-primary/10 rounded-full">
              <Building className="h-8 w-8 sm:h-12 sm:w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4">Gestão Visitas</h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
            Gerencie suas atividades de campo, oficina e contatos de forma simples e eficiente
          </p>
        </div>

        {/* Menu Principal */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 mb-8 sm:mb-12">
          {menuItems.map(item => {
          const IconComponent = item.icon;
          return <Card key={item.id} className="group hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 cursor-pointer border-0 bg-gradient-to-br from-card to-card/80" onClick={item.onClick}>
                <CardContent className="p-4 sm:p-8 text-center">
                  <div className={`mx-auto mb-4 sm:mb-6 p-4 sm:p-6 rounded-full bg-gradient-to-br ${item.color} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <IconComponent className="h-8 w-8 sm:h-12 sm:w-12 text-white" />
                  </div>
                  <h3 className="text-lg sm:text-2xl font-bold mb-2 sm:mb-3 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-4 sm:mb-6">
                    {item.description}
                  </p>
                  <Button className="w-full group-hover:bg-primary/90 transition-colors" size="lg" onClick={e => {
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