import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../context/AppStateContext';
import { fetchPricingRules, fetchInvoices, fetchTransactions, type PricingRule, type Invoice, type Transaction } from '../services/financialService';

export function useTransactions(enabled = true) {
  const { effectiveClubId } = useAppState();
  return useQuery<Transaction[]>({
    queryKey: ['transactions', effectiveClubId],
    queryFn: () => fetchTransactions(effectiveClubId),
    enabled: enabled && !!effectiveClubId,
    staleTime: 60_000,
  });
}

export function usePricingRules(enabled = true) {
  const { effectiveClubId } = useAppState();
  return useQuery<PricingRule[]>({
    queryKey: ['pricing-rules', effectiveClubId],
    queryFn: () => fetchPricingRules(effectiveClubId),
    enabled: enabled && !!effectiveClubId,
    staleTime: 2 * 60_000,
  });
}

export function useInvoices(enabled = true) {
  const { effectiveClubId } = useAppState();
  return useQuery<Invoice[]>({
    queryKey: ['invoices', effectiveClubId],
    queryFn: () => fetchInvoices(effectiveClubId),
    enabled: enabled && !!effectiveClubId,
    staleTime: 2 * 60_000,
  });
}
