import { createFileRoute, Link } from '@tanstack/react-router';
import { ModalForm, PageContainer, ProFormDependency, ProFormDigit, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { Alert, Button, Input, Popconfirm, Segmented, Space, Table, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { pageHead } from '@/components/meta';
import { useAction, useLoad } from '@/components/hooks';
import { ALL_BAN_LABELS, createBan, DEVICES_PAGE, fmtDate, getBans, revokeBan, type UnifiedBan, type UnifiedBanKind } from '@/lib/admin';

export const Route = createFileRoute('/_panel/bans')({
  validateSearch: (search: Record<string, unknown>): { member?: string | undefined; kind?: UnifiedBanKind | undefined; value?: string | undefined } => ({
    member: typeof search['member'] === 'string' || typeof search['member'] === 'number' ? String(search['member']) : undefined,
    kind: ['account', 'ip', 'network', 'device'].includes(String(search['kind'])) ? search['kind'] as UnifiedBanKind : undefined,
    value: typeof search['value'] === 'string' || typeof search['value'] === 'number' ? String(search['value']) : undefined,
  }),
  head: pageHead('إدارة الحظر', 'حظر الحسابات والأجهزة والشبكات وIP بأكواد موحدة في فولي'),
  component: Bans,
});

function Bans() {
  const search = Route.useSearch();
  const [q, setQ] = useState(search.member ?? '');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(Boolean(search.value));
  const bans = useLoad(() => getBans(q, kind, status, page), [q, kind, status, page]);
  const act = useAction();
  return <PageContainer title="إدارة الحظر" extra={[
    <Button key="reload" icon={<ReloadOutlined />} aria-label="تحديث الحظر" onClick={bans.reload} />,
    <Button key="new" type="primary" danger icon={<PlusOutlined />} onClick={() => setOpen(true)}>حظر جديد</Button>,
  ]}>
    <ModalForm<{ kind: UnifiedBanKind; value: string; days?: number; reason?: string }>
      title="حظر جديد" open={open} modalProps={{ destroyOnHidden: true, onCancel: () => setOpen(false) }}
      initialValues={{ kind: search.kind ?? 'account', value: search.value ?? search.member ?? '' }}
      onFinish={(v) => act(async () => {
        await createBan(v.kind, v.value, v.days, v.reason);
      }, 'تم الحظر وتخصيص الكود', () => { setOpen(false); bans.reload(); })}>
      <ProFormSelect name="kind" label="نوع الحظر" rules={[{ required: true }]} options={Object.entries(ALL_BAN_LABELS).map(([value, label]) => ({ value, label }))} />
      <ProFormText name="value" label="ID الحساب / IP / نطاق الشبكة أو المشغّل / معرّف الجهاز" rules={[{ required: true }]} />
      <ProFormDigit name="days" label="عدد الأيام (فارغ = دائم)" min={1} fieldProps={{ precision: 0 }} />
      <ProFormText name="reason" label="السبب" fieldProps={{ maxLength: 200 }} />
      <ProFormDependency name={['kind']}>{({ kind: k }) => k === 'device' ? <Alert type="warning" showIcon message="سيُحظر كل حساب سبق أن فتح على هذا الجهاز، حتى عند دخوله من جهاز آخر." /> : null}</ProFormDependency>
    </ModalForm>
    <Space wrap className="mb-4">
      <Input.Search key={search.member} defaultValue={search.member} allowClear aria-label="بحث الحظر" placeholder="كود الحظر أو ID الحساب أو قيمة الحظر" onSearch={(v) => { setQ(v); setPage(0); }} />
      <Segmented aria-label="نوع الحظر" value={kind} onChange={(v) => { setKind(String(v)); setPage(0); }} options={[{ label: 'الكل', value: 'all' }, ...Object.entries(ALL_BAN_LABELS).map(([value, label]) => ({ value, label }))]} />
      <Segmented aria-label="حالة الحظر" value={status} onChange={(v) => { setStatus(String(v)); setPage(0); }} options={[{ label: 'نشط', value: 'active' }, { label: 'منتهي / مفكوك', value: 'inactive' }, { label: 'السجل الكامل', value: 'all' }]} />
    </Space>
    {bans.error && <Alert type="error" showIcon message={bans.error} className="mb-4" />}
    <Table<UnifiedBan> rowKey="id" loading={bans.loading} dataSource={bans.data?.rows ?? []} scroll={{ x: 1100 }}
      pagination={{ current: page + 1, pageSize: DEVICES_PAGE, total: bans.data?.total ?? 0, showSizeChanger: false, onChange: (p) => setPage(p - 1) }}
      columns={[
        { title: 'الكود', dataIndex: 'code', width: 90, render: (code) => <Tag>{code}</Tag> },
        { title: 'النوع', dataIndex: 'kind', render: (k: UnifiedBanKind) => ALL_BAN_LABELS[k] },
        { title: 'القيمة', dataIndex: 'value', render: (value, r) => r.kind === 'account' ? <Link to="/devices" search={{ member: value }}>{value}</Link> : <span dir="ltr">{value}</span> },
        { title: 'الحسابات المشمولة', dataIndex: 'affected_accounts' },
        { title: 'السبب', dataIndex: 'reason', render: (v) => v ?? '—' },
        { title: 'بواسطة', dataIndex: 'by_name', render: (v) => v ?? '—' },
        { title: 'التاريخ', dataIndex: 'created_at', render: fmtDate },
        { title: 'النهاية', dataIndex: 'until', render: (v) => v ? fmtDate(v) : 'دائم' },
        { title: 'الحالة', render: (_, r) => <Tag color={r.active ? 'red' : 'default'}>{r.active ? 'نشط' : r.revoked_at ? 'مفكوك' : 'منتهي'}</Tag> },
        { title: '', fixed: 'right', render: (_, r) => r.active && <Popconfirm title={`فك الحظر ${r.code}؟`} description="ستبقى أي أكواد حظر أخرى فعّالة على الحسابات نفسها." onConfirm={() => act(() => revokeBan(r.id), 'تم فك الحظر', bans.reload)}><Button size="small">فك الحظر</Button></Popconfirm> },
      ]} />
  </PageContainer>;
}