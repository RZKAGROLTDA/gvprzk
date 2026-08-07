import React from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  MANDATORY_UPDATE_EVENT,
  checkMandatoryUpdate,
  forceUpdateNow,
  type MandatoryOutcome,
} from '@/lib/appUpdate';

const RETRY_WHEN_BUSY_MS = 15 * 1000;
const REVALIDATE_MS = 5 * 60 * 1000;

/**
 * Gate de versão mínima obrigatória (antes das rotas).
 * Só bloqueia quando o version.json confirma que o build carregado é anterior
 * ao mínimo obrigatório E a atualização automática já falhou.
 * Offline, falha temporária de rede ou configuração inválida NUNCA bloqueiam.
 */
export const MandatoryUpdateGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = React.useState<MandatoryOutcome['status']>('unknown');

  React.useEffect(() => {
    let stopped = false;
    let busyTimer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (stopped) return;
      let outcome: MandatoryOutcome;
      try {
        outcome = await checkMandatoryUpdate();
      } catch (e) {
        console.error('[app-update] falha ao verificar versão mínima', e);
        outcome = { status: 'ok' };
      }
      if (stopped) return;
      setStatus(outcome.status);
      if (outcome.status === 'blocked') {
        window.dispatchEvent(new CustomEvent(MANDATORY_UPDATE_EVENT));
      }
      if (outcome.status === 'deferred') {
        clearTimeout(busyTimer);
        busyTimer = setTimeout(run, RETRY_WHEN_BUSY_MS);
      }
    };

    void run();
    const interval = setInterval(run, REVALIDATE_MS);
    const onOnline = () => void run();
    window.addEventListener('online', onOnline);

    return () => {
      stopped = true;
      clearTimeout(busyTimer);
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (status === 'blocked') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <Alert className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>É necessário atualizar a aplicação para continuar</AlertTitle>
          <AlertDescription className="mt-2 space-y-4">
            <p>
              Esta versão não é mais suportada. Seus dados, rascunhos e envios pendentes estão
              preservados.
            </p>
            <Button onClick={() => void forceUpdateNow()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar agora
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return <>{children}</>;
};
