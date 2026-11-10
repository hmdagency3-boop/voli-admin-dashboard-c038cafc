import { ModalForm, ProFormDependency, ProFormDigit, ProFormSelect } from "@ant-design/pro-components";
import { GiftOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Image, Popconfirm, Table, Tag } from "antd";
import { useAction, useLoad } from "@/components/hooks";
import { fmt, fmtDate } from "@/lib/admin";
import { daysLeft, getBackpack, getStoreItems, grantStoreItem, KIND_LABEL, revokeStoreItem, STORE_DAYS_MAX } from "@/lib/store";

/** A member's Backpack (items from the Store), with free grants and removal. */
export function Backpack({ authId }: { authId: string }) {
  const bag = useLoad(() => getBackpack(authId), [authId]);
  const store = useLoad(getStoreItems, []);
  const act = useAction();
  const items = store.data ?? [];
  return (
    <Card title="الحقيبة (من المتجر)" extra={
      <ModalForm<{ item: string; days?: number }> title="منح منتج من المتجر" width={440} modalProps={{ destroyOnHidden: true }}
        trigger={<Button icon={<GiftOutlined />} disabled={!items.length}>منح منتج</Button>}
        onFinish={async (v) => act(() => grantStoreItem(authId, v.item, v.days ?? null), "تمت إضافة المنتج لحقيبة العضو", bag.reload)}>
        <ProFormSelect name="item" label="المنتج" showSearch rules={[{ required: true, message: "اختر منتج" }]}
          options={items.map((i) => ({ value: i.id, label: `${KIND_LABEL[i.kind]} — ${i.name} (${fmt(i.price)} / ${i.days} يوم)${i.active ? "" : " — مخفي"}` }))} />
        <ProFormDependency name={["item"]}>{({ item }: { item?: string }) => (
          <ProFormDigit name="days" label={`عدد الأيام (فارغ = ${items.find((i) => i.id === item)?.days ?? "مدة المنتج"})`}
            min={1} max={STORE_DAYS_MAX} fieldProps={{ precision: 0 }} extra="مجاني للعضو، ويُضاف على الأيام المتبقية لو المنتج عنده." />
        )}</ProFormDependency>
      </ModalForm>
    }>
      {(bag.error || store.error) && <Alert type="error" showIcon message={bag.error ?? store.error} style={{ marginBottom: 12 }} />}
      <Table rowKey="item_id" size="small" pagination={false} loading={bag.loading} dataSource={bag.data ?? []}
        locale={{ emptyText: "الحقيبة فاضية" }}
        columns={[
          { title: "", dataIndex: "art_url", width: 60, render: (u: string) => <Image src={u} width={40} height={40} style={{ objectFit: "contain" }} /> },
          { title: "المنتج", render: (_, r) => <>{r.name} <Tag>{KIND_LABEL[r.kind]}</Tag></> },
          { title: "متبقّي", render: (_, r) => { const d = daysLeft(r.expires_at); return d ? `${d} يوم` : <Tag>انتهى</Tag>; } },
          { title: "ينتهي", dataIndex: "expires_at", render: fmtDate },
          { title: "", render: (_, r) => r.equipped ? <Tag color="blue">يستخدمه الآن</Tag> : null },
          { title: "", render: (_, r) => (
            <Popconfirm title="سحب المنتج من حقيبة العضو؟" description="بدون استرجاع كوينز." okText="سحب" cancelText="إلغاء"
              onConfirm={() => act(() => revokeStoreItem(authId, r.item_id), "سُحب المنتج", bag.reload)}><a style={{ color: "#ff4d4f" }}>سحب</a></Popconfirm>
          ) },
        ]} />
    </Card>
  );
}
