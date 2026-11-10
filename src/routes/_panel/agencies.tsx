import { createFileRoute, Link } from "@tanstack/react-router";
import { ModalForm, PageContainer, ProFormDigit, ProFormText } from "@ant-design/pro-components";
import { Alert, Avatar, Button, Card, Drawer, Input, Popconfirm, Segmented, Space, Table, Tabs, Tag } from "antd";
import { useState } from "react";
import { pageHead } from "@/components/meta";
import { useAction, useLoad } from "@/components/hooks";
import {
  fmt, fmtDate, getAgencies, getAgencyHosts, getApplications, removeAgencyHost, reviewApplication, updateAgency,
  type AdminAgency, type AgencyApplication, type ApplicationStatus,
} from "@/lib/admin";

export const Route = createFileRoute("/_panel/agencies")({
  head: pageHead("الوكالات", "إدارة وكالات فولي وطلبات الانضمام"),
  component: Agencies,
});

function Agencies() {
  return (
    <PageContainer title="الوكالات">
      <Card><Tabs items={[{ key: "a", label: "الوكالات", children: <AgencyList /> }, { key: "r", label: "طلبات فتح وكالة", children: <Applications /> }]} /></Card>
    </PageContainer>
  );
}

function AgencyList() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<AdminAgency | null>(null);
  const { data, loading, error, reload } = useLoad(() => getAgencies(q), [q]);
  const act = useAction();
  return <>
    <Input.Search allowClear placeholder="اسم أو كود الوكالة" style={{ width: 280, marginBottom: 16 }} onSearch={setQ} />
    {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
    <Table<AdminAgency> rowKey="id" loading={loading} dataSource={data ?? []} scroll={{ x: 900 }} columns={[
      { title: "الكود", dataIndex: "code" },
      { title: "الوكالة", dataIndex: "name" },
      { title: "الوكيل", render: (_, r) => <Link to="/members/$authId" params={{ authId: r.owner_id }}><Space><Avatar size="small" src={r.owner_avatar}>{r.owner_name?.[0]}</Avatar>{r.owner_name}</Space></Link> },
      { title: "العمولة", dataIndex: "commission_percent", render: (v) => v == null ? "الافتراضي" : `${v}%` },
      { title: "المضيفون", dataIndex: "members", render: fmt },
      { title: "دخل الأسبوع", dataIndex: "income_week", render: fmt },
      { title: "", render: (_, r) => <Space>
        <Button size="small" onClick={() => setOpen(r)}>المضيفون</Button>
        <ModalForm title="تعديل الوكالة" trigger={<Button size="small">تعديل</Button>} initialValues={{ name: r.name, commission: r.commission_percent ?? undefined }}
          onFinish={async (v: { name: string; commission?: number }) => act(() => updateAgency(r.id, v.name, v.commission ?? null), "حُفظت الوكالة", reload)}>
          <ProFormText name="name" label="الاسم" rules={[{ required: true }]} />
          <ProFormDigit name="commission" label="العمولة % (فارغ = الافتراضية)" min={0} max={100} />
        </ModalForm>
      </Space> },
    ]} />
    <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name} width={560}>
      {open && <Hosts agency={open.id} />}
    </Drawer>
  </>;
}

function Hosts({ agency }: { agency: string }) {
  const { data, loading, reload } = useLoad(() => getAgencyHosts(agency), [agency]);
  const act = useAction();
  return <Table rowKey="host_id" size="small" loading={loading} dataSource={data ?? []} pagination={false} columns={[
    { title: "المضيف", render: (_, h) => <Link to="/members/$authId" params={{ authId: h.host_id }}>{h.display_name} ({h.public_id})</Link> },
    { title: "دخل الأسبوع", dataIndex: "income_week", render: fmt },
    { title: "انضم", dataIndex: "joined_at", render: fmtDate },
    { title: "", render: (_, h) => <Popconfirm title="إزالته من الوكالة؟" onConfirm={() => act(() => removeAgencyHost(agency, h.host_id), "أُزيل", reload)}><Button size="small" danger>إزالة</Button></Popconfirm> },
  ]} />;
}

function Applications() {
  const [status, setStatus] = useState<ApplicationStatus>("pending");
  const { data, loading, error, reload } = useLoad(() => getApplications(status), [status]);
  const act = useAction();
  return <>
    <Segmented style={{ marginBottom: 16 }} value={status} onChange={(v) => setStatus(v as ApplicationStatus)}
      options={[{ label: "معلّقة", value: "pending" }, { label: "مقبولة", value: "approved" }, { label: "مرفوضة", value: "rejected" }]} />
    {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
    <Table<AgencyApplication> rowKey="id" loading={loading} dataSource={data ?? []} scroll={{ x: 900 }} columns={[
      { title: "الوكالة", dataIndex: "agency_name" },
      { title: "الاسم", render: (_, a) => <Link to="/members/$authId" params={{ authId: a.applicant_id }}>{a.full_name}</Link> },
      { title: "الهاتف", dataIndex: "phone" }, { title: "البلد", dataIndex: "country" }, { title: "ملاحظة", dataIndex: "note" },
      { title: "التاريخ", dataIndex: "created_at", render: fmtDate },
      { title: "", render: (_, a) => a.status === "pending" ? <Space>
          <Popconfirm title="قبول وفتح الوكالة؟" onConfirm={() => act(() => reviewApplication(a.id, true), "قُبل الطلب", reload)}><Button size="small" type="primary">قبول</Button></Popconfirm>
          <ModalForm title="رفض الطلب" trigger={<Button size="small" danger>رفض</Button>}
            onFinish={async (v: { reason?: string }) => act(() => reviewApplication(a.id, false, v.reason), "رُفض الطلب", reload)}>
            <ProFormText name="reason" label="السبب" />
          </ModalForm>
        </Space> : a.status === "approved" ? <Tag color="green">كود {a.code}</Tag> : <Tag color="red">{a.reject_reason ?? "مرفوض"}</Tag> },
    ]} />
  </>;
}
