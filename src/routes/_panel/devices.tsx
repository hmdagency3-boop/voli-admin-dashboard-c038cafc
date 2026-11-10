import { createFileRoute, Link } from "@tanstack/react-router";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Button, Input, Space, Table, Tag, Typography } from "antd";
import { useState } from "react";
import { pageHead } from "@/components/meta";
import { useLoad } from "@/components/hooks";
import {
  DEVICES_PAGE, fmtDate, getDeviceConnections, getDevices,
  type DeviceRow, type LinkedAccount,
} from "@/lib/admin";

export const Route = createFileRoute("/_panel/devices")({
  validateSearch: (search: Record<string, unknown>): { member?: string | undefined } => ({ member: typeof search['member'] === 'string' || typeof search['member'] === 'number' ? String(search['member']) : undefined }),
  head: pageHead("الأجهزة والحسابات المرتبطة", "سجل أجهزة أعضاء فولي والحسابات التي استخدمت نفس الأجهزة"),
  component: Devices,
});

function Devices() {
  const search = Route.useSearch();
  const [member, setMember] = useState(search.member ?? '');
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const devices = useLoad(() => getDevices(q, page), [q, page]);
  const connections = useLoad(() => member ? getDeviceConnections(member) : Promise.resolve(null), [member]);
  const rows = member ? connections.data?.devices ?? [] : devices.data?.rows ?? [];

  return (
    <PageContainer title="الأجهزة والحسابات المرتبطة" extra={<Link to="/bans"><Button danger>إدارة الحظر</Button></Link>}>
      <Space wrap className="mb-4">
        <Input.Search key={search.member} defaultValue={search.member} allowClear aria-label="بحث روابط الحساب" placeholder="ID الحساب — كل الأجهزة والحسابات المرتبطة" onSearch={setMember} />
        {!member && <Input.Search allowClear placeholder="IP أو الطراز أو الشبكة أو اسم العضو" 
              onSearch={(v) => { setQ(v); setPage(0); }} />
        }
      </Space>
      {(member ? connections.error : devices.error) && <Alert type="error" message={member ? connections.error : devices.error} showIcon className="mb-4" />}
      {member && <>
        <Typography.Title level={4}>الحسابات التي استخدمت أجهزة الحساب {member}</Typography.Title>
        <Table<LinkedAccount> rowKey="auth_id" loading={connections.loading} dataSource={connections.data?.accounts ?? []} scroll={{ x: 650 }}
          columns={[
            { title: 'الحساب', render: (_, r) => <Link to="/members/$authId" params={{ authId: r.auth_id }}>{r.display_name ?? '—'}</Link> },
            { title: 'ID', dataIndex: 'public_id' },
            { title: 'ID المميز', dataIndex: 'special_id' },
            { title: 'الأجهزة المشتركة', render: (_, r) => <Space wrap>{r.devices.map((d) => <Tag key={d}>{d}</Tag>)}</Space> },
            { title: 'أكواد الحظر الفعّالة', render: (_, r) => r.ban_codes.length ? r.ban_codes.map((c) => <Tag key={c} color="red">{c}</Tag>) : <Tag>نشط</Tag> },
            { title: '', render: (_, r) => <Link to="/bans" search={{ member: String(r.public_id) }}><Button size="small" danger>إدارة الحظر</Button></Link> },
          ]} />
      </>}
      <Typography.Title level={4}>{member ? 'كل الأجهزة السابقة للحساب' : 'الأجهزة المسجلة'}</Typography.Title>
            <Table<DeviceRow> rowKey="id" loading={member ? connections.loading : devices.loading} dataSource={rows} scroll={{ x: 1100 }}
              pagination={member ? { pageSize: DEVICES_PAGE } : { current: page + 1, pageSize: DEVICES_PAGE, total: devices.data?.total ?? 0, showSizeChanger: false, onChange: (p) => setPage(p - 1) }}
              columns={[
                { title: "العضو", render: (_, r) => <Link to="/members/$authId" params={{ authId: r.auth_id }}>{r.display_name ?? "—"} {r.public_id ? `(${r.public_id})` : ""}</Link> },
                { title: "IP", dataIndex: "ip", render: (v) => v ?? "—" },
                { title: "الهاتف", render: (_, r) => [r.brand, r.model].filter(Boolean).join(" ") || "—" },
                { title: "النظام", dataIndex: "os", render: (v) => v ?? "—" },
                { title: "الشبكة", render: (_, r) => [r.network, r.carrier].filter(Boolean).join(" — ") || "—" },
                { title: "معرّف الجهاز", dataIndex: "device_id", ellipsis: true, width: 160 },
                { title: "آخر ظهور", dataIndex: "last_seen", render: fmtDate },
                 { title: "أول ظهور", dataIndex: "first_seen", render: fmtDate },
                 { title: "الحالة", render: (_, r) => r.ban ? <Tag color="red">محظور {r.ban.code ?? ''}</Tag> : <Tag>نشط</Tag> },
                 { title: "", width: 200, fixed: "right", render: (_, r) => <Link to="/bans" search={{ kind: 'device', value: r.device_id }}><Button size="small" danger>حظر الجهاز وحساباته</Button></Link> },
              ]} />
    </PageContainer>
  );
}
