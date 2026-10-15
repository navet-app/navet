import { Button } from '@navet/app/components/primitives';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@navet/app/components/ui/alert-dialog';
import { useI18n, useTheme } from '@navet/app/hooks';
import { loadChoreBackup } from '@navet/app/services/chore-workspace.service';
import {
  type ChoreInterchangeDocument,
  convertChoreOpsChores,
  convertHomeAssistantTodoItems,
  createChoreConfigurationDocument,
  parseChoreInterchangeDocument,
} from '@navet/core/chore-interchange';
import type { ChoreParticipant } from '@navet/core/chores';
import { Download, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useChoreWorkspaceStore } from '../chore-workspace-store';

function downloadDocument(value: ChoreInterchangeDocument, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ChoreDataRecovery({
  managerActorId,
  participants,
  onImportComplete,
}: {
  managerActorId: string;
  participants: ChoreParticipant[];
  onImportComplete: () => void;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const data = useChoreWorkspaceStore((state) => state.data);
  const exportDescriptionId = useId();
  const restoreBackup = useChoreWorkspaceStore((state) => state.restoreBackup);
  const deleteAll = useChoreWorkspaceStore((state) => state.deleteAll);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<ReturnType<
    typeof parseChoreInterchangeDocument
  > | null>(null);
  const importInFlightRef = useRef(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const downloadBackup = async () => {
    setFeedback(null);
    const result = await loadChoreBackup();
    if (!result.value) {
      setFeedback(t('household.data.exportFailed'));
      return;
    }
    downloadDocument(result.value, `navet-chores-${new Date().toISOString().slice(0, 10)}.json`);
    setFeedback(t('household.data.exported'));
  };

  const exportChores = () => {
    setFeedback(null);
    if (!data) return;
    try {
      const document = createChoreConfigurationDocument({ workspace: data });
      downloadDocument(
        document,
        `navet-chores-configuration-${document.exportedAt.slice(0, 10)}.json`
      );
      setFeedback(t('household.data.configurationExported'));
    } catch {
      setFeedback(t('household.data.configurationExportFailed'));
    }
  };

  const readBackup = async (file: File | undefined) => {
    if (!file) return;
    setFeedback(null);
    setImportError(null);
    try {
      const value: unknown = JSON.parse(await file.text());
      try {
        setPendingImport(parseChoreInterchangeDocument(value));
        return;
      } catch {
        // Continue into the two documented legacy import shapes.
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      const record = value as Record<string, unknown>;
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const participant =
        participants.find((item) => item.id === managerActorId) ?? participants[0];
      if (!participant) throw new Error();
      if (
        Array.isArray(record.items) &&
        record.items.every(
          (item) =>
            item &&
            typeof item === 'object' &&
            typeof (item as Record<string, unknown>).summary === 'string'
        )
      ) {
        setPendingImport(
          convertHomeAssistantTodoItems({
            items: record.items as Parameters<typeof convertHomeAssistantTodoItems>[0]['items'],
            participant,
            timeZone,
          })
        );
        return;
      }
      if (
        Array.isArray(record.chores) &&
        record.chores.every(
          (chore) =>
            chore &&
            typeof chore === 'object' &&
            typeof (chore as Record<string, unknown>).name === 'string'
        )
      ) {
        setPendingImport(
          convertChoreOpsChores({
            chores: record.chores as Parameters<typeof convertChoreOpsChores>[0]['chores'],
            participants,
            timeZone,
          })
        );
        return;
      }
      throw new Error();
    } catch {
      setFeedback(t('household.data.invalidBackup'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const importBackup = async (mode: 'merge' | 'replace') => {
    if (!pendingImport || importInFlightRef.current) return;
    importInFlightRef.current = true;
    setIsImporting(true);
    setImportError(null);
    try {
      const saved = await restoreBackup({
        actorParticipantId: managerActorId,
        document: pendingImport,
        mode,
      });
      if (!saved) {
        setImportError(t('household.data.importFailed'));
        return;
      }
      setPendingImport(null);
      setFeedback(t('household.data.imported'));
      onImportComplete();
    } catch {
      setImportError(t('household.data.importFailed'));
    } finally {
      importInFlightRef.current = false;
      setIsImporting(false);
    }
  };

  return (
    <>
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            size="compact"
            variant="secondary"
            className="min-h-10"
            leading={<Download className="h-4 w-4 shrink-0" />}
            disabled={!data}
            aria-describedby={exportDescriptionId}
            onClick={exportChores}
          >
            {t('household.data.exportConfiguration')}
          </Button>
          <Button
            size="compact"
            variant="secondary"
            className="min-h-10"
            leading={<Download className="h-4 w-4 shrink-0" />}
            onClick={() => void downloadBackup()}
          >
            {t('household.data.export')}
          </Button>
          <Button
            size="compact"
            variant="secondary"
            className="min-h-10"
            leading={<Upload className="h-4 w-4 shrink-0" />}
            onClick={() => fileInputRef.current?.click()}
          >
            {t('household.data.import')}
          </Button>
          <Button
            size="compact"
            variant="destructive"
            className="min-h-10 sm:ml-auto"
            onClick={() => setResetOpen(true)}
          >
            {t('household.data.reset')}
          </Button>
        </div>
        <p id={exportDescriptionId} className={`mt-3 text-xs ${surface.textSecondary}`}>
          {t('household.data.configurationDescription')}
        </p>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          aria-label={t('household.data.import')}
          onChange={(event) => void readBackup(event.target.files?.[0])}
        />
        {feedback ? (
          <p
            className={`mt-3 rounded-xl px-3 py-2 text-xs ${surface.subtleBg} ${surface.textSecondary}`}
            role="status"
          >
            {feedback}
          </p>
        ) : null}
      </div>

      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open && !importInFlightRef.current) {
            setPendingImport(null);
            setImportError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('household.data.importTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('household.data.importDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          {importError ? (
            <p role="alert" className={`text-sm ${surface.textPrimary}`}>
              {importError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10" disabled={isImporting}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <Button
              variant="secondary"
              className="min-h-10"
              disabled={isImporting}
              onClick={() => void importBackup('merge')}
            >
              {t('household.data.merge')}
            </Button>
            <Button
              className="min-h-10"
              disabled={isImporting}
              onClick={() => void importBackup('replace')}
            >
              {t('household.data.replace')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('household.data.resetTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('household.data.resetDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10">{t('common.cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              className="min-h-10"
              onClick={async () => {
                const saved = await deleteAll(managerActorId);
                setResetOpen(false);
                if (saved) setFeedback(t('household.data.resetDone'));
              }}
            >
              {t('household.data.reset')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
