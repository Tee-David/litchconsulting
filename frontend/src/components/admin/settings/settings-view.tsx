"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { initialsOf } from "@/components/ui/avatar";
import {
  Loader2,
  Save,
  Upload,
  Building2,
  Landmark,
  ReceiptText,
  ImageIcon,
  Trash2,
  UserPlus,
  Shield,
  Ban,
  CheckCircle2,
  Search,
  Users,
  Settings,
  Mail,
  UserCheck,
  Lock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { Select } from "@/components/ui/select";
import { uploadFile } from "@/lib/upload-client";
import { CURRENCIES } from "@/lib/invoice/money";
import {
  saveOrgSettingsAction,
  createAdminUserAction,
  deleteUserAction,
  toggleUserBanAction,
  changeUserRoleAction,
  bulkDeleteUsersAction,
  bulkToggleBanUsersAction,
  bulkChangeRoleUsersAction,
  updateOwnProfileAction,
  type OrgSettingsInput,
} from "@/app/admin/settings/actions";
import type { User } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/server-user";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-body";

type Placeholders = {
  companyName: string;
  email: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  terms: string;
};

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-hairline bg-paper p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
          <Icon className="size-4.5" />
        </span>
        <div>
          <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
          <p className="mt-0.5 text-xs text-body">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function SettingsView({
  initial,
  placeholders,
  users = [],
  currentUser,
}: {
  initial: OrgSettingsInput;
  placeholders: Placeholders;
  users?: User[];
  currentUser?: SessionUser | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  // Tabs: "profile" | "general" | "users"
  const [activeTab, setActiveTab] = useState<"profile" | "general" | "users">("profile");

  // General Settings State
  const [form, setForm] = useState<OrgSettingsInput>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // My Profile State — the admin is a user too.
  const [profile, setProfile] = useState({ name: currentUser?.name || "", image: currentUser?.image || "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // User Management State
  const [userQuery, setUserQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "client">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "banned">("all");
  
  // Bulk Selection and Actions State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActioning, setBulkActioning] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Add Admin Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: "", email: "", password: "" });
  const [creatingUser, setCreatingUser] = useState(false);

  // Loading states for actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const set = <K extends keyof OrgSettingsInput>(k: K, v: OrgSettingsInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function onLogo(file: File) {
    setUploading(true);
    try {
      const url = await uploadFile(file, "logo");
      set("logoUrl", url);
      toast.success("Logo uploaded — click Save to apply.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    const res = await saveOrgSettingsAction(form);
    setSaving(false);
    if (res.ok) {
      toast.success("Settings saved.");
      router.refresh();
    } else toast.error(res.error || "Could not save.");
  }

  /** Upload the profile picture (shared helper → public URL). */
  async function onAvatar(file: File) {
    setUploadingAvatar(true);
    try {
      const url = await uploadFile(file, "avatar");
      setProfile((p) => ({ ...p, image: url }));
      toast.success("Picture uploaded — click Save to apply.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    const res = await updateOwnProfileAction({ name: profile.name, image: profile.image });
    setSavingProfile(false);
    if (res.ok) {
      toast.success("Profile saved.");
      router.refresh();
    } else toast.error(res.error || "Could not save your profile.");
  }

  // User Actions
  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!newAdmin.name || !newAdmin.email) {
      toast.error("Name and Email are required.");
      return;
    }
    setCreatingUser(true);
    const res = await createAdminUserAction(newAdmin);
    setCreatingUser(false);
    if (res.ok) {
      toast.success(`Admin user "${newAdmin.name}" created successfully.`);
      setNewAdmin({ name: "", email: "", password: "" });
      setShowAddForm(false);
      router.refresh();
    } else {
      toast.error(res.error || "Failed to create user.");
    }
  }

  async function handleToggleBan(userId: string, isBanned: boolean) {
    if (userId === currentUser?.id) {
      toast.error("You cannot ban yourself!");
      return;
    }
    setActionLoading(`ban-${userId}`);
    const res = await toggleUserBanAction(userId, isBanned);
    setActionLoading(null);
    if (res.ok) {
      toast.success(isBanned ? "User banned." : "User unbanned.");
      router.refresh();
    } else {
      toast.error(res.error || "Failed to update user status.");
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    if (userId === currentUser?.id) {
      toast.error("You cannot change your own role!");
      return;
    }
    setActionLoading(`role-${userId}`);
    const res = await changeUserRoleAction(userId, newRole);
    setActionLoading(null);
    if (res.ok) {
      toast.success(`User role changed to ${newRole}.`);
      router.refresh();
    } else {
      toast.error(res.error || "Failed to update user role.");
    }
  }

  async function handleDeleteUser(userId: string, userName: string) {
    if (userId === currentUser?.id) {
      toast.error("You cannot delete yourself!");
      return;
    }
    if (!confirm(`Are you sure you want to delete user "${userName}"? This cannot be undone.`)) {
      return;
    }
    setActionLoading(`delete-${userId}`);
    const res = await deleteUserAction(userId);
    setActionLoading(null);
    if (res.ok) {
      toast.success("User deleted.");
      router.refresh();
    } else {
      toast.error(res.error || "Failed to delete user.");
    }
  }

  // Bulk Handlers
  const handleSelectUser = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(userQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(userQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "banned" && u.banned) ||
      (statusFilter === "active" && !u.banned);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const selectableFilteredUsers = filteredUsers.filter((u) => u.id !== currentUser?.id);
  const isAllSelected =
    selectableFilteredUsers.length > 0 &&
    selectableFilteredUsers.every((u) => selectedIds.includes(u.id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !selectableFilteredUsers.some((u) => u.id === id))
      );
    } else {
      const newSelects = [...selectedIds];
      selectableFilteredUsers.forEach((u) => {
        if (!newSelects.includes(u.id)) {
          newSelects.push(u.id);
        }
      });
      setSelectedIds(newSelects);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected users? This cannot be undone.`)) {
      return;
    }
    setBulkActioning(true);
    const res = await bulkDeleteUsersAction(selectedIds);
    setBulkActioning(false);
    if (res.ok) {
      toast.success(`${selectedIds.length} users deleted successfully.`);
      setSelectedIds([]);
      router.refresh();
    } else {
      toast.error(res.error || "Failed to bulk delete users.");
    }
  };

  const handleBulkToggleBan = async (isBanned: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkActioning(true);
    const res = await bulkToggleBanUsersAction(selectedIds, isBanned);
    setBulkActioning(false);
    if (res.ok) {
      toast.success(`${selectedIds.length} users updated successfully.`);
      setSelectedIds([]);
      router.refresh();
    } else {
      toast.error(res.error || "Failed to update users status.");
    }
  };

  const handleBulkRoleChange = async (role: string) => {
    if (selectedIds.length === 0) return;
    setBulkActioning(true);
    const res = await bulkChangeRoleUsersAction(selectedIds, role);
    setBulkActioning(false);
    if (res.ok) {
      toast.success(`${selectedIds.length} users roles changed successfully.`);
      setSelectedIds([]);
      router.refresh();
    } else {
      toast.error(res.error || "Failed to update users roles.");
    }
  };

  // Pagination Logic
  const totalRows = filteredUsers.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
  const activePage = Math.min(currentPage, totalPages);
  
  const startIndex = (activePage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* Tabs Switcher */}
      <div className="no-scrollbar flex overflow-x-auto overscroll-x-contain touch-pan-x border-b border-hairline">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={cn(
            "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-semibold transition-all sm:px-5",
            activeTab === "profile"
              ? "border-brand text-brand dark:border-white dark:text-white"
              : "border-transparent text-body hover:text-ink"
          )}
        >
          <UserCheck className="size-4" />
          My Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          className={cn(
            "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-semibold transition-all sm:px-5",
            activeTab === "general"
              ? "border-brand text-brand dark:border-white dark:text-white"
              : "border-transparent text-body hover:text-ink"
          )}
        >
          <Settings className="size-4" />
          Organisation & Defaults
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={cn(
            "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-semibold transition-all sm:px-5",
            activeTab === "users"
              ? "border-brand text-brand dark:border-white dark:text-white"
              : "border-transparent text-body hover:text-ink"
          )}
        >
          <Users className="size-4" />
          User Management
        </button>
      </div>

      {activeTab === "profile" && (
        <div className="max-w-2xl">
          <Section
            icon={UserCheck}
            title="My profile"
            description="Your name and picture, as teammates and clients see them."
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-3">
                <div className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-tint font-display text-2xl font-bold text-brand">
                  {profile.image ? (
                    <Image
                      src={profile.image}
                      alt=""
                      fill
                      sizes="96px"
                      className="rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    initialsOf(profile.name, currentUser?.email)
                  )}
                </div>
                <input
                  ref={avatarRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onAvatar(f);
                    e.target.value = "";
                  }}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => avatarRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-50"
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Upload className="size-3.5" />
                    )}
                    {profile.image ? "Change" : "Upload"}
                  </button>
                  {profile.image && (
                    <button
                      type="button"
                      onClick={() => setProfile((p) => ({ ...p, image: "" }))}
                      aria-label="Remove picture"
                      className="grid size-7 place-items-center rounded-lg border border-hairline text-body transition-colors hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <label className={labelCls} htmlFor="profile-name">
                    Full name
                  </label>
                  <input
                    id="profile-name"
                    className={inputCls}
                    value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="profile-email">
                    Email
                  </label>
                  <input
                    id="profile-email"
                    className={cn(inputCls, "cursor-not-allowed opacity-60")}
                    value={currentUser?.email || ""}
                    readOnly
                    disabled
                  />
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                    <Lock className="size-3" />
                    Email and password are managed by sign-in security.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={savingProfile || !profile.name.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                  {savingProfile ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save profile
                </button>
              </div>
            </div>
          </Section>
        </div>
      )}

      {activeTab === "general" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Organisation profile */}
            <Section
              icon={Building2}
              title="Organisation profile"
              description="Appears on invoices, quotes and receipts."
            >
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Company name</label>
                  <input
                    value={form.companyName || ""}
                    onChange={(e) => set("companyName", e.target.value)}
                    placeholder={placeholders.companyName}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Invoice “from” email</label>
                  <input
                    type="email"
                    value={form.invoiceFromEmail || ""}
                    onChange={(e) => set("invoiceFromEmail", e.target.value)}
                    placeholder={placeholders.email}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Default currency</label>
                  <Select
                    value={form.defaultCurrency || "NGN"}
                    onChange={(v) => set("defaultCurrency", v)}
                    searchable
                    aria-label="Default currency"
                    options={CURRENCIES.map((c) => ({
                      value: c.code,
                      label: `${c.symbol} ${c.code} — ${c.label}`,
                    }))}
                  />
                </div>
              </div>
            </Section>

            {/* Branding */}
            <Section
              icon={ImageIcon}
              title="Branding"
              description="Your logo shows on the document header and header bar."
            >
              <div className="flex items-center gap-4">
                <div className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-hairline bg-surface">
                  {form.logoUrl ? (
                    <Image
                      src={form.logoUrl}
                      alt="Logo"
                      fill
                      sizes="96px"
                      className="object-contain p-2"
                      unoptimized
                    />
                  ) : (
                    <ImageIcon className="size-7 text-muted" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onLogo(f);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:opacity-60"
                    >
                      {uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}{" "}
                      Upload logo
                    </button>
                    {form.logoUrl && (
                      <button
                        type="button"
                        onClick={() => set("logoUrl", "")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-body transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="size-4" /> Remove
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted">PNG, JPG or WebP · square works best · up to 25MB.</p>
                </div>
              </div>
            </Section>

            {/* Bank / payment details */}
            <Section
              icon={Landmark}
              title="Payment details"
              description="The bank account shown on invoices for transfers."
            >
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Bank name</label>
                  <input
                    value={form.bankName || ""}
                    onChange={(e) => set("bankName", e.target.value)}
                    placeholder={placeholders.bankName}
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Account name</label>
                    <input
                      value={form.accountName || ""}
                      onChange={(e) => set("accountName", e.target.value)}
                      placeholder={placeholders.accountName}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Account number</label>
                    <input
                      value={form.accountNumber || ""}
                      onChange={(e) => set("accountNumber", e.target.value)}
                      placeholder={placeholders.accountNumber}
                      className={cn(inputCls, "tabular-nums")}
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Invoice defaults */}
            <Section
              icon={ReceiptText}
              title="Invoice defaults"
              description="Default payment terms added to new invoices."
            >
              <div>
                <label className={labelCls}>Default terms</label>
                <textarea
                  value={form.invoiceTerms || ""}
                  onChange={(e) => set("invoiceTerms", e.target.value)}
                  rows={4}
                  placeholder={placeholders.terms}
                  className={cn(inputCls, "resize-y")}
                />
              </div>
            </Section>
          </div>

          <div className="sticky bottom-4 z-10 flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving || uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/20 transition-colors hover:bg-brand-hover disabled:opacity-60 keep-brand"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
              settings
            </button>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="space-y-6">
          {/* User management tools / filters */}
          <div className="flex flex-col gap-4 rounded-card border border-hairline bg-paper p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Search name or email..."
                  className={cn(inputCls, "pl-9")}
                />
              </div>

              <div className="flex gap-2">
                <Select
                  value={roleFilter}
                  onChange={(v) => setRoleFilter(v as typeof roleFilter)}
                  aria-label="Filter by role"
                  className="w-40"
                  options={[
                    { value: "all", label: "All Roles" },
                    { value: "admin", label: "Administrators" },
                    { value: "client", label: "Clients" },
                  ]}
                />

                <Select
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                  aria-label="Filter by status"
                  className="w-40"
                  options={[
                    { value: "all", label: "All Statuses" },
                    { value: "active", label: "Active Only" },
                    { value: "banned", label: "Banned Only" },
                  ]}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover keep-brand"
            >
              <UserPlus className="size-4" />
              Add Administrator
            </button>
          </div>

          {/* Add Admin Drawer/Form Card */}
          {showAddForm && (
            <div className="rounded-card border border-brand/20 bg-brand/5 p-5 animate-in fade-in slide-in-from-top-4 duration-200">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-ink flex items-center gap-2">
                  <Shield className="size-4.5 text-brand" />
                  Create Other Admin User
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
              <form onSubmit={handleCreateAdmin} className="grid gap-4 sm:grid-cols-3 sm:items-end">
                <div>
                  <label className={labelCls}>Name</label>
                  <input
                    type="text"
                    required
                    value={newAdmin.name}
                    onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                    placeholder="e.g. John Doe"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Email address</label>
                  <input
                    type="email"
                    required
                    value={newAdmin.email}
                    onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                    placeholder="e.g. name@litchconsulting.com"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Password (Optional)</label>
                  <div className="relative">
                    <input
                      type="password"
                      value={newAdmin.password}
                      onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                      placeholder="Auto-generated if blank"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="sm:col-span-3 flex justify-end gap-2 mt-2">
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60 keep-brand"
                  >
                    {creatingUser ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Save Administrator
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Bulk Action Bar */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/20 bg-brand/5 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <Users className="size-4 text-brand" />
                <span>{selectedIds.length} users selected</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <select
                  defaultValue=""
                  disabled={bulkActioning}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "admin" || val === "client") {
                      handleBulkRoleChange(val);
                    }
                    e.target.value = "";
                  }}
                  className="rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs font-semibold text-ink outline-none"
                >
                  <option value="" disabled>Change Role...</option>
                  <option value="admin">Make Administrator</option>
                  <option value="client">Make Client</option>
                </select>

                <button
                  type="button"
                  disabled={bulkActioning}
                  onClick={() => handleBulkToggleBan(true)}
                  className="rounded-lg border border-orange-200 bg-orange-50/50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100/50 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-400 cursor-pointer"
                >
                  Ban Selected
                </button>

                <button
                  type="button"
                  disabled={bulkActioning}
                  onClick={() => handleBulkToggleBan(false)}
                  className="rounded-lg border border-green-200 bg-green-50/50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100/50 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-400 cursor-pointer"
                >
                  Unban Selected
                </button>

                <button
                  type="button"
                  disabled={bulkActioning}
                  onClick={handleBulkDelete}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100/50 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                  Delete Selected
                </button>
              </div>
            </div>
          )}

          {/* Users Table */}
          <div className="overflow-hidden rounded-card border border-hairline bg-paper">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface/50 text-xs font-semibold uppercase tracking-wider text-body">
                    <th className="w-12 px-5 py-4">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                        className="size-4 rounded border-hairline text-brand outline-none focus:ring-brand accent-brand cursor-pointer"
                      />
                    </th>
                    <th className="px-5 py-4">User</th>
                    <th className="px-5 py-4">Role</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {paginatedUsers.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    const isPendingAction = actionLoading?.includes(u.id);

                    return (
                      <tr
                        key={u.id}
                        className={cn(
                          "transition-colors hover:bg-surface/30",
                          isSelf && "bg-brand/5 dark:bg-white/5",
                          selectedIds.includes(u.id) && "bg-brand/5 dark:bg-white/5"
                        )}
                      >
                        <td className="w-12 px-5 py-4">
                          {!isSelf ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(u.id)}
                              onChange={() => handleSelectUser(u.id)}
                              className="size-4 rounded border-hairline text-brand outline-none focus:ring-brand accent-brand cursor-pointer"
                            />
                          ) : (
                            <div className="size-4" />
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-xs font-semibold text-brand">
                              {u.image ? (
                                <Image
                                  src={u.image}
                                  alt=""
                                  fill
                                  sizes="36px"
                                  className="rounded-full object-cover"
                                  unoptimized
                                />
                              ) : (
                                initialsOf(u.name, u.email)
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="flex items-center gap-1.5 font-semibold text-ink">
                                {u.name}
                                {isSelf && (
                                  <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand uppercase keep-brand">
                                    You
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-body">
                                <Mail className="size-3 text-muted" />
                                {u.email}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {isSelf ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2.5 py-1 text-xs font-semibold text-brand keep-brand">
                              <Shield className="size-3" />
                              Administrator
                            </span>
                          ) : (
                            <select
                              value={u.role || "client"}
                              disabled={isPendingAction}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                              className="rounded border border-hairline bg-paper px-2 py-1 text-xs font-medium text-ink outline-none focus:border-brand"
                            >
                              <option value="admin">Administrator</option>
                              <option value="client">Client</option>
                            </select>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {u.banned ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                              <Ban className="size-3" />
                              Banned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-600 dark:text-green-400">
                              <UserCheck className="size-3" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!isSelf && (
                              <>
                                <button
                                  type="button"
                                  disabled={isPendingAction}
                                  onClick={() => handleToggleBan(u.id, !u.banned)}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer",
                                    u.banned
                                      ? "border-green-200 bg-green-50/50 text-green-700 hover:bg-green-100/50 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-400"
                                      : "border-orange-200 bg-orange-50/50 text-orange-700 hover:bg-orange-100/50 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-400"
                                  )}
                                >
                                  {u.banned ? "Unban" : "Ban"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isPendingAction}
                                  onClick={() => handleDeleteUser(u.id, u.name)}
                                  className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50/50 p-1.5 text-red-600 transition-colors hover:bg-red-100/50 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 cursor-pointer"
                                  title="Delete User"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-sm text-muted">
                        No users match the active filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalRows > 0 && (
              <div className="flex items-center justify-between border-t border-hairline bg-surface/30 px-5 py-4 text-xs font-semibold text-body">
                <div className="flex items-center gap-2">
                  <span>Rows per page</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded border border-hairline bg-paper px-2 py-1 text-xs font-medium text-ink outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-4">
                  <span>
                    {totalRows === 0 ? "0" : `${startIndex + 1}–${endIndex}`} of {totalRows}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={activePage === 1}
                      onClick={() => setCurrentPage(activePage - 1)}
                      className="grid size-7 place-items-center rounded border border-hairline bg-paper text-ink transition-colors hover:bg-surface disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={activePage === totalPages}
                      onClick={() => setCurrentPage(activePage + 1)}
                      className="grid size-7 place-items-center rounded border border-hairline bg-paper text-ink transition-colors hover:bg-surface disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
