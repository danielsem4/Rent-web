import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pencil, Users, UserRound, Banknote, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/common/components/detail/StatTile";
import type { IProperty } from "@/common/types/property";
import { OccupancyBar } from "./Occupancy";

/**
 * Sticky hero for the property detail dashboard: title, headline stat tiles,
 * occupancy bar, and a manager-only Edit action. The negative margins cancel
 * the layout `p-6` so the sticky bar spans the content width. RTL-safe.
 */
export function PropertyHeader({
  property,
  canWrite,
}: {
  property: IProperty;
  canWrite: boolean;
}) {
  const { t, i18n } = useTranslation();

  return (
    <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 -mx-6 -mt-6 flex flex-col gap-5 border-b px-6 pt-6 pb-4 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            {property.city}, {property.address}
          </h1>
        </div>
        {canWrite && (
          <Button asChild size="sm">
            <Link to={`/properties/${property.id}/edit`}>
              <Pencil className="size-4" />
              {t("properties.edit")}
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={<DoorOpen className="size-3.5" />}
          label={t("properties.rooms")}
          value={property.rooms ?? "—"}
        />
        <StatTile
          icon={<Users className="size-3.5" />}
          label={t("properties.total")}
          value={property.total}
        />
        <StatTile
          icon={<UserRound className="size-3.5" />}
          label={t("properties.maxCapacity")}
          value={property.maxCapacity}
        />
        <StatTile
          icon={<Banknote className="size-3.5" />}
          label={t("properties.rent")}
          value={property.monthlyRent.toLocaleString(i18n.language)}
        />
      </div>

      <OccupancyBar total={property.total} maxCapacity={property.maxCapacity} />
    </div>
  );
}
