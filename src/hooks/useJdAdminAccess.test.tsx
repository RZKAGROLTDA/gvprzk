import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJdAdminAccess } from './useJdAdminAccess';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  user: { id: 'admin-manager-user' } as { id: string } | null,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useJdAdminAccess(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
};

describe('JD administrator access', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.user = { id: 'admin-manager-user' };
  });

  it('recognizes the server-confirmed administrator regardless of legacy profile role', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    expect(mocks.rpc).toHaveBeenCalledWith('has_role', {
      _user_id: 'admin-manager-user', _role: 'admin',
    });
  });

  it('does not grant JD access to a non-administrator', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const { result } = setup();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(result.current.isAdmin).toBe(false);
  });

  it('does not grant JD access while server authorization is pending', () => {
    mocks.rpc.mockReturnValue(new Promise(() => {}));
    const { result } = setup();
    expect(result.current.isAdmin).toBe(false);
  });

  it('does not query or grant access without a session', () => {
    mocks.user = null;
    const { result } = setup();
    expect(result.current.isAdmin).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});