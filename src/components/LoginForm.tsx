import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Settings, Trash, Eye, EyeOff, Building, WifiOff, RefreshCw } from 'lucide-react';
import { SessionRefresh } from '@/components/SessionRefresh';
import { useInputValidation } from '@/hooks/useInputValidation';
import { useSecurityMonitor } from '@/hooks/useSecurityMonitor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator';
import { getVersionInfo, formatVersion, formatDetailedVersion, storeCurrentVersion } from '@/config/version';
import { isConnectionError, getConnectionErrorMessage } from '@/lib/retryWithBackoff';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const LoginForm: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockTimeLeft, setBlockTimeLeft] = useState(0);
  const [isAdminEmail, setIsAdminEmail] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'sales_consultant',
    filial_id: ''
  });
  const [filiais, setFiliais] = useState<Array<{id: string, nome: string}>>([]);
  const [filiaisLoading, setFiliaisLoading] = useState(true);
  const [filiaisError, setFiliaisError] = useState('');
  const filiaisLoadedRef = React.useRef(false);
  
  // Version info
  const versionInfo = getVersionInfo();

  const { validateField, getFieldErrors, hasErrors, validationRules } = useInputValidation();
  const { monitorLoginAttempt, monitorPasswordReset, checkRateLimit } = useSecurityMonitor();

  // Load filiais on component mount - with dedup protection
  useEffect(() => {
    if (filiaisLoadedRef.current) return;
    filiaisLoadedRef.current = true;
    
    const loadFiliais = async () => {
      setFiliaisLoading(true);
      setFiliaisError('');
      
      try {
        console.log('🔄 LoginForm: Carregando filiais...');
        const { data, error } = await supabase.rpc('get_filiais_for_registration');
        
        if (error) {
          console.error('❌ LoginForm: Erro ao carregar filiais:', error);
          
          if (isConnectionError(error)) {
            setConnectionError(true);
            setFiliaisError('Serviço indisponível');
          } else {
            setFiliaisError('Usando filiais padrão');
          }
          
          setFiliais([
            { id: 'fallback-1', nome: 'Filial Central' },
            { id: 'fallback-2', nome: 'Filial Norte' },
            { id: 'fallback-3', nome: 'Filial Sul' }
          ]);
        } else {
          console.log('✅ LoginForm: Filiais carregadas:', data?.length || 0);
          setFiliais(data || []);
          setConnectionError(false);
          
          if (!data || data.length === 0) {
            setFiliaisError('Nenhuma filial encontrada');
          }
        }
      } catch (error: any) {
        const errorMessage = error.message || 'Erro ao carregar filiais';
        console.error('💥 LoginForm: Erro crítico:', errorMessage);
        
        if (isConnectionError(error)) {
          setConnectionError(true);
          setFiliaisError('Serviço indisponível');
        } else {
          setFiliaisError(errorMessage);
        }
        
        setFiliais([
          { id: 'fallback-1', nome: 'Filial Central' },
          { id: 'fallback-2', nome: 'Filial Norte' },
          { id: 'fallback-3', nome: 'Filial Sul' }
        ]);
      } finally {
        setFiliaisLoading(false);
      }
    };
    
    loadFiliais();
  }, []);

  const reloadFiliais = async () => {
    filiaisLoadedRef.current = false;
    setFiliaisLoading(true);
    
    try {
      const { data, error } = await supabase.rpc('get_filiais_for_registration');
      
      if (!error && data) {
        setFiliais(data);
        setFiliaisError('');
        setConnectionError(false);
      }
    } catch (e) {
      // Keep existing data on error
    } finally {
      setFiliaisLoading(false);
      filiaisLoadedRef.current = true;
    }
  };

  // Check if email is admin using database
  const checkAdminStatus = async (email: string) => {
    if (!email) {
      setIsAdminEmail(false);
      return;
    }
    
    try {
      const { data, error } = await supabase.rpc('is_admin_by_email', { 
        check_email: email.toLowerCase() 
      });
      
      if (!error) {
        setIsAdminEmail(data || false);
      }
    } catch (error) {
      // Silently fail - not critical for login
      setIsAdminEmail(false);
    }
  };

  // Check admin status when email changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkAdminStatus(formData.email);
    }, 500); // Debounce the check

    return () => clearTimeout(timeoutId);
  }, [formData.email]);

  // Sistema de bloqueio temporário
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isBlocked && blockTimeLeft > 0) {
      interval = setInterval(() => {
        setBlockTimeLeft(prev => {
          if (prev <= 1) {
            setIsBlocked(false);
            setLoginAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isBlocked, blockTimeLeft]);

  // Limpar dados locais se houver erro persistente
  const clearLocalData = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Limpar especificamente os dados do Supabase
      localStorage.removeItem('sb-wuvbrkbhunifudaewhng-auth-token');
      
      // Reset login attempts
      setLoginAttempts(0);
      setIsBlocked(false);
      setBlockTimeLeft(0);
      
      toast({
        title: "Dados locais limpos",
        description: "Cache e tokens removidos. Contador de tentativas resetado.",
      });
    } catch (error) {
      // Error handling for cache clearing
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    const isEmailValid = validateField('email', formData.email, validationRules.email);
    const isPasswordValid = validateField('password', formData.password, { required: true });
    
    if (!isEmailValid.isValid || !isPasswordValid.isValid) {
      toast({
        title: "Dados inválidos",
        description: "Verifique os campos em vermelho",
        variant: "destructive",
      });
      return;
    }
    
    // Check rate limiting before attempting login
    const isAllowed = await checkRateLimit(formData.email.trim().toLowerCase());
    if (!isAllowed) {
      setIsBlocked(true);
      setBlockTimeLeft(900); // 15 minutes
      toast({
        title: "Muitas tentativas",
        description: "Muitas tentativas de login falharam. Tente novamente em 15 minutos.",
        variant: "destructive",
      });
      return;
    }
    
    // Verificar se está bloqueado
    if (isBlocked) {
      toast({
        title: "Muitas tentativas",
        description: `Aguarde ${blockTimeLeft} segundos antes de tentar novamente.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setConnectionError(false);
    
    const { error } = await signIn(formData.email, formData.password);
    
    if (error) {
      // Check for connection errors first
      if (isConnectionError(error)) {
        setConnectionError(true);
        toast({
          title: "Serviço indisponível",
          description: getConnectionErrorMessage(error),
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      
      // Incrementar contador de tentativas
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);
      
      // Monitor failed login attempt
      monitorLoginAttempt(formData.email, false);
      
      let errorMessage = "Erro no login";
      
      // Mensagens mais amigáveis para erros comuns
      if (error.message === 'Invalid login credentials') {
        errorMessage = `Credenciais inválidas. Tentativa ${newAttempts}/5.`;
        
        // Bloquear após 5 tentativas
        if (newAttempts >= 5) {
          setIsBlocked(true);
          setBlockTimeLeft(300); // 5 minutos
          errorMessage = 'Muitas tentativas incorretas. Conta bloqueada por 5 minutos.';
        } else if (newAttempts >= 3) {
          errorMessage += ` Atenção: ${5 - newAttempts} tentativas restantes.`;
        }
      } else if (error.message.includes('refresh_token_not_found')) {
        errorMessage = 'Sessão expirada. Limpe os dados locais e tente novamente.';
      } else if (error.message.includes('Email not confirmed')) {
        errorMessage = 'Email não confirmado. Verifique sua caixa de entrada.';
      } else if (error.message.includes('User not found')) {
        errorMessage = 'Usuário não encontrado. Verifique o email ou cadastre-se.';
      }
      
      toast({
        title: "Erro no login",
        description: errorMessage,
        variant: "destructive",
      });
    } else {
      setLoginAttempts(0); // Reset contador em caso de sucesso
      setConnectionError(false);
      monitorLoginAttempt(formData.email, true);
      storeCurrentVersion(); // Store version after successful login
      toast({
        title: "Login realizado com sucesso!",
        description: "Bem-vindo ao sistema de tarefas",
      });
    }
    
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('📱 Mobile Signup Debug: Iniciando processo de cadastro');
    console.log('📱 Form Data:', {
      name: formData.name,
      email: formData.email,
      role: formData.role,
      filial_id: formData.filial_id,
      hasPassword: !!formData.password
    });
    
    // Validate all signup fields
    const isNameValid = validateField('name', formData.name, validationRules.name);
    const isEmailValid = validateField('email', formData.email, validationRules.email);
    const isPasswordValid = validateField('password', formData.password, validationRules.password);
    
    console.log('📱 Validation Results:', {
      isNameValid: isNameValid.isValid,
      isEmailValid: isEmailValid.isValid,
      isPasswordValid: isPasswordValid.isValid,
      nameErrors: isNameValid.errors,
      emailErrors: isEmailValid.errors,
      passwordErrors: isPasswordValid.errors
    });
    
    if (!isNameValid.isValid || !isEmailValid.isValid || !isPasswordValid.isValid) {
      console.log('❌ Mobile Signup: Validação falhou');
      toast({
        title: "Dados inválidos",
        description: "Verifique os campos em vermelho",
        variant: "destructive",
      });
      return;
    }
    
    // Check required fields manually for mobile debugging
    if (!formData.name || !formData.email || !formData.password || !formData.role) {
      console.log('❌ Mobile Signup: Campos obrigatórios faltando', {
        name: !!formData.name,
        email: !!formData.email,
        password: !!formData.password,
        role: !!formData.role,
      });
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    setConnectionError(false);
    console.log('📱 Mobile Signup: Chamando função signUp...');

    try {
      const { error } = await signUp(formData.email, formData.password, {
        name: formData.name,
        role: formData.role,
      });
      
      console.log('📱 Mobile Signup Result:', { error: error?.message || 'success' });
      
      if (error) {
        console.error('❌ Mobile Signup Error:', error);
        
        // Check for connection errors first
        if (isConnectionError(error)) {
          setConnectionError(true);
          toast({
            title: "Serviço indisponível",
            description: getConnectionErrorMessage(error),
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        
        let errorMessage = "Erro no cadastro";
        
        if (error.message.includes('already_registered')) {
          errorMessage = "Email já cadastrado. Tente fazer login.";
        } else if (error.message.includes('weak_password')) {
          errorMessage = "Senha muito fraca. Use uma senha mais forte.";
        } else if (error.message.includes('invalid_email')) {
          errorMessage = "Email inválido. Verifique o formato do email.";
        } else if (error.message.includes('signup_disabled')) {
          errorMessage = "Cadastro temporariamente desabilitado. Tente novamente mais tarde.";
        } else {
          errorMessage = `Erro: ${error.message}`;
        }
        
        toast({
          title: "Erro no cadastro",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        console.log('✅ Mobile Signup: Cadastro realizado com sucesso');
        setConnectionError(false);
        storeCurrentVersion(); // Store version after successful signup
        toast({
          title: "Cadastro realizado com sucesso!",
          description: "Verifique seu email para confirmar a conta",
        });
        
        // Clear form on success
        setFormData({
          email: '',
          password: '',
          name: '',
          role: 'sales_consultant',
          filial_id: ''
        });
      }
    } catch (error: any) {
      console.error('💥 Mobile Signup: Erro crítico:', error);
      
      if (isConnectionError(error)) {
        setConnectionError(true);
        toast({
          title: "Serviço indisponível",
          description: getConnectionErrorMessage(error),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro crítico",
          description: "Erro interno do sistema. Tente novamente em alguns minutos.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
      console.log('📱 Mobile Signup: Processo finalizado');
    }
  };

  const handleForgotPassword = async () => {
    const isEmailValid = validateField('email', formData.email, validationRules.email);
    
    if (!isEmailValid.isValid) {
      toast({
        title: "Email inválido",
        description: "Digite um email válido para recuperar a senha",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    // Usar URL de produção para evitar redirecionamento para localhost
    const productionUrl = 'https://gvprzk.lovable.app';
    const redirectUrl = window.location.hostname === 'localhost' 
      ? `${productionUrl}/reset-password`
      : `${window.location.origin}/reset-password`;
    
    const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
      redirectTo: redirectUrl,
    });

    monitorPasswordReset(formData.email);

    if (error) {
      toast({
        title: "Erro ao enviar email",
        description: "Não foi possível enviar o email de recuperação",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para recuperar a senha",
      });
    }

    setLoading(false);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field errors when user starts typing
    if (hasErrors(field)) {
      // Validate on change for immediate feedback
      setTimeout(() => {
        if (field === 'email') {
          validateField(field, value, validationRules.email);
        } else if (field === 'password') {
          validateField(field, value, field === 'password' ? validationRules.password : { required: true });
        } else if (field === 'name') {
          validateField(field, value, validationRules.name);
        }
      }, 300);
    }
  };

  const handleRetryConnection = async () => {
    setIsRetrying(true);
    
    // Tentar 3 vezes com backoff exponencial
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Timeout de 15 segundos para cada tentativa
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const { error } = await supabase
          .from('filiais')
          .select('id')
          .limit(1)
          .abortSignal(controller.signal);
        
        clearTimeout(timeoutId);
        
        if (!error) {
          setConnectionError(false);
          toast({
            title: "Conexão restaurada",
            description: "O serviço está disponível novamente.",
          });
          await reloadFiliais();
          setIsRetrying(false);
          return;
        }
        
        // Se não é erro de conexão, sair do loop
        if (!isConnectionError(error)) {
          setConnectionError(false);
          await reloadFiliais();
          setIsRetrying(false);
          return;
        }
        
        // Esperar antes de tentar novamente (2s, 4s, 8s)
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, attempt - 1)));
        }
      } catch (error: any) {
        // Timeout ou erro de rede, tentar novamente
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, attempt - 1)));
        }
      }
    }
    
    // Todas as tentativas falharam
    toast({
      title: "Ainda indisponível",
      description: "O serviço continua indisponível. Tente novamente em alguns minutos.",
      variant: "destructive",
    });
    setIsRetrying(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-6">
        {/* Login Form */}
        <Card className="w-full max-w-md mx-auto lg:mx-0">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Cadastro GVP</CardTitle>
            {isAdminEmail && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDebug(!showDebug)}
                  className="text-xs"
                >
                  <Settings className="h-3 w-3 mr-1" />
                  {showDebug ? 'Ocultar' : 'Mostrar'} Debug
                </Button>
              </div>
            )}
          </CardHeader>
        <CardContent>
          {/* Connection Error Alert */}
          {connectionError && (
            <Alert variant="destructive" className="mb-4">
              <WifiOff className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>Serviço temporariamente indisponível.</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetryConnection}
                  disabled={isRetrying}
                  className="ml-2"
                >
                  {isRetrying ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    required
                    className={hasErrors('email') ? 'border-destructive' : ''}
                  />
                  {hasErrors('email') && (
                    <p className="text-sm text-destructive">
                      {getFieldErrors('email').join(', ')}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
                
                <Button type="submit" className="w-full" disabled={loading || isBlocked}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isBlocked ? `Bloqueado (${blockTimeLeft}s)` : 'Entrar'}
                </Button>
                
                {loginAttempts > 0 && !isBlocked && (
                  <div className="text-center text-sm text-amber-600 dark:text-amber-400">
                    Tentativas: {loginAttempts}/5
                  </div>
                )}
                
                <div className="flex justify-between items-center mt-4">
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={handleForgotPassword}
                    disabled={loading}
                  >
                    Esqueci minha senha
                  </button>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearLocalData}
                    className="text-xs"
                    disabled={loading}
                  >
                    <Trash className="h-3 w-3 mr-1" />
                    Limpar Cache
                  </Button>
                </div>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome *</Label>
                  <Input
                    id="signup-name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    required
                    placeholder="Digite seu nome completo"
                    className={hasErrors('name') ? 'border-destructive' : ''}
                    autoComplete="name"
                  />
                  {hasErrors('name') && (
                    <p className="text-sm text-destructive">
                      {getFieldErrors('name').join(', ')}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email *</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    required
                    placeholder="Digite seu email"
                    className={hasErrors('email') ? 'border-destructive' : ''}
                    autoComplete="email"
                  />
                  {hasErrors('email') && (
                    <p className="text-sm text-destructive">
                      {getFieldErrors('email').join(', ')}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha *</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showSignupPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      required
                      placeholder="Digite uma senha forte"
                      className={`pr-10 ${hasErrors('password') ? 'border-destructive' : ''}`}
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                    >
                      {showSignupPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <PasswordStrengthIndicator 
                    password={formData.password} 
                    className="mt-2"
                  />
                  {hasErrors('password') && (
                    <div className="text-xs text-destructive space-y-1">
                      {getFieldErrors('password').map((error, index) => (
                        <div key={index}>• {error}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-role">Cargo *</Label>
                  <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione seu cargo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales_consultant">Consultor de Vendas</SelectItem>
                      <SelectItem value="technical_consultant">Consultor Técnico</SelectItem>
                      <SelectItem value="rac">RAC</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                 {/* Filial será selecionada na próxima etapa (ProfileAutoCreator) */}
                 
                 <Button 
                   type="submit" 
                   className="w-full" 
                   disabled={loading || !formData.name || !formData.email || !formData.password || !formData.role}
                 >
                   {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                   Cadastrar
                 </Button>
                 
                 {/* Debug info for mobile */}
                 <div className="text-xs text-muted-foreground mt-2 p-2 bg-muted/20 rounded">
                   Status: Nome({formData.name ? '✓' : '✗'}) Email({formData.email ? '✓' : '✗'}) Senha({formData.password ? '✓' : '✗'}) Cargo({formData.role ? '✓' : '✗'})
                 </div>
              </form>
            </TabsContent>
          </Tabs>
          
          {/* Version Footer */}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-center text-muted-foreground">
              {formatVersion(versionInfo)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Debug Panel */}
      {showDebug && isAdminEmail && (
        <div className="w-full max-w-md mx-auto lg:mx-0">
          <SessionRefresh />
          
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">Ferramentas de Administrador</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="p-2 bg-muted rounded">
                <p className="font-medium">Informações da Versão:</p>
                <p className="text-muted-foreground mt-1">{formatDetailedVersion(versionInfo)}</p>
              </div>
              
              <div className="p-2 bg-muted rounded">
                <p className="font-medium">Acesso Administrativo:</p>
                <p className="text-muted-foreground mt-1">Você tem acesso às funcionalidades de administrador</p>
              </div>
              
              <div className="p-2 bg-muted rounded">
                <p className="font-medium">Problemas comuns:</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  <li>Use "Limpar Cache" se tiver erro de token</li>
                  <li>Use "Testar Autenticação" para diagnóstico</li>
                  <li>Sistema bloqueia por 5min após 5 tentativas</li>
                </ul>
              </div>
              
              {(loginAttempts > 0 || isBlocked) && (
                <div className="p-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded">
                  <p className="font-medium text-amber-800 dark:text-amber-200">Status de Segurança:</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {isBlocked 
                      ? `Conta bloqueada - ${blockTimeLeft}s restantes`
                      : `Tentativas de login: ${loginAttempts}/5`
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </div>
  );
};
