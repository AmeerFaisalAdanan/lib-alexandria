'use client';

import { useState } from 'react';
import { MoreVertical, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/books/badges';
import { AdminGate, AdminResource, BackToSettings } from '@/components/admin/admin-gate';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageContainer, PageHeader } from '@/components/page';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { useAction } from '@/lib/use-action';
import { useAdminResource } from '@/lib/use-admin';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';
import type { Member } from '@/types/library';

type Change = 'promote' | 'demote' | 'disable';

const displayName = (m: Member) => m.name || m.email;

function Members() {
  const { t, formatDate } = useT();
  const run = useAction();
  const meId = useLibraryStore((s) => s.me?.id);
  const reloadMe = useLibraryStore((s) => s.load);
  const { data, error, loading, reload, setData } = useAdminResource(api.admin.listMembers);
  const [pending, setPending] = useState<{ member: Member; change: Change } | null>(null);

  const apply = async (member: Member, patch: Parameters<typeof api.admin.updateMember>[1], success: string) => {
    await run(
      async () => {
        const updated = await api.admin.updateMember(member.id, patch);
        setData((data ?? []).map((m) => (m.id === updated.id ? updated : m)));
        // Changing your own role or status changes what you are allowed to see: refresh who the server says you are.
        if (member.id === meId) await reloadMe();
      },
      () => toast.success(success),
    );
  };

  const confirm = () => {
    if (!pending) return;
    const { member, change } = pending;
    setPending(null);
    if (change === 'promote') void apply(member, { role: 'admin' }, t.admin.toastPromoted);
    if (change === 'demote') void apply(member, { role: 'member' }, t.admin.toastDemoted);
    if (change === 'disable') void apply(member, { status: 'disabled' }, t.admin.toastDisabled);
  };

  const self = pending?.member.id === meId;
  const name = pending ? displayName(pending.member) : '';
  const copy = {
    promote: { title: t.admin.confirmPromoteTitle, body: t.admin.confirmPromoteBody(name), label: t.admin.confirmPromote },
    demote: { title: t.admin.confirmDemoteTitle, body: self ? t.admin.confirmDemoteSelfBody : t.admin.confirmDemoteBody(name), label: t.admin.confirmDemote },
    disable: { title: t.admin.confirmDisableTitle, body: self ? t.admin.confirmDisableSelfBody : t.admin.confirmDisableBody(name), label: t.admin.confirmDisable },
  };

  return (
    <PageContainer className="max-w-2xl">
      <BackToSettings />
      <PageHeader title={t.admin.members} description={data ? t.admin.memberCount(data.length) : t.admin.membersDesc} />

      <AdminResource loading={loading} error={error} hasData={!!data} onRetry={() => void reload()}>
        <ul className="space-y-3">
          {data?.map((m) => {
            const isMe = m.id === meId;
            const disabled = m.status === 'disabled';
            return (
              <li key={m.id} data-testid="member-card" data-email={m.email} className={cn('flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-card p-4', disabled && 'opacity-75')}>
                <UserAvatar name={displayName(m)} className="mt-0.5 size-9 text-sm" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="min-w-0 truncate font-bold">{displayName(m)}</p>
                    {isMe && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{t.admin.you}</span>}
                  </div>
                  {m.name && <p className="truncate text-sm text-muted-foreground">{m.email}</p>}
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                    <span className={cn('rounded-md border px-2 py-0.5', m.role === 'admin' ? 'border-primary/30 bg-primary/10 text-accent-foreground' : 'border-border text-muted-foreground')}>
                      {t.admin.role[m.role]}
                    </span>
                    <span className={cn('rounded-md border px-2 py-0.5', disabled ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-success/20 bg-success/10 text-success')}>
                      {t.admin.status[m.status]}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{t.admin.lastSeen(formatDate(m.lastSeenAt))}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t.admin.actionsFor(displayName(m))} />}>
                    <MoreVertical aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    {m.role === 'member' ? (
                      <DropdownMenuItem className="min-h-11" onClick={() => setPending({ member: m, change: 'promote' })}>
                        <ShieldCheck aria-hidden />
                        {t.admin.makeAdmin}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem className="min-h-11" onClick={() => setPending({ member: m, change: 'demote' })}>
                        <ShieldOff aria-hidden />
                        {t.admin.makeMember}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {disabled ? (
                      <DropdownMenuItem className="min-h-11" onClick={() => void apply(m, { status: 'active' }, t.admin.toastEnabled)}>
                        <UserCheck aria-hidden />
                        {t.admin.enable}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem variant="destructive" className="min-h-11" onClick={() => setPending({ member: m, change: 'disable' })}>
                        <UserX aria-hidden />
                        {t.admin.disable}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      </AdminResource>

      {/* Dialogs live outside the menu so closing them never leaves the menu open. */}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? copy[pending.change].title : ''}
        description={pending ? copy[pending.change].body : ''}
        confirmLabel={pending ? copy[pending.change].label : ''}
        onConfirm={confirm}
      />
    </PageContainer>
  );
}

export default function MembersPage() {
  return (
    <AdminGate>
      <Members />
    </AdminGate>
  );
}
