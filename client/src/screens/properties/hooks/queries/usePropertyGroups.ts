import { useQuery } from "@tanstack/react-query";
import { propertyBillsApi } from "@/api/propertyBillsApi";
import { propertyGuaranteesApi } from "@/api/propertyGuaranteesApi";
import { propertyExpensesApi } from "@/api/propertyExpensesApi";
import { propertyInspectionsApi } from "@/api/propertyInspectionsApi";
import { paymentsApi } from "@/api/paymentsApi";

/** Query key for a property-scoped sub-resource list. */
export function propertyGroupKey(propertyId: number | undefined, group: string) {
  return ["properties", propertyId, group] as const;
}

/**
 * Read hooks for the property-detail data groups. Each is enabled only when a
 * propertyId is known and (because Radix Tabs unmount inactive panels) fires
 * lazily when its tab is first opened. `enabled` also lets callers gate on a
 * GROUP_READY flag so a not-yet-built group never hits the network.
 */
export function usePropertyBills(propertyId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: propertyGroupKey(propertyId, "utility-bills"),
    queryFn: () => propertyBillsApi.list(propertyId as number),
    enabled: propertyId !== undefined && enabled,
  });
}

export function usePropertyGuarantees(propertyId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: propertyGroupKey(propertyId, "guarantees"),
    queryFn: () => propertyGuaranteesApi.list(propertyId as number),
    enabled: propertyId !== undefined && enabled,
  });
}

export function usePropertyExpenses(propertyId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: propertyGroupKey(propertyId, "expenses"),
    queryFn: () => propertyExpensesApi.list(propertyId as number),
    enabled: propertyId !== undefined && enabled,
  });
}

export function usePropertyInspections(propertyId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: propertyGroupKey(propertyId, "inspections"),
    queryFn: () => propertyInspectionsApi.list(propertyId as number),
    enabled: propertyId !== undefined && enabled,
  });
}

export function usePropertyRentHistory(propertyId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: propertyGroupKey(propertyId, "payments"),
    queryFn: () => paymentsApi.listByProperty(propertyId as number),
    enabled: propertyId !== undefined && enabled,
  });
}
