export interface Task {
  id: string;
  name: string;
  responsible: string;
  client: string;
  clientCode?: string;
  property: string;
  cpf?: string;
  email?: string;
  phone?: string;
  function?: string;
  functionOther?: string;
  filial?: string;
  taskType: 'prospection' | 'ligacao' | 'checklist';
  checklist: ProductType[];
  startDate: Date;
  endDate: Date;
  startTime: string;
  endTime: string;
  observations: string;
  priority: 'low' | 'medium' | 'high';
  reminders: Reminder[];
  photos: string[];
  documents: string[];
  checkInLocation?: {
    lat: number;
    lng: number;
    timestamp: Date;
  };
  initialKm: number;
  finalKm: number;
  status: 'pending' | 'in_progress' | 'completed' | 'closed';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isProspect: boolean;
  prospectNotes?: string;
  prospectItems?: ProductType[];
  salesValue?: number | string; // Allow string for masked values like ">10k"
  salesConfirmed?: boolean;
  salesType?: 'ganho' | 'parcial' | 'perdido';
  partialSalesValue?: number; // Calculated partial sales value from database
  familyProduct?: string;
  equipmentQuantity?: number;
  propertyHectares?: number;
  equipmentList?: {id: string, familyProduct: string, quantity: number}[];
  // Security metadata
  isMasked?: boolean; // Indicates if customer data is masked for security
}

export interface ProductType {
  id: string;
  name: string;
  category: 'tires' | 'lubricants' | 'oils' | 'greases' | 'batteries' | 'parts' | 'services' | 'other';
  selected: boolean;
  quantity?: number;
  price?: number;
  observations?: string;
  photos?: string[];
}

export interface Reminder {
  id: string;
  title: string;
  description: string;
  date: Date;
  time: string;
  completed: boolean;
}

export interface TaskStats {
  totalVisits: number;
  completedVisits: number;
  prospects: number;
  salesValue: number;
  conversionRate: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'rac' | 'consultant';
  avatar?: string;
}