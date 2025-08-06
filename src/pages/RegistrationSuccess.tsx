import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const RegistrationSuccess: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto mb-4 p-4 bg-gradient-to-br from-success to-success/80 rounded-full w-fit shadow-lg">
            <CheckCircle className="h-8 w-8 text-success-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Cadastro Enviado!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Clock className="h-5 w-5" />
              <span>Aguardando aprovação</span>
            </div>
            <p className="text-muted-foreground">
              Seu cadastro foi enviado com sucesso! O gestor irá revisar suas informações e você receberá um email quando for aprovado.
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium mb-2">Próximos passos:</p>
            <ul className="text-left space-y-1 text-muted-foreground">
              <li>• Aguarde o email de aprovação</li>
              <li>• Verifique sua caixa de entrada regularmente</li>
              <li>• Entre em contato com o gestor se necessário</li>
            </ul>
          </div>

          <Button 
            onClick={() => navigate('/')}
            variant="outline"
            className="w-full"
          >
            Voltar ao Início
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegistrationSuccess;