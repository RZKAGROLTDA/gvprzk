import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Rota "/" — todos os usuários autenticados/aprovados/ativos vão para /meu-dia.
 * Sem regra de primeiro acesso e sem depender de cargo.
 */
export const MyDayLanding: React.FC = () => <Navigate to="/meu-dia" replace />;
