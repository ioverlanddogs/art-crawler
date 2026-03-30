export type AdminNavItem = {
  href: string;
  label: string;
  badgeCount?: number;
  roles?: string[];
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export type AdminUserInfo = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
};
