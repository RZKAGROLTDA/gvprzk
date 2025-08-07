export interface Task {
  id: string;
  name: string;
  responsible: string;
  client: string;
  property: string;
  filial?: string;
  taskType: 'prospection';
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
  salesValue?: number;
  salesConfirmed?: boolean;
  familyProduct?: string;
  equipmentQuantity?: number;
  propertyHectares?: number;
}

export interface ProductType {
  id: string;
  name: string;
  category: 'tires' | 'lubricants' | 'oils' | 'greases' | 'batteries' | 'other';
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