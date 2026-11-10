import { createFileRoute, Link } from "@tanstack/react-router";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Avatar, Button, Card, Input, Popconfirm, Space, Switch, Table, Tag } from "antd";
import { useState } from "react";
import { pageHead } from "@/components/meta";
import { useAction, useLoad } from "@/components/hooks";
import { clearRoomChat, closeRoom, fmt, fmtDate, getRooms, type AdminRoom } from "@/lib/admin";

export const Route = createFileRoute("/_panel/rooms")({
  head: pageHead("الغرف الصوتية", "متابعة وإدارة الغرف الصوتية في فولي"),
  component: Rooms,
});

function Rooms() {
  const [q, setQ] = useState("");
  const [live, setLive] = useState(true);
  const { data, loading, error, reload } = useLoad(() => getRooms(q, live), [q, live]);
  const act = useAction();
  return (
    <PageContainer title="الغرف الصوتية">
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search allowClear placeholder="اسم الغرفة أو مالكها" style={{ width: 280 }} onSearch={setQ} />
          <Space>النشطة فقط <Switch checked={live} onChange={setLive} /></Space>
        </Space>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Table<AdminRoom> rowKey="id" loading={loading} dataSource={data ?? []} scroll={{ x: 900 }} columns={[
          { title: "الغرفة", dataIndex: "name" },
          { title: "المالك", render: (_, r) => <Link to="/members/$authId" params={{ authId: r.owner_id }}><Space><Avatar size="small" src={r.owner_avatar}>{r.owner_name?.[0]}</Avatar>{r.owner_name}</Space></Link> },
          { title: "الحالة", render: (_, r) => <Space size={4}>{r.is_live ? <Tag color="green">نشطة</Tag> : <Tag>مغلقة</Tag>}{r.locked && <Tag color="orange">بكلمة مرور</Tag>}</Space> },
          { title: "المتواجدون", dataIndex: "present", render: fmt },
          { title: "المقاعد", dataIndex: "seat_count" },
          { title: "عملات الغرفة", dataIndex: "coins_total", render: fmt },
          { title: "آخر تحديث", dataIndex: "updated_at", render: fmtDate },
          { title: "", render: (_, r) => <Space>
            <Popconfirm title="مسح محادثة الغرفة؟" onConfirm={() => act(() => clearRoomChat(r.id), "مُسحت المحادثة", reload)}><Button size="small">مسح المحادثة</Button></Popconfirm>
            {r.is_live && <Popconfirm title="إغلاق الغرفة وإخراج الجميع؟" onConfirm={() => act(() => closeRoom(r.id), "أُغلقت الغرفة", reload)}><Button size="small" danger>إغلاق</Button></Popconfirm>}
          </Space> },
        ]} />
      </Card>
    </PageContainer>
  );
}
