import { RentHistoryCard } from "./RentHistoryCard";
import { GuaranteesCard } from "./GuaranteesCard";
import { ExpensesCard } from "./ExpensesCard";

/**
 * Finances tab: monthly rent history, guarantees & deposits, and miscellaneous
 * expenses. Rent history spans full width; the other two sit side-by-side on wide
 * screens and stack on mobile.
 */
export function FinancesPanel({ propertyId }: { propertyId: number }) {
  return (
    <div className="flex flex-col gap-6">
      <RentHistoryCard propertyId={propertyId} />
      <div className="grid gap-6 xl:grid-cols-2">
        <GuaranteesCard propertyId={propertyId} />
        <ExpensesCard propertyId={propertyId} />
      </div>
    </div>
  );
}
