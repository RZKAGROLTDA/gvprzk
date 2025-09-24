import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Activity, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export const QuickDiagnosticButton: React.FC = () => {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);

  const runQuickDiagnostic = async () => {
    if (!user) {
      toast({
        title: "❌ Erro",
        description: "Usuário não autenticado",
        variant: "destructive",
      });
      return;
    }

    setIsRunning(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      // 1. Teste de perfil
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error || !profile) {
          errorCount++;
          console.error('❌ Diagnóstico: Perfil com problema');
        } else if (profile.approval_status !== 'approved') {
          errorCount++;
          console.error('❌ Diagnóstico: Perfil não aprovado');
        } else {
          successCount++;
          console.log('✅ Diagnóstico: Perfil OK');
        }
      } catch (error) {
        errorCount++;
        console.error('❌ Diagnóstico: Erro crítico no perfil');
      }

      // 2. Teste rápido da função segura
      try {
        const startTime = performance.now();
        const { data, error } = await supabase
          .rpc('get_secure_tasks_with_customer_protection');
        const endTime = performance.now();
        const responseTime = Math.round(endTime - startTime);

        if (error) {
          errorCount++;
          console.error('❌ Diagnóstico: Função segura com erro', error.message);
        } else {
          successCount++;
          console.log(`✅ Diagnóstico: Função segura OK (${responseTime}ms, ${data?.length || 0} tasks)`);
        }
      } catch (error) {
        errorCount++;
        console.error('❌ Diagnóstico: Função segura falhou completamente');
      }

      // 3. Teste de conectividade básica
      try {
        const { data: filiais, error } = await supabase
          .from('filiais')
          .select('id')
          .limit(1);

        if (error) {
          errorCount++;
          console.error('❌ Diagnóstico: Erro de conectividade');
        } else {
          successCount++;
          console.log('✅ Diagnóstico: Conectividade OK');
        }
      } catch (error) {
        errorCount++;
        console.error('❌ Diagnóstico: Falha total de conectividade');
      }

      // Resultado final
      const total = successCount + errorCount;
      const healthScore = Math.round((successCount / total) * 100);

      if (healthScore >= 80) {
        toast({
          title: "✅ Sistema Saudável",
          description: `${successCount}/${total} testes passaram. Score: ${healthScore}%`,
        });
      } else if (healthScore >= 50) {
        toast({
          title: "⚠️ Sistema com Problemas",
          description: `${successCount}/${total} testes passaram. Score: ${healthScore}%. Verificar logs.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "❌ Sistema com Falhas Críticas",
          description: `${successCount}/${total} testes passaram. Score: ${healthScore}%. Ação necessária.`,
          variant: "destructive",
        });
      }

      console.log(`🏥 Diagnóstico concluído: ${successCount}/${total} testes passaram (${healthScore}%)`);

    } catch (error) {
      console.error('❌ Erro crítico no diagnóstico:', error);
      toast({
        title: "❌ Falha no Diagnóstico",
        description: "Erro crítico durante a execução do diagnóstico",
        variant: "destructive",
      });
    }

    setIsRunning(false);
  };

  return (
    <Button 
      onClick={runQuickDiagnostic}
      disabled={isRunning}
      variant="outline"
      size="sm"
      className="w-full"
    >
      {isRunning ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Executando Diagnóstico...
        </>
      ) : (
        <>
          <Activity className="h-4 w-4 mr-2" />
          Diagnóstico Rápido
        </>
      )}
    </Button>
  );
};