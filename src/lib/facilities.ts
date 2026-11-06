import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/utils';
import { isValidLatLng } from '@/lib/geo';
import type { FacilityVerificationStatus, HealthcareFacility } from '@/types';

/**
 * A facility as the map needs it: coordinates already validated, the barangay
 * name resolved to a plain string, and the private/database-only columns left
 * behind. Only public facility information is carried here.
 */
export interface MapFacility {
  id: string;
  name: string;
  type: string;
  address: string;
  barangayName: string;
  phone: string;
  operatingHours: string;
  services: string[];
  latitude: number;
  longitude: number;
  isAbtc: boolean;
  verification: FacilityVerificationStatus;
  source: string;
}

const FACILITY_COLUMNS =
  'id, name, type, address, latitude, longitude, phone, operating_hours, services, ' +
  'is_active, is_abtc, verification_status, source, barangay:barangays(name)';

/** Drops facilities without a usable coordinate and flattens the join. */
function toMapFacility(row: HealthcareFacility): MapFacility | null {
  if (!isValidLatLng(row.latitude, row.longitude)) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    address: row.address ?? '',
    barangayName: row.barangay?.name ?? '',
    phone: row.phone ?? '',
    operatingHours: row.operating_hours ?? '',
    services: Array.isArray(row.services) ? row.services : [],
    latitude: row.latitude,
    longitude: row.longitude,
    isAbtc: row.is_abtc === true,
    verification: row.verification_status ?? 'unverified',
    source: row.source ?? '',
  };
}

/**
 * Loads the active healthcare facility directory and keeps it in step with the
 * database: any insert, edit or deactivation made by an administrator appears on
 * the map without a rebuild or reload. RLS decides which rows are readable, so a
 * resident only ever receives active, public facilities.
 */
export function useMapFacilities() {
  const [facilities, setFacilities] = useState<MapFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFacilities = useCallback(async (): Promise<MapFacility[]> => {
    const { data, error: err } = await supabase
      .from('healthcare_facilities')
      .select(FACILITY_COLUMNS)
      .eq('is_active', true)
      .order('name');
    if (err) throw err;
    return ((data as unknown as HealthcareFacility[]) ?? [])
      .map(toMapFacility)
      .filter((f): f is MapFacility => f !== null);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchFacilities()
      .then((rows) => {
        if (!active) return;
        setFacilities(rows);
        setError('');
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, 'Failed to load healthcare facilities'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchFacilities]);

  useEffect(() => {
    const channel = supabase
      .channel('map-facilities')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'healthcare_facilities' },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            fetchFacilities()
              .then((rows) => {
                setFacilities(rows);
                setError('');
              })
              .catch(() => {
                // Keep the last good directory on screen rather than blanking it.
              });
          }, 400);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchFacilities]);

  return { facilities, loading, error };
}

/** Free-text match across name, barangay, address and category label. */
export function facilityMatchesQuery(
  facility: MapFacility,
  query: string,
  typeLabel: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    facility.name.toLowerCase().includes(q) ||
    facility.barangayName.toLowerCase().includes(q) ||
    facility.address.toLowerCase().includes(q) ||
    typeLabel.toLowerCase().includes(q) ||
    (facility.isAbtc && 'animal bite treatment abtc'.includes(q))
  );
}
