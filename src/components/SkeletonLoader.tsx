import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface SkeletonLoaderProps {
  type?: 'dashboard' | 'table' | 'chart' | 'default';
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ type = 'default' }) => {
  switch (type) {
    case 'dashboard':
      return (
        <div className="space-y-6">
          {/* Header Skeleton */}
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-8 w-32" />
          </div>

          {/* Filters Skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Stats Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Chart Skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      );

    case 'table':
      return (
        <div className="space-y-4">
          {/* Table Header */}
          <div className="flex justify-between items-center">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
          
          {/* Table Content */}
          <Card>
            <CardContent className="p-0">
              <div className="space-y-3 p-4">
                {/* Table Headers */}
                <div className="grid grid-cols-6 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
                
                {/* Table Rows */}
                {Array.from({ length: 8 }).map((_, rowIndex) => (
                  <div key={rowIndex} className="grid grid-cols-6 gap-4">
                    {Array.from({ length: 6 }).map((_, colIndex) => (
                      <Skeleton key={colIndex} className="h-4 w-full" />
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      );

    case 'chart':
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Chart Legend */}
                <div className="flex space-x-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
                
                {/* Chart Area */}
                <Skeleton className="h-80 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      );

    default:
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        </div>
      );
  }
};

export const DashboardSkeleton = () => <SkeletonLoader type="dashboard" />;
export const TableSkeleton = () => <SkeletonLoader type="table" />;
export const ChartSkeleton = () => <SkeletonLoader type="chart" />;