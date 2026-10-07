import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/utils';
import type { AnimalType, ReportStatus, Severity } from '@/types';

/** The columns the map needs. Deliberately excludes patient name, phone,
 *  address and any medical fields so no private data reaches the map. */
const MAP_REPORT_COLUMNS =
  'id, category, animal_type, incident_location, incident_latitude, incident_longitude, bite_date, status, severity, incident_barangay_id';

export interface MapFilters {
  dateFrom: string;
  dateTo: string;
  barangayId: string;
  severity: '' | Severity;
  animalType: '' | AnimalType;
  status: '' | ReportStatus;
}

export const EMPTY_FILTERS: MapFilters = {
  dateFrom: '',
  dateTo: '',
  barangayId: '',
  severity: '',
  animalType: '',
  status: '',
};

export interface MapReport {
  id: string;
  category: string;
  animal_type: AnimalType;
  incident_location: string;
  incident_latitude: number;
  incident_longitude: number;
  bite_date: string;
  status: ReportStatus;
  severity: Severity;
  incident_barangay_id: string | null;
}

/**
 * Loads bite reports that have coordinates, narrowed by the active filters.
 * Row Level Security on `bite_reports` decides which rows this user may see,
 * so a resident receives only their own reports while staff receive the wider
 * set they are entitled to. Refetches automatically when a report is added,
 * changed or removed.
 */
export function useMapReports(filters: MapFilters) {
  const [reports, setReports] = useState<MapReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReports = useCallback(async (): Promise<MapReport[]> => {
    let query = supabase
      .from('bite_reports')
      .select(MAP_REPORT_COLUMNS)
      .not('incident_latitude', 'is', null)
      .not('incident_longitude', 'is', null)
      .order('bite_date', { ascending: false });

    if (filters.dateFrom) query = query.gte('bite_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('bite_date', filters.dateTo);
    if (filters.barangayId) query = query.eq('incident_barangay_id', filters.barangayId);
    if (filters.severity) query = query.eq('severity', filters.severity);
    if (filters.animalType) query = query.eq('animal_type', filters.animalType);
    if (filters.status) query = query.eq('status', filters.status);

    const { data, error: err } = await query;
    if (err) throw err;
    return (data as MapReport[]) ?? [];
  }, [
    filters.dateFrom,
    filters.dateTo,
    filters.barangayId,
    filters.severity,
    filters.animalType,
    filters.status,
  ]);

  // Initial load and every filter change.
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchReports()
      .then((rows) => {
        if (!active) return;
        setReports(rows);
        setError('');
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, 'Failed to load bite reports'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchReports]);

  // Live updates. Any insert/update/delete triggers a refetch through the same
  // RLS-guarded query, so newly added reports appear without a page reload and
  // the user never sees a row they are not allowed to read.
  useEffect(() => {
    const channel = supabase
      .channel('map-bite-reports')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bite_reports' },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            fetchReports()
              .then((rows) => {
                setReports(rows);
                setError('');
              })
              .catch(() => {
                // A transient realtime-triggered failure keeps the last good
                // data on screen rather than blanking the map.
              });
          }, 400);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchReports]);

  return { reports, loading, error };
}
