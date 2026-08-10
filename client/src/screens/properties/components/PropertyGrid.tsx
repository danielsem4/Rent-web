import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PaymentBadge } from "./PaymentBadge";
import { TicketIndicator } from "./TicketIndicator";
import { formatDate, formatOccupancy, paymentStatus } from "../lib/indicators";
import type { IProperty } from "@/common/types/property";

interface PropertyGridProps {
  properties: IProperty[];
  onEdit: (property: IProperty) => void;
  onDelete: (property: IProperty) => void;
}

export function PropertyGrid({ properties, onEdit, onDelete }: PropertyGridProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("properties.colCity")}</TableHead>
            <TableHead>{t("properties.colAddress")}</TableHead>
            <TableHead>{t("properties.colOccupancy")}</TableHead>
            <TableHead>{t("properties.colPayment")}</TableHead>
            <TableHead>{t("properties.colTickets")}</TableHead>
            <TableHead>{t("properties.colContractEnd")}</TableHead>
            <TableHead className="text-end">{t("properties.colRent")}</TableHead>
            <TableHead className="w-12 text-end">{t("properties.colActions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {properties.map((p) => (
            <TableRow
              key={p.id}
              className="cursor-pointer"
              onClick={() => void navigate(`/properties/${p.id}`)}
            >
              <TableCell className="font-medium">{p.city}</TableCell>
              <TableCell>{p.address}</TableCell>
              {/* occupied is 0 until the Tenants slice; tickets 0 and payment "future" likewise. */}
              <TableCell className="tabular-nums">{formatOccupancy(0, p.capacity)}</TableCell>
              <TableCell>
                <PaymentBadge status={paymentStatus()} />
              </TableCell>
              <TableCell>
                <TicketIndicator count={0} />
              </TableCell>
              <TableCell>{formatDate(p.contractEnd) ?? t("properties.notProvided")}</TableCell>
              <TableCell className="text-end tabular-nums">{p.monthlyRent.toLocaleString()}</TableCell>
              <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t("properties.colActions")}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void navigate(`/properties/${p.id}`)}>
                      <Eye className="size-4" />
                      {t("properties.view")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(p)}>
                      <Pencil className="size-4" />
                      {t("properties.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(p)}
                    >
                      <Trash2 className="size-4" />
                      {t("properties.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
