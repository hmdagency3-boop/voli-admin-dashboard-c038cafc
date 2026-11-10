import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, StatisticCard } from "@ant-design/pro-components";
import { Alert, Card, Col, Row, Table } from "antd";
import { pageHead } from "@/components/meta";
import { useLoad } from "@/components/hooks";
import { fmt, getDashboard } from "@/lib/admin";

export const Route = createFileRoute("/_panel/")({
  head: pageHead("الرئيسية", "نظرة عامة على أعضاء وغرف وهدايا فولي"),
  component: Dashboard,
});

function Dashboard() {
  const { data, loading, error } = useLoad(getDashboard, []);
  const stats: [string, keyof NonNullable<typeof data>][] = [
    ["كل الأعضاء", "members"], ["أعضاء جدد اليوم", "members_today"], ["جدد آخر 7 أيام", "members_week"],
    ["غرف نشطة", "live_rooms"], ["المتواجدون في الغرف", "in_rooms_now"], ["رصيد العملات عند الأعضاء", "coins_balance"],
    ["هدايا اليوم", "gifts_today"], ["هدايا آخر 7 أيام", "gifts_week"], ["VIP نشط", "vip_active"],
    ["الوكالات", "agencies"], ["طلبات وكالة معلّقة", "pending_applications"], ["حظر نشط", "bans_active"],
  ];
  return (
    <PageContainer title="الرئيسية">
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      <Row gutter={[16, 16]}>
        {stats.map(([t, k]) => (
          <Col key={k} xs={24} sm={12} lg={6}>
            <StatisticCard loading={loading} statistic={{ title: t, value: fmt(data?.[k] as number) }} />
          </Col>
        ))}
      </Row>
      <Card title="آخر الأيام" style={{ marginTop: 16 }}>
        <Table rowKey="day" size="small" pagination={false} loading={loading} dataSource={data?.days ?? []}
          columns={[
            { title: "اليوم", dataIndex: "day" },
            { title: "تسجيلات", dataIndex: "signups", render: fmt },
            { title: "هدايا (عملات)", dataIndex: "gifts", render: fmt },
          ]} />
      </Card>
    </PageContainer>
  );
}
