import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { forceUpdateNow, hasUnsavedWork, isModuleLoadError } from '@/lib/appUpdate';

interface Props {
  children: React.ReactNode;
  title?: string;
}

interface State {
  error: Error | null;
  recovering?: boolean;
  recoveryMessage?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  private recoverModule = async () => {
    if (hasUnsavedWork() && !window.confirm('Há trabalho não salvo. Deseja atualizar a página?')) return;
    this.setState({ recovering: true, recoveryMessage: undefined });
    const result = await forceUpdateNow();
    if (!result.ok) this.setState({
      recovering: false,
      recoveryMessage: result.reason === 'offline'
        ? 'Sem conexão. Reconecte para carregar esta tela.'
        : 'A página ainda não está disponível. Tente novamente em instantes.',
    });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="max-w-lg space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="text-lg font-semibold">
            {this.props.title || 'Não foi possível exibir esta tela'}
          </h2>
          <p className="text-sm text-muted-foreground break-words">{isModuleLoadError(error)
            ? 'Não foi possível carregar esta página. Sua sessão e seus dados salvos foram preservados.'
            : error.message}</p>
          {this.state.recoveryMessage && <p role="status" className="text-sm text-muted-foreground">{this.state.recoveryMessage}</p>}
          <div className="flex justify-center gap-2">
            {isModuleLoadError(error) ? (
              <Button disabled={this.state.recovering} onClick={() => void this.recoverModule()}>
                <RefreshCw className="mr-2 h-4 w-4" /> {this.state.recovering ? 'Verificando…' : 'Tentar novamente'}
              </Button>
            ) : <>
            <Button variant="outline" onClick={this.reset}>
              <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
            <Button onClick={() => window.location.reload()}>Recarregar página</Button>
            </>}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
