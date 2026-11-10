import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { ProLayout } from "@ant-design/pro-components";
import { AppstoreOutlined, BankOutlined, CrownOutlined, DashboardOutlined, GiftOutlined, HistoryOutlined, LaptopOutlined, LogoutOutlined, ShopOutlined, SoundOutlined, StopOutlined, TeamOutlined } from "@ant-design/icons";
import { Button, Dropdown, Result, Spin } from "antd";
import { useEffect, useState } from "react";
import { adminSignOut, getAdminAccess, getAdminName, useAdminSession, type AdminAccess } from "@/lib/admin";

export const Route = createFileRoute("/_panel")({ component: PanelLayout });

const menu = [
  { path: "/", name: "الرئيسية", icon: <DashboardOutlined /> },
  { path: "/members", name: "الأعضاء", icon: <TeamOutlined /> },
  { path: "/vip", name: "إدارة VIP", icon: <CrownOutlined /> },
  { path: "/rooms", name: "الغرف الصوتية", icon: <SoundOutlined /> },
  { path: "/gifts", name: "الهدايا والأسعار", icon: <GiftOutlined /> },
  { path: "/store", name: "المتجر", icon: <ShopOutlined /> },
  { path: "/agencies", name: "الوكالات", icon: <BankOutlined /> },
  { path: "/devices", name: "الأجهزة والحسابات المرتبطة", icon: <LaptopOutlined /> },
  { path: "/bans", name: "إدارة الحظر", icon: <StopOutlined /> },
  { path: "/log", name: "سجل العمليات", icon: <HistoryOutlined /> },
];

function PanelLayout() {
  const { session, ready } = useAdminSession();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => { if (ready && !session) nav({ to: "/login" }); }, [ready, session, nav]);
  useEffect(() => {
    if (!session) return;
    getAdminAccess().then(setAccess);
    getAdminName(session.user.id).then(setName);
  }, [session]);

  if (!ready || !session || !access) return <div style={{ padding: 120, textAlign: "center" }}><Spin size="large" /></div>;
  if (access !== "admin") return (
    <Result status="403" title="غير مسموح"
      subTitle={access === "missing" ? "يجب تشغيل ملف الإدارة 009 في قاعدة بيانات فولي أولاً" : "هذا الحساب ليس من الإدارة العليا"}
      extra={<Button onClick={() => adminSignOut()}>تسجيل الخروج</Button>} />
  );

  return (
    <ProLayout
      title="إدارة فولي" logo={<AppstoreOutlined style={{ fontSize: 24, color: "#1677ff" }} />}
      layout="mix" fixSiderbar splitMenus={false}
      location={{ pathname }}
      route={{ path: "/", routes: menu }}
      menuItemRender={(item, dom) => <Link to={item.path as "/"}>{dom}</Link>}
      avatarProps={{
        title: name ?? session.user.email, size: "small",
        render: (_p, dom) => <Dropdown menu={{ items: [{ key: "out", icon: <LogoutOutlined />, label: "تسجيل الخروج", onClick: () => adminSignOut() }] }}>{dom}</Dropdown>,
      }}
    >
      <Outlet />
    </ProLayout>
  );
}
