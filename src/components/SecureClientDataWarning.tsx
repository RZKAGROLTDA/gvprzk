import { AlertTriangle, Shield, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SecureClientDataWarningProps {
  isDataMasked: boolean;
  accessLevel: string;
  onRequestAccess?: () => void;
}

export const SecureClientDataWarning = ({ 
  isDataMasked, 
  accessLevel, 
  onRequestAccess 
}: SecureClientDataWarningProps) => {
  if (!isDataMasked) return null;

  return (
    <Alert className="border-warning/50 text-warning dark:border-warning [&>svg]:text-warning mb-4">
      <Shield className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        Client Contact Data Protection Active
        <Badge variant="outline" className="border-warning text-warning">
          {accessLevel}
        </Badge>
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>Client email, phone, and personal notes have been masked for privacy protection.</p>
        <div className="flex items-center gap-2 text-sm">
          <EyeOff className="h-3 w-3" />
          <span>Sensitive client contact information is protected based on your access level</span>
        </div>
        {onRequestAccess && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onRequestAccess}
            className="mt-2"
          >
            <Eye className="h-3 w-3 mr-1" />
            Request Full Access
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};