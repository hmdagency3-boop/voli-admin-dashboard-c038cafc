import { createFileRoute, Link } from "@tanstack/react-router";
import { ModalForm, PageContainer, ProFormDigit, ProFormSelect, ProFormText } from "@ant-design/pro-components";
import { Alert, Avatar, Button, Card, Input, Popconfirm, Space, Table, Tag } from "antd";
import { useState } from "react";
import { pageHead } from "@/components/meta";
import { useAction, useLoad } from "@/components/hooks";
import { fmtDate, getMembers, grantVip, revokeVip, type AdminMemberRow } from "@/lib/admin";
import { activeVipLevel, VIP_LEVELS } from "@/lib/vip";
import { VipNoticePreview } from "@/components/notices";

export const Route = createFileRoute("/_panel/vip")({
  head: pageHead("إدارة VIP", "منح عضوية VIP وسحبها من أعضاء فولي"),
  component: Vip,
});

function GrantForm({ m, act, reload }: { m: AdminMemberRow; act: ReturnType<typeof useAction>; reload: () => void }) {
  return (
    <ModalForm title={`منح VIP — ${m.display_name}`} trigger={<Button size="small" type="primary">منح VIP</Button>}
      onFinish={async (v: { level: number; days?: number; source: "admin" | "gift" | "event"; note?: string }) =>
        act(() => grantVip(m.auth_id, v.level, v.days ?? null, v.source, v.note), "تم منح VIP وإرسال التهنئة", reload)}>
      <ProFormSelect name="level" label="المستوى" options={VIP_LEVELS.map((l) => ({ label: `VIP ${l}`, value: l }))} rules={[{ required: true }]} />
      <ProFormDigit name="days" label="عدد الأيام (فارغ = دائم)" min={1} fieldProps={{ precision: 0 }} />
      <ProFormSelect name="source" label="النوع" initialValue="admin"
        options={[{ label: "إدارة", value: "admin" }, { label: "هدية", value: "gift" }, { label: "فعالية", value: "event" }]} />
      <ProFormText name="note" label="ملاحظة" />
      <VipNoticePreview />
    </ModalForm>
  );
}

const memberColumn = {
  title: "العضو",
  render: (_: unknown, r: AdminMemberRow) => (
    <Link to="/members/$authId" params={{ authId: r.auth_id }}>
      <Space><Avatar src={r.avatar_url}>{r.display_name?.[0]}</Avatar>{r.display_name}</Space>
    </Link>),
};

function Vip() {
  const act = useAction();
  const [q, setQ] = useState("");
  const search = useLoad(() => (q ? getMembers(q, "all", 0) : Promise.resolve({ rows: [] as AdminMemberRow[], total: 0 })), [q]);

  return (
    <PageContainer title="إدارة VIP">
      <Card title="منح VIP لعضو">
        <Input.Search allowClear placeholder="ابحث بالـ ID" style={{ width: 320, marginBottom: 16 }}
          onSearch={(v) => setQ(v)} />
        {search.error && <Alert type="error" message={search.error} showIcon style={{ marginBottom: 16 }} />}
        <Table<AdminMemberRow> rowKey="auth_id" size="small" loading={search.loading}
            dataSource={search.data?.rows ?? []} pagination={false}
            columns={[
              memberColumn,
              { title: "ID", render: (_, r) => r.special_id ? <Tag color="gold">{r.special_id}</Tag> : r.public_id },
              { title: "VIP الحالي", render: (_, r) => { const v = activeVipLevel(r); return v > 0 ? <Tag color="purple">VIP {v}</Tag> : "—"; } },
              { title: "ينتهي", render: (_, r) => (activeVipLevel(r) > 0 ? (r.vip_expires_at ? fmtDate(r.vip_expires_at) : "دائم") : "—") },
              {
                title: "", render: (_, r) => (
                  <Space size={8}>
                    <GrantForm m={r} act={act} reload={search.reload} />
                    {activeVipLevel(r) > 0 && (
                      <Popconfirm title={`سحب VIP من ${r.display_name}؟`} onConfirm={() => act(() => revokeVip(r.auth_id), "تم سحب VIP", search.reload)}>
                        <Button size="small" danger>سحب VIP</Button>
                      </Popconfirm>)}
                  </Space>),
              },
            ]} />
      </Card>
    </PageContainer>
  );
}
