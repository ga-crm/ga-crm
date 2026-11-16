import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { hasRole } from "../auth/access";
import { useMe } from "../auth/useMe";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Container,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Spinner,
  TableScroll,
  TabBar,
  Checkbox,
} from "../components/ui";
import { t } from "../i18n";
import { api, errorMessage } from "../lib/api";
import { keys, queries } from "../lib/queries";
import { toast } from "../lib/toast";
import { useUrlState } from "../lib/useUrlState";
import { ProgramsTab } from "../components/ProgramsTab";
import { LEAD_OPTION_KINDS } from "../lib/types";
import { BulkOptionsDialog } from "../components/BulkOptionsDialog";
import type { LeadOption, LeadOptionKind } from "../lib/types";

type Patch = Partial<
  Pick<LeadOption, "label" | "isOpportunity" | "isFinal" | "active">
>;

/** The toast that says what a change did (UI rules: name the thing, never a bare "saved"). */
function announce(option: LeadOption, patch: Patch) {
  if (patch.label !== undefined)
    toast.success(t("toast.optionRenamed", { label: patch.label }));
  else if (patch.active === false)
    toast.info(
      t("toast.optionHidden", { label: option.label }),
      t("toast.optionHiddenDetail"),
    );
  else if (patch.active === true)
    toast.success(t("toast.optionShown", { label: option.label }));
  else toast.success(t("toast.optionFlagged", { label: option.label }));
}

/** OPT-3: the label is edited in place and saved when the field is left or Enter is pressed. */
function LabelInput({
  option,
  disabled,
  onSave,
}: {
  option: LeadOption;
  disabled: boolean;
  onSave: (label: string) => void;
}) {
  const [value, setValue] = useState(option.label);
  const commit = () => {
    const next = value.trim();
    if (!next || next === option.label) setValue(option.label);
    else onSave(next);
  };
  return (
    <Input
      aria-label={t("catalog.renameLabel", { label: option.label })}
      placeholder={t("placeholder.optionLabel")}
      value={value}
      maxLength={60}
      disabled={disabled}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setValue(option.label);
      }}
    />
  );
}

/** Section 16.8: Danh mục. GA_HEAD edits (PERM-3); Admin sees it read-only. */
export function CatalogPage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const url = useUrlState();
  // Section 4.3: lead lists are for GA_HEAD (edit) and Admin (read); programmes for anyone who opens this
  const seesLeadLists = hasRole(me, "GA_HEAD") || hasRole(me, "ADMIN");
  const tabs = [
    ...(seesLeadLists ? LEAD_OPTION_KINDS : []),
    "programs",
  ] as const;
  const tab = url.oneOf("kind", tabs) || tabs[0];
  const kind = (tab === "programs" ? "interest" : tab) as LeadOptionKind;
  const canEdit = hasRole(me, "GA_HEAD");
  const [newLabel, setNewLabel] = useState("");
  const [deleting, setDeleting] = useState<LeadOption | null>(null);

  const catalogue = useQuery(queries.leadOptions());
  const rows = (catalogue.data?.items ?? []).filter(
    (item) => item.kind === kind,
  );
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: keys.leadOptions });

  const add = useMutation({
    mutationFn: (label: string) =>
      api.post<LeadOption>("/lead-options", { kind, label }),
    onSuccess: async (option) => {
      await refresh();
      setNewLabel("");
      toast.success(t("toast.optionAdded", { label: option.label }));
    },
  });
  const update = useMutation({
    mutationFn: ({ option, patch }: { option: LeadOption; patch: Patch }) =>
      api.patch<LeadOption>(`/lead-options/${option.id}`, patch),
    onSuccess: (_, { option, patch }) => announce(option, patch),
    onError: (error) =>
      toast.error(t("toast.optionFailed"), errorMessage(error)),
    // A rename that failed must show the stored label again
    onSettled: () => refresh(),
  });
  const remove = useMutation({
    mutationFn: (option: LeadOption) =>
      api.delete(`/lead-options/${option.id}`),
    onSuccess: async (_, option) => {
      await refresh();
      setDeleting(null);
      toast.success(t("toast.optionDeleted", { label: option.label }));
    },
  });

  /** Swaps places with the neighbour, so the GA's order shows in every picker (OPT-3). */
  const reorder = useMutation({
    mutationFn: async ({
      option,
      other,
    }: {
      option: LeadOption;
      other: LeadOption;
    }) => {
      // Equal positions (older data) still end up in the requested order
      const [to, from] =
        option.sortOrder === other.sortOrder
          ? [
              other.sortOrder +
                (rows.indexOf(other) < rows.indexOf(option) ? -1 : 1),
              option.sortOrder,
            ]
          : [other.sortOrder, option.sortOrder];
      await api.patch(`/lead-options/${option.id}`, {
        sortOrder: Math.max(0, to),
      });
      await api.patch(`/lead-options/${other.id}`, { sortOrder: from });
    },
    onSuccess: (_, { option }) =>
      toast.info(t("toast.optionMoved", { label: option.label })),
    onError: (error) =>
      toast.error(t("toast.optionFailed"), errorMessage(error)),
    onSettled: () => refresh(),
  });
  const move = (index: number, step: -1 | 1) => {
    const other = rows[index + step];
    if (other) reorder.mutate({ option: rows[index], other });
  };

  const interest = kind === "interest";
  const busy = update.isPending || reorder.isPending;

  return (
    <>
      <PageHeader title={t("catalog.title")} subtitle={t("catalog.subtitle")} />
      <Container className="flex-none">
        <TabBar
          label={t("catalog.title")}
          value={tab}
          onValueChange={(value) => {
            setNewLabel("");
            add.reset();
            url.set({ kind: value === tabs[0] ? null : value });
          }}
          items={tabs.map((item) => ({ value: item, label: t(`catalog.kind.${item}`) }))}
        />
      </Container>
      {tab === "programs" ? (
        <ProgramsTab />
      ) : (
        <>
          <Container className="flex-none">
            <p className="pb-3 text-caption text-ink-meta">
              {t(`catalog.help.${kind}`)}
            </p>
            {!canEdit && (
              <div className="pb-3">
                <Notice>{t("catalog.readOnly")}</Notice>
              </div>
            )}
            {canEdit && (
              <form
                className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-start"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (newLabel.trim()) add.mutate(newLabel.trim());
                }}
              >
                <div className="sm:w-80">
                  <Input
                    aria-label={t("catalog.newLabel")}
                    placeholder={t("catalog.newLabel")}
                    value={newLabel}
                    maxLength={60}
                    onChange={(event) => {
                      setNewLabel(event.target.value);
                      if (add.isError) add.reset();
                    }}
                    aria-invalid={add.isError}
                  />
                  <p
                    role={add.isError ? "alert" : undefined}
                    className="mt-0.5 min-h-[21px] text-caption text-alert"
                  >
                    {add.isError ? errorMessage(add.error) : ""}
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={add.isPending || !newLabel.trim()}
                >
                  {t("catalog.add")}
                </Button>
                {/* Open question D: a whole list at once */}
                <Button
                  variant="secondary"
                  onClick={() => url.set({ bulk: "1" }, { push: true })}
                >
                  {t("catalog.addMany")}
                </Button>
              </form>
            )}
          </Container>

          <Card>
            {catalogue.isPending && <Spinner />}
            {catalogue.isError && (
              <Alert className="m-4">{errorMessage(catalogue.error)}</Alert>
            )}
            {catalogue.data && rows.length === 0 && (
              <EmptyState>{t(kind === "source" ? "catalog.empty" : "catalog.emptyList")}</EmptyState>
            )}
            {rows.length > 0 && (
              <TableScroll>
                <table className="data-table min-w-[720px] table-fixed">
                  <colgroup>
                    <col />
                    <col className="w-[150px]" />
                    {interest && <col className="w-[140px]" />}
                    {interest && <col className="w-[150px]" />}
                    <col className="w-[110px]" />
                    <col className="w-[90px]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t("catalog.label")}</th>
                      <th className="text-center">{t("catalog.active")}</th>
                      {interest && (
                        <th className="text-center">
                          {t("catalog.opportunity")}
                        </th>
                      )}
                      {interest && (
                        <th className="text-center">{t("catalog.final")}</th>
                      )}
                      <th className="text-center">{t("catalog.order")}</th>
                      <th className="col-actions">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((option, index) => (
                      <tr key={option.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <LabelInput
                                key={option.label}
                                option={option}
                                disabled={!canEdit}
                                onSave={(label) =>
                                  update.mutate({ option, patch: { label } })
                                }
                              />
                            </div>
                            {option.builtIn && (
                              <Badge tone="muted">{t("catalog.builtIn")}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="text-center">
                          <Checkbox
                            aria-label={`${t("catalog.active")}: ${option.label}`}
                            checked={option.active}
                            disabled={!canEdit || busy}
                            onChange={(checked) =>
                              update.mutate({
                                option,
                                patch: { active: checked },
                              })
                            }
                          />
                        </td>
                        {interest && (
                          <td className="text-center">
                            <Checkbox
                              aria-label={`${t("catalog.opportunity")}: ${option.label}`}
                              checked={option.isOpportunity}
                              disabled={!canEdit || busy}
                              onChange={(checked) =>
                                update.mutate({
                                  option,
                                  patch: {
                                    isOpportunity: checked,
                                  },
                                })
                              }
                            />
                          </td>
                        )}
                        {interest && (
                          <td className="text-center">
                            <Checkbox
                              aria-label={`${t("catalog.final")}: ${option.label}`}
                              checked={option.isFinal}
                              disabled={!canEdit || busy}
                              onChange={(checked) =>
                                update.mutate({
                                  option,
                                  patch: { isFinal: checked },
                                })
                              }
                            />
                          </td>
                        )}
                        <td>
                          <span className="flex justify-center gap-1">
                            <Button
                              variant="ghost"
                              aria-label={t("catalog.moveUp", {
                                label: option.label,
                              })}
                              title={t("catalog.moveUp", {
                                label: option.label,
                              })}
                              disabled={!canEdit || busy || index === 0}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowUp size={16} aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              aria-label={t("catalog.moveDown", {
                                label: option.label,
                              })}
                              title={t("catalog.moveDown", {
                                label: option.label,
                              })}
                              disabled={
                                !canEdit || busy || index === rows.length - 1
                              }
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDown size={16} aria-hidden />
                            </Button>
                          </span>
                        </td>
                        <td className="col-actions">
                          {/* OPT-5: only values the GA added can go; the API also refuses values in use */}
                          {canEdit && !option.builtIn && (
                            <Button
                              variant="ghost"
                              onClick={() => setDeleting(option)}
                            >
                              {t("catalog.delete")}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </Card>

          <ConfirmDialog
            message={
              deleting
                ? t("catalog.confirmDelete", { label: deleting.label })
                : null
            }
            danger
            pending={remove.isPending}
            error={remove.isError ? errorMessage(remove.error) : undefined}
            onConfirm={() => deleting && remove.mutate(deleting)}
            onClose={() => {
              setDeleting(null);
              remove.reset();
            }}
          />
        </>
      )}
      {canEdit && tab !== "programs" && (
        <BulkOptionsDialog
          kind={kind}
          existing={rows.map((option) => option.label)}
          open={url.get("bulk") === "1"}
          onClose={() => url.set({ bulk: null })}
        />
      )}
    </>
  );
}
