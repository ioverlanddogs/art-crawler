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
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

export type AdminEnvironment = 'production' | 'preview' | 'development' | 'unknown';
