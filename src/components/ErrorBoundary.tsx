import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
  title?: string;
}

interface State {
  error: Error | null;
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
          <p className="text-sm text-muted-foreground break-words">{error.message}</p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={this.reset}>
              <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
            <Button onClick={() => window.location.reload()}>Recarregar página</Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
