import { createFileRoute, Link } from "@tanstack/react-router";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Avatar, Card, Input, Segmented, Space, Table, Tag } from "antd";
import { useState } from "react";
import { pageHead } from "@/components/meta";
import { useLoad } from "@/components/hooks";
import { fmt, fmtDay, getMembers, MEMBERS_PAGE, type AdminMemberRow, type MemberFilter } from "@/lib/admin";
import { activeVipLevel } from "@/lib/vip";

export const Route = createFileRoute("/_panel/members/")({
  head: pageHead("الأعضاء", "بحث وإدارة أعضاء فولي"),
  component: Members,
});

function Members() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [page, setPage] = useState(0);
  const { data, loading, error } = useLoad(() => getMembers(q, filter, page), [q, filter, page]);
  return (
    <PageContainer title="الأعضاء">
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search allowClear placeholder="الاسم أو ID أو البريد" style={{ width: 280 }} onSearch={(v) => { setQ(v); setPage(0); }} />
          <Segmented value={filter} onChange={(v) => { setFilter(v as MemberFilter); setPage(0); }}
            options={[{ label: "الكل", value: "all" }, { label: "VIP", value: "vip" }, { label: "المحظورون", value: "banned" }, { label: "الإدارة", value: "staff" }, { label: "الجدد", value: "new" }]} />
        </Space>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Table<AdminMemberRow> rowKey="auth_id" loading={loading} dataSource={data?.rows ?? []} scroll={{ x: 900 }}
          pagination={{ current: page + 1, pageSize: MEMBERS_PAGE, total: data?.total ?? 0, showSizeChanger: false, onChange: (p) => setPage(p - 1) }}
          columns={[
            { title: "العضو", render: (_, r) => (
              <Link to="/members/$authId" params={{ authId: r.auth_id }}>
                <Space><Avatar src={r.avatar_url}>{r.display_name?.[0]}</Avatar>{r.display_name}</Space>
              </Link>) },
            { title: "ID", render: (_, r) => r.special_id ? <Tag color="gold">{r.special_id}</Tag> : r.public_id },
            { title: "البريد", dataIndex: "email" },
            { title: "العملات", dataIndex: "coins", render: fmt },
            { title: "الحالة", render: (_, r) => {
              const v = activeVipLevel(r);
              return <Space size={4} wrap>
                {v > 0 && <Tag color="purple">VIP {v}</Tag>}
                {r.roles.includes("admin") && <Tag color="blue">إدارة عليا</Tag>}
                {r.roles.includes("moderator") && <Tag color="cyan">مشرف</Tag>}
                {r.banned && <Tag color="red">محظور</Tag>}
              </Space>; } },
            { title: "انضم", dataIndex: "created_at", render: fmtDay },
          ]} />
      </Card>
    </PageContainer>
  );
}
