import { ModalForm, ProFormDependency, ProFormDigit, ProFormSelect, ProFormText, ProFormTextArea } from "@ant-design/pro-components";
import { Alert, Button, Typography } from "antd";
import { buildNotice, sendAdminNotice, vipGrantNotices, type NoticeInput, type NoticeTemplate } from "@/lib/admin";
import { VIP_LEVELS } from "@/lib/vip";
import type { useAction } from "@/components/hooks";

/** Shows the official English message(s) the member will receive in their Voli Helper chat. */
export function NoticePreview({ lines }: { lines: (string | null | undefined)[] }) {
  const shown = lines.filter((l): l is string => !!l);
  if (!shown.length) return null;
  return (
    <Alert type="info" showIcon style={{ marginBottom: 16 }} message="رسالة تصل للعضو من Voli Helper"
      description={shown.map((l) => <Typography.Paragraph key={l} style={{ direction: "ltr", textAlign: "left", margin: 0 }}>{l}</Typography.Paragraph>)} />
  );
}

/** Preview inside a "grant VIP" form (reads its level / days fields). */
export function VipNoticePreview() {
  return (
    <ProFormDependency name={["level", "days"]}>
      {({ level, days }: { level?: number; days?: number | null }) => (level ? <NoticePreview lines={vipGrantNotices(level, days)} /> : null)}
    </ProFormDependency>
  );
}

const TEMPLATES: { label: string; value: NoticeTemplate }[] = [
  { label: "Headwear Super Admin", value: "super_admin" },
  { label: "Headwear Moderator", value: "moderator" },
  { label: "Headwear VIP (1-8)", value: "vip_headwear" },
  { label: "ترقية VIP", value: "vip_upgrade" },
  { label: "غطاء رأس مخصص (Headwear)", value: "headwear" },
  { label: "هدية مخصصة", value: "gift" },
  { label: "رسالة مخصصة", value: "custom" },
];

const daysField = <ProFormDigit name="days" label="عدد الأيام (فارغ = بدون مدة)" min={1} max={36500} fieldProps={{ precision: 0 }} />;

/** Sends a ready-made (or custom) official notice to one member right away. Notice only: grants nothing. */
export function SendNoticeForm({ authId, name, act, after }: { authId: string; name: string; act: ReturnType<typeof useAction>; after?: () => void }) {
  return (
    <ModalForm<NoticeInput> title={`إرسال هدية / إشعار رسمي — ${name}`} width={480}
      trigger={<Button block>إرسال هدية / إشعار رسمي</Button>}
      initialValues={{ template: "super_admin" }} modalProps={{ destroyOnHidden: true }}
      onFinish={async (v) => {
        const body = buildNotice(v);
        return body ? act(() => sendAdminNotice(authId, body), "تم إرسال الإشعار", after) : false;
      }}>
      <ProFormSelect name="template" label="القالب" options={TEMPLATES} allowClear={false} rules={[{ required: true }]} />
      <ProFormDependency name={["template"]}>
        {({ template }: { template?: NoticeTemplate }) => {
          if (template === "vip_headwear" || template === "vip_upgrade") return <>
            <ProFormSelect name="level" label="المستوى" options={VIP_LEVELS.map((l) => ({ label: `VIP ${l}`, value: l }))} rules={[{ required: true }]} />
            {daysField}
          </>;
          if (template === "headwear" || template === "gift") return <>
            <ProFormText name="name" label={template === "headwear" ? "اسم غطاء الرأس (بالإنجليزية)" : "اسم الهدية (بالإنجليزية)"}
              rules={[{ required: true, whitespace: true }]} fieldProps={{ maxLength: 80, style: { direction: "ltr" } }} />
            {daysField}
          </>;
          if (template === "custom") return (
            <ProFormTextArea name="text" label="نص الرسالة" rules={[{ required: true, whitespace: true }]}
              fieldProps={{ maxLength: 1000, showCount: true, rows: 4, style: { direction: "ltr" } }} />);
          return null;
        }}
      </ProFormDependency>
      <ProFormDependency name={["template", "level", "days", "name", "text"]}>
        {(v: NoticeInput) => <NoticePreview lines={[buildNotice(v)]} />}
      </ProFormDependency>
      <Alert type="warning" showIcon message="هذا إشعار فقط ولا يمنح العضو شيئاً. للمنح الفعلي استخدم أزرار VIP والعملات والصلاحيات، وهي ترسل التهنئة تلقائياً." />
    </ModalForm>
  );
}
