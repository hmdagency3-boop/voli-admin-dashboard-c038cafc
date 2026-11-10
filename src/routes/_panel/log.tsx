import { createFileRoute, Link } from "@tanstack/react-router";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Card, Table, Tag } from "antd";
import { useState } from "react";
import { pageHead } from "@/components/meta";
import { useLoad } from "@/components/hooks";
import { ACTION_LABELS, describeAction, fmtDate, getLog, LOG_PAGE, type LogRow } from "@/lib/admin";

export const Route = createFileRoute("/_panel/log")({
  head: pageHead("سجل العمليات", "كل إجراءات الإدارة في فولي"),
  component: Log,
});

function Log() {
  const [page, setPage] = useState(0);
  const { data, loading, error } = useLoad(() => getLog(page), [page]);
  const rows = data ?? [];
  return (
    <PageContainer title="سجل العمليات">
      <Card>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Table<LogRow> rowKey="id" loading={loading} dataSource={rows} scroll={{ x: 800 }}
          pagination={{ current: page + 1, pageSize: LOG_PAGE, total: page * LOG_PAGE + rows.length + (rows.length === LOG_PAGE ? 1 : 0), showSizeChanger: false, onChange: (p) => setPage(p - 1) }}
          columns={[
            { title: "الوقت", dataIndex: "created_at", render: fmtDate },
            { title: "بواسطة", dataIndex: "admin_name" },
            { title: "الإجراء", dataIndex: "action", render: (a) => <Tag color="blue">{ACTION_LABELS[a] ?? a}</Tag> },
            { title: "العضو المستهدف", render: (_, r) => r.target_id && r.target_name ? <Link to="/members/$authId" params={{ authId: r.target_id }}>{r.target_name}</Link> : "—" },
            { title: "التفاصيل", render: (_, r) => describeAction(r.action, r.details) },
          ]} />
      </Card>
    </PageContainer>
  );
}
