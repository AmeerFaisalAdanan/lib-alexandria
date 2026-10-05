'use client';

import { useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminGate, AdminResource, BackToSettings } from '@/components/admin/admin-gate';
import { PageContainer, PageHeader } from '@/components/page';
import { useT, type Dictionary } from '@/i18n';
import { api } from '@/lib/api';
import { useAdminResource } from '@/lib/use-admin';
import { cn } from '@/lib/utils';
import type { AuditEvent, ServiceStatus, SystemStatus } from '@/types/library';

const dot: Record<ServiceStatus, string> = {
  healthy: 'bg-success',
  configured: 'bg-info',
  unavailable: 'bg-destructive',
  not_configured: 'bg-muted-foreground/50',
};

/** Translates a known word, and shows an unknown one as it is (the server may add values before the UI does). */
const word = (table: Record<string, string>, key: string) => table[key] ?? key;

function Section({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function auditTarget(e: AuditEvent) {
  const m = e.metadata ?? {};
  return typeof m.email === 'string' ? m.email : typeof m.title === 'string' ? m.title : e.targetId;
}

function Environment({ env, t }: { env: SystemStatus['environment']; t: Dictionary['admin'] }) {
  const rows: [string, string][] = [
    [t.environmentLabels.env, word(t.environmentValues, env.env)],
    [t.environmentLabels.authMode, word(t.environmentValues, env.authMode)],
    [t.environmentLabels.catalogueSource, word(t.environmentValues, env.catalogueSource)],
    [t.environmentLabels.bookLookup, word(t.environmentValues, env.bookLookup || 'online')],
    [t.environmentLabels.submissions, env.submissions ? t.environmentValues.on : t.environmentValues.off],
  ];
  return (
    <dl className="divide-y divide-border/80 rounded-2xl border border-border bg-card">
      {rows.map(([label, value]) => (
        <div key={label} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 text-sm">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 truncate text-right font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function System() {
  const { t, formatDateTime } = useT();
  const fetchSystem = useCallback(() => api.admin.system(), []);
  const fetchAudit = useCallback(() => api.admin.audit(50), []);
  const system = useAdminResource(fetchSystem);
  const audit = useAdminResource(fetchAudit);

  const refresh = () => {
    void system.reload();
    void audit.reload();
  };

  return (
    <PageContainer className="max-w-2xl">
      <BackToSettings />
      <PageHeader title={t.admin.systemTitle} description={t.admin.systemSubtitle} />

      <AdminResource loading={system.loading} error={system.error} hasData={!!system.data} onRetry={() => void system.reload()}>
        {system.data && (
          <div className="space-y-8">
            <Section title={t.admin.configuration}>
              <Environment env={system.data.environment} t={t.admin} />
            </Section>

            <Section
              title={t.admin.serviceStatus}
              action={
                <Button variant="secondary" className="h-11 shrink-0 gap-2" onClick={refresh} disabled={system.loading}>
                  <RefreshCw className={cn(system.loading && 'animate-spin')} aria-hidden />
                  {t.admin.refresh}
                </Button>
              }
            >
              <ul className="space-y-2">
                {system.data.services.map((s) => (
                  <li key={s.key} data-testid="service-row" data-service={s.key} data-status={s.status} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-4">
                    <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', dot[s.status])} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{word(t.admin.services, s.key)}</p>
                      {s.detail && <p className="truncate text-xs text-muted-foreground">{word(t.admin.serviceDetails, s.detail)}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{word(t.admin.serviceStatuses, s.status)}</p>
                      {s.latencyMs ? <p className="text-xs text-muted-foreground tabular-nums">{t.admin.latency(s.latencyMs)}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        )}
      </AdminResource>

      <Section title={t.admin.auditTitle} description={t.admin.auditSubtitle}>
        <AdminResource loading={audit.loading} error={audit.error} hasData={!!audit.data} onRetry={() => void audit.reload()}>
          {audit.data && audit.data.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">{t.admin.auditEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {audit.data?.map((e) => (
                <li key={e.id} data-testid="audit-row" data-action={e.action} className="min-w-0 space-y-0.5 rounded-2xl border border-border bg-card p-4">
                  <p className="font-semibold break-words">{word(t.admin.auditActions, e.action)}</p>
                  <p className="text-sm break-words text-muted-foreground">
                    {auditTarget(e)} · {t.admin.auditBy(e.actor || t.admin.auditSystem)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </AdminResource>
      </Section>
    </PageContainer>
  );
}

export default function SystemPage() {
  return (
    <AdminGate>
      <System />
    </AdminGate>
  );
}
