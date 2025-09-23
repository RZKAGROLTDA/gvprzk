import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnhancedSecurityMonitor } from "./useEnhancedSecurityMonitor";

interface SecureClientData {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  stage: string;
  session_type: string;
  workflow_status: string;
  session_date: string;
  voucher_date: string;
  gallery_date: string;
  preview_date: string;
  budget_date: string;
  return_date: string;
  archived: boolean;
  archive_reason: string;
  archived_at: string;
  attachments: string[];
  created_at: string;
  created_by: string;
  updated_at: string;
  access_level: string;
  is_contact_masked: boolean;
}

export const useSecureClientData = () => {
  const { monitorCustomerDataAccessWithAlert } = useEnhancedSecurityMonitor();

  return useQuery({
    queryKey: ["secure-client-data"],
    queryFn: async (): Promise<SecureClientData[]> => {
      // Use the secure function that masks sensitive data
      const { data, error } = await supabase
        .rpc('get_secure_clients_enhanced');

      if (error) {
        console.error('Error fetching secure client data:', error);
        throw error;
      }

      // Monitor client data access for security
      if (data && data.length > 0) {
        const sensitiveFields = ['email', 'phone', 'notes'];
        monitorCustomerDataAccessWithAlert('view', data.length, sensitiveFields);
      }

      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
};

export const useClientDataSecurity = () => {
  const { data: clientData } = useSecureClientData();
  
  const hasAnyMaskedData = clientData?.some(client => client.is_contact_masked) || false;
  const accessLevel = clientData?.[0]?.access_level || 'none';
  
  return {
    hasAnyMaskedData,
    accessLevel,
    totalClients: clientData?.length || 0,
    maskedClients: clientData?.filter(client => client.is_contact_masked).length || 0
  };
};