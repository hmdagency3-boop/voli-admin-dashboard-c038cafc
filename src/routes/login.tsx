import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoginForm, ProFormText } from "@ant-design/pro-components";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { Alert } from "antd";
import { useState } from "react";
import { adminSignIn } from "@/lib/admin";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "تسجيل الدخول — لوحة إدارة فولي" },
    { name: "description", content: "دخول الإدارة العليا للوحة فولي" },
    { property: "og:title", content: "تسجيل الدخول — لوحة إدارة فولي" },
    { property: "og:description", content: "دخول الإدارة العليا للوحة فولي" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg,#e6f4ff,#f5f5f5)" }}>
      <LoginForm
        title="لوحة إدارة فولي"
        subTitle="للإدارة العليا فقط — نفس حساب تطبيق فولي"
        submitter={{ searchConfig: { submitText: "دخول" } }}
        onFinish={async (v: { email: string; password: string }) => {
          const e = await adminSignIn(v.email, v.password);
          if (e) { setErr(e); return false; }
          nav({ to: "/" });
          return true;
        }}
      >
        {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 16 }} />}
        <ProFormText name="email" fieldProps={{ size: "large", prefix: <MailOutlined /> }} placeholder="البريد الإلكتروني" rules={[{ required: true, message: "أدخل البريد الإلكتروني" }]} />
        <ProFormText.Password name="password" fieldProps={{ size: "large", prefix: <LockOutlined /> }} placeholder="كلمة المرور" rules={[{ required: true, message: "أدخل كلمة المرور" }]} />
      </LoginForm>
    </div>
  );
}
