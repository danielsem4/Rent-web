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
import type { ICompany } from "@/common/types/company";

interface CompanyGridProps {
  companies: ICompany[];
  onEdit: (company: ICompany) => void;
  onDelete: (company: ICompany) => void;
}

export function CompanyGrid({ companies, onEdit, onDelete }: CompanyGridProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("companies.colName")}</TableHead>
            <TableHead>{t("companies.colManager")}</TableHead>
            <TableHead>{t("companies.colCreated")}</TableHead>
            <TableHead className="w-12 text-end">{t("companies.colActions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((c) => (
            <TableRow
              key={c.id}
              className="cursor-pointer"
              onClick={() => void navigate(`/companies/${c.id}`)}
            >
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell>
                {c.manager ? c.manager.name : t("companies.noManager")}
              </TableCell>
              <TableCell>{new Date(c.createdAt).toLocaleDateString()}</TableCell>
              <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t("companies.colActions")}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void navigate(`/companies/${c.id}`)}>
                      <Eye className="size-4" />
                      {t("companies.view")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(c)}>
                      <Pencil className="size-4" />
                      {t("companies.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(c)}
                    >
                      <Trash2 className="size-4" />
                      {t("companies.delete")}
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
